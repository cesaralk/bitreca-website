// SQL-only cleanup state primitives. No R2 calls or scheduler.
const tokenPattern = /^[0-9a-f]{32}$/
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const eligible = `EXISTS (SELECT 1 FROM portfolio_deletion_eligibility v
  WHERE v.job_id = e.job_id AND v.blocker IS NULL)`
const fenced = `e.job_id = ? AND e.lease_token = ? AND e.generation = ?
  AND e.lease_expires_at > unixepoch() AND ${eligible}`
const messages = {
  NOT_PENDING: 'The portfolio is not pending deletion.',
  OWNERSHIP_CONFLICT: 'Storage ownership conflicts require investigation.',
  PROTOCOL_CUTOVER_REQUIRED: 'The tracked-writer cutover has not been confirmed.',
  LEGACY_STORAGE_UNVERIFIED: 'Legacy storage provenance requires verification.',
  UNTRACKED_ALLOCATION: 'Historical allocations lack writer settlement evidence.',
  WRITER_UNCERTAIN: 'An upload writer has an unresolved outcome.',
  WRITERS_OPEN: 'Upload writers have not finished.',
  INVENTORY_INCOMPLETE: 'Complete ownership inventory has not been independently verified.',
  PREPARATION_FAILED: 'Cleanup preparation failed and can be retried.',
  STORAGE_UNAVAILABLE: 'Storage was unavailable; a retry is required.',
  OUTCOME_UNKNOWN: 'The last operation outcome needs reconciliation.',
  FINALIZATION_NOT_READY: 'Cleanup verification evidence requires review before finalization.',
  STORAGE_HISTORY_UNVERIFIED: 'Creation and complete writer history have not been independently verified.',
  INVENTORY_UNVERIFIED: 'The inventory lacks a trusted verification record.',
}
function checkResult(result) {
  if (!result?.success || !Number.isInteger(result.meta?.changes)) throw new Error('Cleanup state could not be confirmed.')
  return result.meta.changes
}
function leaseArgs(lease) {
  if (!lease || !idPattern.test(lease.jobId) || !tokenPattern.test(lease.token) ||
      !Number.isSafeInteger(lease.generation) || lease.generation < 1) throw new Error('Invalid cleanup lease.')
  return [lease.jobId, lease.token, lease.generation]
}
function durationSeconds(value) {
  if (!Number.isInteger(value) || value < 1 || value > 300) throw new Error('Invalid lease duration.')
  return value
}

// Keep the supplied token across response-loss retries. An expired token cannot
// reclaim its lease: a new token AND generation fence are required.
export async function claimCleanupJob(db, jobId, token, duration = 60) {
  if (!idPattern.test(jobId) || !tokenPattern.test(token)) throw new Error('Invalid cleanup claim.')
  durationSeconds(duration)
  checkResult(await db.prepare(`UPDATE portfolio_deletion_executions AS e
    SET lease_token = ?, lease_expires_at = unixepoch() + ?, generation = generation + 1,
        attempt_count = attempt_count + 1, phase = 'preparing', updated_at = unixepoch()
    WHERE e.job_id = ? AND ${eligible} AND e.next_attempt_at <= unixepoch()
      AND (e.lease_token IS NULL OR e.lease_expires_at <= unixepoch())
      AND e.lease_token IS NOT ?
      AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_storage_receipts WHERE job_id = e.job_id)
  `).bind(token, duration, jobId, token).run())
  const row = await db.prepare(`SELECT generation, lease_expires_at FROM portfolio_deletion_executions e
    WHERE e.job_id = ? AND e.lease_token = ? AND e.lease_expires_at > unixepoch() AND ${eligible}
      AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_storage_receipts WHERE job_id = e.job_id)
  `).bind(jobId, token).first()
  return row ? { jobId, token, generation: row.generation, expiresAt: row.lease_expires_at } : null
}

export async function renewCleanupLease(db, lease, duration = 60) {
  durationSeconds(duration)
  return checkResult(await db.prepare(`UPDATE portfolio_deletion_executions AS e
    SET lease_expires_at = max(lease_expires_at, unixepoch() + ?), updated_at = unixepoch()
    WHERE ${fenced}`).bind(duration, ...leaseArgs(lease)).run()) === 1
}

