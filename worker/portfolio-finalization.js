// Internal D1-only operations. Connected dispatch requires separate approval.
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const tokenPattern = /^[0-9a-f]{32}$/
function validateIdentity(jobId, token) {
  if (!idPattern.test(jobId) || !tokenPattern.test(token)) throw new Error('Invalid finalization identity.')
}
function checked(result) {
  // Do not depend on how an adapter counts trigger changes. The immutable
  // receipt readback, rather than a row-count inference, confirms completion.
  if (!result?.success || !Number.isSafeInteger(result.meta?.changes) || result.meta.changes < 0) {
    throw new Error('Finalization outcome could not be confirmed.')
  }
}

// Cleanup claims stop at storage verification. This separate claim reuses the
// same lease/generation fence after independently rechecking ALL prerequisites.
// Retain a cryptographically random token across response-loss retries.
export async function claimFinalizationLease(db, jobId, token, duration = 60) {
  validateIdentity(jobId, token)
  if (!Number.isInteger(duration) || duration < 1 || duration > 300) throw new Error('Invalid finalization lease duration.')
  try {
    checked(await db.prepare(`UPDATE portfolio_deletion_executions AS e
      SET lease_token = ?, lease_expires_at = unixepoch() + ?, generation = generation + 1,
          attempt_count = attempt_count + 1, phase = 'preparing', updated_at = unixepoch()
      WHERE e.job_id = ? AND EXISTS (SELECT 1 FROM portfolio_deletion_finalizable f WHERE f.job_id = e.job_id)
        AND (e.lease_token IS NULL OR e.lease_expires_at <= unixepoch()) AND e.lease_token IS NOT ?
        AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_finalizations WHERE job_id = e.job_id)
    `).bind(token, duration, jobId, token).run())
    const row = await db.prepare(`SELECT e.generation, e.lease_expires_at FROM portfolio_deletion_executions e
      JOIN portfolio_deletion_finalizable f ON f.job_id = e.job_id
      WHERE e.job_id = ? AND e.lease_token = ? AND e.lease_expires_at > unixepoch()
    `).bind(jobId, token).first()
    return row ? { jobId, token, generation: row.generation, expiresAt: row.lease_expires_at } : null
  } catch { throw new Error('Finalization lease could not be confirmed.') }
}

export async function finalizePortfolioDeletion(db, lease) {
  validateIdentity(lease?.jobId, lease?.token)
  if (!Number.isSafeInteger(lease.generation) || lease.generation < 1) throw new Error('Invalid finalization lease generation.')
  try {
    // One SQLite statement: the validated receipt's trigger deletes the row and
    // releases the lease atomically. Any failure rolls back all three changes.
    const authorizationClause = lease.authorizationRevision === undefined ? '' : `AND EXISTS (
      SELECT 1 FROM portfolio_deletion_runtime_policy WHERE id=1 AND cleanup_enabled=1 AND finalization_enabled=1 AND revision=?)`
    if (lease.authorizationRevision !== undefined && (!Number.isSafeInteger(lease.authorizationRevision) || lease.authorizationRevision < 1)) {
      throw new Error('Invalid finalization authorization.')
    }
    checked(await db.prepare(`INSERT INTO portfolio_deletion_finalizations
        (job_id, portfolio_id, generation, lease_token, storage_verified_at)
      SELECT f.job_id, f.portfolio_id, e.generation, e.lease_token, f.storage_verified_at
      FROM portfolio_deletion_finalizable f JOIN portfolio_deletion_executions e ON e.job_id = f.job_id
      WHERE f.job_id = ? AND e.lease_token = ? AND e.generation = ? AND e.lease_expires_at > unixepoch()
        AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_finalizations WHERE job_id = f.job_id)
        ${authorizationClause}
    `).bind(lease.jobId, lease.token, lease.generation, ...(lease.authorizationRevision === undefined ? [] : [lease.authorizationRevision])).run())
    // A replay only acknowledges permanent evidence; it needs no fresh lease
    // because it cannot delete another row or recreate an operation permit.
    const receipt = await db.prepare(`SELECT job_id, portfolio_id, storage_verified_at, finalized_at
      FROM portfolio_deletion_finalizations WHERE job_id = ?`).bind(lease.jobId).first()
    if (receipt) return { state: 'finalized', receipt }
    const readiness = await db.prepare(`SELECT
      EXISTS (SELECT 1 FROM portfolio_deletion_jobs WHERE id = ?) AS job_exists,
      EXISTS (SELECT 1 FROM portfolio_deletion_finalizable WHERE job_id = ?) AS ready`
    ).bind(lease.jobId, lease.jobId).first()
    return { state: !readiness?.job_exists ? 'not_found' : readiness.ready ? 'stale_lease' : 'blocked',
      error: { code: readiness?.ready ? 'LEASE_LOST' : 'FINALIZATION_NOT_READY' } }
  } catch {
    return { state: 'unavailable', error: { code: 'FINALIZATION_UNCONFIRMED' } }
  }
}
