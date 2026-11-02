import {
  claimCleanupJob, renewCleanupLease, prepareCleanupItems, planCleanupBatch,
  recordCleanupRetry, getPortfolioDeletionStatus,
} from './portfolio-cleanup-state.js'
import { createExactObjectGuard } from './portfolio-exact-objects.js'

// Callers must explicitly supply D1 and an R2-compatible { list, delete }
// capability. The connected dispatcher supplies a separately authorized adapter.
const authority = `a.job_id = ? AND a.lease_token = ? AND a.generation = ?`
const argsFor = lease => [lease.jobId, lease.token, lease.generation]
class CleanupError extends Error {
  constructor(code) { super(code); this.code = code }
}
function changes(result) {
  if (!result?.success || ![0, 1].includes(result.meta?.changes)) throw new CleanupError('OUTCOME_UNKNOWN')
  return result.meta.changes
}
function validateKeys(keys, prefix) {
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 100 || new Set(keys).size !== keys.length ||
      keys.some(key => typeof key !== 'string' || !key.startsWith(prefix) || key.includes('\0') ||
        key.length > 1024 || new TextEncoder().encode(key).length > 1024)) throw new CleanupError('OUTCOME_UNKNOWN')
  return keys
}
function listingKeys(page, prefix, limit) {
  if (!page || !Array.isArray(page.objects) || page.objects.length > limit || typeof page.truncated !== 'boolean' ||
      (page.delimitedPrefixes !== undefined && (!Array.isArray(page.delimitedPrefixes) || page.delimitedPrefixes.length)) ||
      (page.truncated && (!page.objects.length || typeof page.cursor !== 'string' || !page.cursor.length || page.cursor.length > 2048))) {
    throw new CleanupError('OUTCOME_UNKNOWN')
  }
  if (!page.objects.length) return []
  return validateKeys(page.objects.map(object => object?.key), prefix)
}
async function authorize(db, lease, prefix) {
  if (!await renewCleanupLease(db, lease)) throw new CleanupError('LEASE_LOST')
  const row = await db.prepare(`SELECT a.prefix FROM portfolio_cleanup_authorized_items a
    WHERE ${authority} AND a.prefix = ? AND NOT EXISTS (
      SELECT 1 FROM portfolio_deletion_prefix_receipts p WHERE p.job_id = a.job_id AND p.prefix = a.prefix)
  `).bind(...argsFor(lease), prefix).first()
  if (!row) throw new CleanupError('LEASE_LOST')
}
async function release(db, lease) {
  return changes(await db.prepare(`UPDATE portfolio_deletion_executions AS e
    SET lease_token = NULL, lease_expires_at = NULL, updated_at = unixepoch()
    WHERE e.job_id = ? AND e.lease_token = ? AND e.generation = ? AND e.lease_expires_at > unixepoch()
      AND EXISTS (SELECT 1 FROM portfolio_deletion_eligibility v WHERE v.job_id = e.job_id AND v.blocker IS NULL)
  `).bind(...argsFor(lease)).run()) === 1
}
async function confirmBatch(db, lease, batch) {
  // An already acknowledged manifest is skipped atomically; never add counters.
  changes(await db.prepare(`INSERT INTO portfolio_deletion_batch_receipts(batch_id, generation, lease_token)
    SELECT ?, a.generation, a.lease_token FROM portfolio_cleanup_authorized_items a
    WHERE ${authority} AND a.prefix = ? AND NOT EXISTS (
      SELECT 1 FROM portfolio_deletion_batch_receipts WHERE batch_id = ?)
  `).bind(batch.id, ...argsFor(lease), batch.prefix, batch.id).run())
  const recorded = await db.prepare(`SELECT r.batch_id FROM portfolio_deletion_batch_receipts r
    JOIN portfolio_deletion_batches b ON b.id = r.batch_id
    JOIN portfolio_cleanup_authorized_items a ON a.job_id = b.job_id AND a.prefix = b.prefix
    WHERE r.batch_id = ? AND ${authority}`).bind(batch.id, ...argsFor(lease)).first()
  if (!recorded) throw new CleanupError('LEASE_LOST')
}
async function confirmEmpty(db, lease, prefix) {
  changes(await db.prepare(`INSERT INTO portfolio_deletion_prefix_receipts(job_id, prefix, generation, lease_token)
    SELECT a.job_id, a.prefix, a.generation, a.lease_token FROM portfolio_cleanup_authorized_items a
    WHERE ${authority} AND a.prefix = ? AND NOT EXISTS (
      SELECT 1 FROM portfolio_deletion_prefix_receipts p WHERE p.job_id = a.job_id AND p.prefix = a.prefix)
  `).bind(...argsFor(lease), prefix).run())
}
async function confirmStorage(db, lease) {
  // The trigger independently requires every allocation's empty-prefix receipt.
  const inserted = changes(await db.prepare(`INSERT INTO portfolio_deletion_storage_receipts(job_id, generation, lease_token)
    SELECT e.job_id, e.generation, e.lease_token FROM portfolio_deletion_executions e
    JOIN portfolio_deletion_eligibility v ON v.job_id = e.job_id AND v.blocker IS NULL
    JOIN portfolio_deletion_inventory i ON i.job_id = e.job_id
    WHERE e.job_id = ? AND e.lease_token = ? AND e.generation = ? AND e.lease_expires_at > unixepoch()
      AND i.allocation_count = (SELECT count(*) FROM portfolio_deletion_prefix_receipts WHERE job_id = e.job_id)
      AND i.allocation_count = (SELECT count(*) FROM portfolio_deletion_items WHERE job_id = e.job_id)
      AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_storage_receipts WHERE job_id = e.job_id)
  `).bind(...argsFor(lease)).run())
  if (!inserted) return false
  await release(db, lease)
  return true
}