// At most 100 allocation rows per transaction; cursor and inserts commit together.
export async function prepareCleanupItems(db, lease, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid preparation limit.')
  const args = leaseArgs(lease)
  const results = await db.batch([
    db.prepare(`INSERT INTO portfolio_deletion_items(job_id, prefix, generation, lease_token)
      SELECT e.job_id, a.prefix, e.generation, e.lease_token FROM portfolio_deletion_executions e
      JOIN portfolio_deletion_jobs j ON j.id = e.job_id
      JOIN portfolio_storage_allocations a ON a.portfolio_id = j.portfolio_id
      WHERE ${fenced}
        AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_items i WHERE i.job_id = e.job_id AND i.prefix = a.prefix)
      ORDER BY a.prefix LIMIT ?`).bind(...args, limit),
    db.prepare(`UPDATE portfolio_deletion_executions AS e
      SET allocation_cursor = (SELECT max(prefix) FROM portfolio_deletion_items WHERE job_id = e.job_id),
          updated_at = unixepoch() WHERE ${fenced}`).bind(...args),
  ])
  if (results.length !== 2) throw new Error('Cleanup preparation could not be confirmed.')
  const inserted = checkResult(results[0])
  return checkResult(results[1]) === 1 ? { inserted } : null
}

export async function finishCleanupPreparation(db, lease) {
  return checkResult(await db.prepare(`UPDATE portfolio_deletion_executions AS e
    SET phase = 'prepared', lease_token = NULL, lease_expires_at = NULL,
        last_error_code = NULL, next_attempt_at = 0, updated_at = unixepoch()
    WHERE ${fenced} AND (
      SELECT count(*) FROM portfolio_deletion_items WHERE job_id = e.job_id
    ) = (SELECT allocation_count FROM portfolio_deletion_inventory WHERE job_id = e.job_id)
  `).bind(...leaseArgs(lease)).run()) === 1
}

export async function recordCleanupRetry(db, lease, errorCode) {
  if (!['PREPARATION_FAILED', 'STORAGE_UNAVAILABLE', 'OUTCOME_UNKNOWN'].includes(errorCode)) {
    throw new Error('Invalid cleanup error code.')
  }
  return checkResult(await db.prepare(`UPDATE portfolio_deletion_executions AS e
    SET phase = 'retry_wait', retry_count = retry_count + 1,
        next_attempt_at = unixepoch() + min(3600, 60 * (1 << min(retry_count, 6))),
        last_error_code = ?, lease_token = NULL, lease_expires_at = NULL, updated_at = unixepoch()
    WHERE ${fenced}`).bind(errorCode, ...leaseArgs(lease)).run()) === 1
}

// Future trusted listing code supplies exact keys and retains batchId on retry.
// This function neither lists objects nor executes the recorded intent.
export async function planCleanupBatch(db, lease, batchId, prefix, keys) {
  const args = leaseArgs(lease)
  if (!idPattern.test(batchId) || typeof prefix !== 'string' || !Array.isArray(keys) ||
      keys.length < 1 || keys.length > 100 || keys.some(key => typeof key !== 'string' ||
        !key.startsWith(prefix) || key.includes('\0') || key.length > 1024 || new TextEncoder().encode(key).length > 1024) ||
      new Set(keys).size !== keys.length) throw new Error('Invalid cleanup manifest.')
  const json = JSON.stringify([...keys].sort())
  if (new TextEncoder().encode(json).length > 131072) throw new Error('Cleanup manifest is too large.')
  checkResult(await db.prepare(`INSERT INTO portfolio_deletion_batches
      (id, job_id, prefix, keys_json, generation, lease_token)
    SELECT ?, e.job_id, ?, ?, e.generation, e.lease_token FROM portfolio_deletion_executions e
    WHERE ${fenced} AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_batches WHERE id = ?)
  `).bind(batchId, prefix, json, ...args, batchId).run())
  const row = await db.prepare(`SELECT b.job_id, b.prefix, b.keys_json FROM portfolio_deletion_batches b
    JOIN portfolio_deletion_executions e ON e.job_id = b.job_id
    WHERE b.id = ? AND ${fenced}`).bind(batchId, ...args).first()
  if (!row) return null
  if (row.job_id !== lease.jobId || row.prefix !== prefix || row.keys_json !== json) {
    throw new Error('Cleanup manifest identity conflicts with the recorded intent.')
  }
  return { id: batchId, objectCount: keys.length, state: 'planned' }
}

export async function getPortfolioDeletionStatus(db, jobId) {
  const row = await db.prepare(`SELECT j.id, j.portfolio_id, j.created_at, v.blocker,
      e.phase, e.generation, e.attempt_count, e.retry_count, e.next_attempt_at, e.last_error_code,
      e.lease_expires_at, (e.lease_expires_at > unixepoch()) AS lease_active,
      (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id = j.portfolio_id) AS allocations,
      (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id = j.portfolio_id AND writer_state = 'open') AS open_writers,
      (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id = j.portfolio_id AND writer_state = 'uncertain') AS uncertain_writers,
      (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id = j.portfolio_id AND writer_protocol_version = 0) AS untracked_allocations,
      (SELECT count(*) FROM portfolio_deletion_items WHERE job_id = j.id) AS prepared_allocations,
      (SELECT count(*) FROM portfolio_deletion_batches WHERE job_id = j.id) AS planned_batches,
      (SELECT coalesce(sum(json_array_length(keys_json)), 0) FROM portfolio_deletion_batches WHERE job_id = j.id) AS planned_objects,
      (SELECT count(*) FROM portfolio_deletion_prefix_receipts WHERE job_id = j.id) AS empty_prefixes,
      (SELECT coalesce(sum(json_array_length(b.keys_json)), 0) FROM portfolio_deletion_batches b
        JOIN portfolio_deletion_batch_receipts r ON r.batch_id = b.id WHERE b.job_id = j.id) AS confirmed_objects,
      EXISTS (SELECT 1 FROM portfolio_deletion_storage_receipts WHERE job_id = j.id) AS storage_verified,
      (SELECT finalized_at FROM portfolio_deletion_finalizations WHERE job_id = j.id) AS finalized_at,
      EXISTS (SELECT 1 FROM portfolio_deletion_finalizable WHERE job_id = j.id) AS finalizable
    FROM portfolio_deletion_jobs j JOIN portfolio_deletion_executions e ON e.job_id = j.id
    JOIN portfolio_deletion_eligibility v ON v.job_id = j.id WHERE j.id = ?`).bind(jobId).first()
  if (!row) return null
  const finalized = row.finalized_at !== null
  const errorCode = !finalized && (row.blocker || (row.storage_verified && !row.finalizable
    ? 'FINALIZATION_NOT_READY' : !row.storage_verified && row.last_error_code))
  return {
    id: row.id, portfolio_id: row.portfolio_id, created_at: row.created_at,
    phase: finalized ? 'finalized' : row.blocker || errorCode === 'FINALIZATION_NOT_READY' ? 'blocked' : row.storage_verified ? 'storage_verified'
      : row.phase === 'retry_wait' ? 'retry_wait' : row.planned_batches > 0 || row.empty_prefixes > 0 ? 'cleaning' : row.phase,
    eligible_for_preparation: row.blocker === null && !row.storage_verified && !finalized, cleanup_enabled: false,
    eligible_for_finalization: Boolean(row.finalizable) && !finalized,
    finalized_at: row.finalized_at,
    error: errorCode ? { code: errorCode, message: messages[errorCode] || 'Cleanup requires investigation.' } : null,
    progress: { allocations: row.allocations, prepared_allocations: row.prepared_allocations,
      open_writers: row.open_writers, uncertain_writers: row.uncertain_writers,
      untracked_allocations: row.untracked_allocations, planned_batches: row.planned_batches,
      planned_objects: row.planned_objects, empty_prefixes: row.empty_prefixes,
      // Confirmed unique manifest keys, not a count of billable DELETE calls.
      confirmed_objects: row.confirmed_objects, deleted_objects: row.confirmed_objects },
    attempts: row.attempt_count, retries: row.retry_count, next_attempt_at: row.next_attempt_at,
    lease: { active: Boolean(row.lease_active), expires_at: row.lease_expires_at, generation: row.generation },
  }
}