// The optional narrowing hook is never an opt-out for reconciled jobs. Detect
// the immutable DB authority independently before claiming a lease or touching
// storage, including when callers omit the exactInventory argument entirely.
async function exactGuardForJob(db, jobId, inventory) {
  const blocked = () => { const error = new Error('Bound exact-object authority is required.'); error.code = 'CONFIGURATION_BLOCKED'; throw error }
  const schema = await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='portfolio_legacy_inventory_bindings'").first()
  if (!schema) { if (inventory !== undefined) blocked(); return null }
  const binding = await db.prepare(`SELECT o.minimum_at_birth,b.reconciliation_id,r.manifest_sha256,r.evidence_json
    FROM portfolio_deletion_jobs j JOIN portfolio_storage_origins o ON o.portfolio_id=j.portfolio_id
    LEFT JOIN portfolio_legacy_inventory_bindings b ON b.job_id=j.id
    LEFT JOIN portfolio_legacy_reconciliations_current r ON r.id=b.reconciliation_id
    WHERE j.id=?`).bind(jobId).first()
  if (binding?.minimum_at_birth !== 0 && !binding?.reconciliation_id) {
    if (inventory !== undefined) blocked()
    return null
  }
  if (!binding?.reconciliation_id || typeof binding.evidence_json !== 'string' || inventory === undefined) blocked()
  let report
  try { report = JSON.parse(binding.evidence_json) } catch { blocked() }
  if (report.id !== binding.reconciliation_id || report.report_type !== 'legacy-portfolio-reconciliation' ||
      report.manifest_sha256 !== binding.manifest_sha256 ||
      JSON.stringify(report.objects) !== JSON.stringify(inventory)) blocked()
  const manifest = new TextEncoder().encode(JSON.stringify({ prefixes: report.prefixes, objects: report.objects }))
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', manifest)), byte => byte.toString(16).padStart(2, '0')).join('')
  if (digest !== binding.manifest_sha256) blocked()
  return createExactObjectGuard(inventory)
}
// Up to 100 preparation rows and maxOperations R2 calls per invocation. Re-list
// the first page after deleting it: cursors need not survive a changing keyset.
// A lease cannot cancel an issued DELETE. Replays remain safe because manifests
// name immutable, exclusively owned keys and ALL writers must already be closed.
export async function executeCleanupStep({ db, r2, jobId, token, pageSize = 100, maxOperations = 4, exactInventory }) {
  if (!r2 || typeof r2.list !== 'function' || typeof r2.delete !== 'function' ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      !Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > 10) {
    throw new Error('Invalid isolated cleanup executor configuration.')
  }
  let lease
  try {
    if (exactInventory !== undefined && (maxOperations < 2 || typeof r2.head !== 'function')) {
      const error = new Error('Exact cleanup requires a two-operation identity/delete budget.')
      error.code = 'CONFIGURATION_BLOCKED'
      throw error
    }
    const exact = await exactGuardForJob(db, jobId, exactInventory)
    lease = await claimCleanupJob(db, jobId, token)
    if (!lease) {
      const status = await getPortfolioDeletionStatus(db, jobId)
      return { state: !status ? 'not_found' : status.phase === 'finalized' ? 'finalized' : status.phase === 'storage_verified' ? 'storage_verified'
        : status.phase === 'blocked' ? 'blocked' : status.phase === 'retry_wait' ? 'retry_wait' : 'busy', error: status?.error || null }
    }
    if (!await prepareCleanupItems(db, lease)) throw new CleanupError('LEASE_LOST')
    let operations = 0
    while (operations < maxOperations) {
      const batch = await db.prepare(`SELECT b.id, b.prefix, b.keys_json FROM portfolio_deletion_batches b
        JOIN portfolio_cleanup_authorized_items a ON a.job_id = b.job_id AND a.prefix = b.prefix
        WHERE ${authority} AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_batch_receipts r WHERE r.batch_id = b.id)
        ORDER BY b.id LIMIT 1`).bind(...argsFor(lease)).first()
      if (batch) {
        const keys = validateKeys(JSON.parse(batch.keys_json), batch.prefix)
        if (exact) {
          const expected = exact.assertBatch(keys, batch.prefix)
          if (operations + 2 > maxOperations) break
          await authorize(db, lease, batch.prefix)
          operations++
          exact.assertHead(await r2.head(keys[0]), expected)
        }
        await authorize(db, lease, batch.prefix)
        operations++
        let result
        try { result = await r2.delete(keys) } catch (error) {
          if (error?.code === 'CONFIGURATION_BLOCKED') throw error
          throw new CleanupError('OUTCOME_UNKNOWN')
        }
        if (result !== undefined) throw new CleanupError('OUTCOME_UNKNOWN')
        await confirmBatch(db, lease, batch)
        continue
      }
      const item = await db.prepare(`SELECT a.prefix FROM portfolio_cleanup_authorized_items a
        WHERE ${authority} AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_prefix_receipts p
          WHERE p.job_id = a.job_id AND p.prefix = a.prefix) ORDER BY a.prefix LIMIT 1`
      ).bind(...argsFor(lease)).first()
      if (!item) {
        if (await confirmStorage(db, lease)) return { state: 'storage_verified' }
        if (!await release(db, lease)) throw new CleanupError('LEASE_LOST')
        return { state: 'pending' }
      }
      await authorize(db, lease, item.prefix)
      operations++
      let page
      try { page = await r2.list({ prefix: item.prefix, limit: pageSize }) }
      catch (error) {
        if (error?.code === 'CONFIGURATION_BLOCKED') throw error
        throw new CleanupError('STORAGE_UNAVAILABLE')
      }
      const keys = listingKeys(page, item.prefix, pageSize)
      if (exact) exact.assertPage(page, item.prefix)
      // No persisted proof/intent unless eligibility and the lease still hold.
      await authorize(db, lease, item.prefix)
      if (!keys.length) {
        if (exact) {
          const receipts = await db.prepare(`SELECT k.value AS key FROM portfolio_deletion_batches b
            JOIN portfolio_deletion_batch_receipts r ON r.batch_id=b.id, json_each(b.keys_json) k
            WHERE b.job_id=? AND b.prefix=?`).bind(lease.jobId, item.prefix).all()
          if (!receipts?.success || !Array.isArray(receipts.results)) throw new CleanupError('OUTCOME_UNKNOWN')
          const recorded = new Set(receipts.results.map(row => row.key))
          for (const key of recorded) exact.assertBatch([key], item.prefix)
          if (exact.keysForPrefix(item.prefix).some(key => !recorded.has(key))) {
            const error = new Error('Missing exact-object cleanup receipts.')
            error.code = 'CONFIGURATION_BLOCKED'
            throw error
          }
        }
        await confirmEmpty(db, lease, item.prefix)
      } else if (!await planCleanupBatch(db, lease, crypto.randomUUID(), item.prefix, exact ? keys.slice(0, 1) : keys)) {
        throw new CleanupError('LEASE_LOST')
      }
    }
    if (!await release(db, lease)) throw new CleanupError('LEASE_LOST')
    return { state: 'pending' }
  } catch (error) {
    // The guarded adapter refused the call before issuing it. Do not turn a
    // revoked policy into an automatic storage retry; preserve all manifests.
    if (error?.code === 'CONFIGURATION_BLOCKED') return { state: 'blocked', error: { code: 'CONFIGURATION_BLOCKED' } }
    const code = ['STORAGE_UNAVAILABLE', 'OUTCOME_UNKNOWN'].includes(error?.code) ? error.code : 'OUTCOME_UNKNOWN'
    // Lost responses leave receipts/manifests discoverable. Never record success
    // from an exception, and never let a stale owner checkpoint a new lease.
    if (lease && error?.code !== 'LEASE_LOST') {
      try {
        if (await recordCleanupRetry(db, lease, code)) return { state: 'retry_wait', error: { code } }
      } catch { /* Preserve unresolved durable state; the next owner reconciles it. */ }
    }
    return { state: 'interrupted', error: { code: 'OUTCOME_UNKNOWN' } }
  }
}
