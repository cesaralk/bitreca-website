import { attestPortfolioInventory } from './portfolio-inventory.js'
import { executeCleanupStep } from './portfolio-cleanup-executor.js'
import { claimFinalizationLease, finalizePortfolioDeletion } from './portfolio-finalization.js'
import { getPortfolioDeletionStatus } from './portfolio-cleanup-state.js'
import { getDeletionAuthorization, guardedCleanupStorage } from './portfolio-deletion-config.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
function confirmed(result) {
  if (!result?.success || !Number.isSafeInteger(result.meta?.changes) || result.meta.changes < 0) throw new Error('Dispatch checkpoint was not confirmed.')
}
async function checkpoint(db, lease, phase, error, delay = 0) {
  const result = await db.prepare(`UPDATE portfolio_deletion_dispatch
    SET phase=?,error_code=?,next_attempt_at=unixepoch()+?,lease_token=NULL,lease_expires_at=NULL,updated_at=unixepoch()
    WHERE job_id=? AND lease_token=? AND generation=? AND lease_expires_at>unixepoch()`
  ).bind(phase, error, delay, lease.jobId, lease.token, lease.generation).run()
  confirmed(result)
  if (result.meta.changes !== 1) throw new Error('Dispatch lease is no longer held.')
}

// The only connected orchestration path. Defaults refuse execution before R2
// access. A dispatch lease coordinates polling; each destructive stage retains
// its own authoritative cleanup/finalization fence and immutable receipts.
export async function runPortfolioDeletionJob(env, jobId) {
  if (!uuid.test(jobId)) return { state: 'not_found' }
  let authorization
  try { authorization = await getDeletionAuthorization(env) } catch { return { state: 'disabled', error: { code: 'CONFIGURATION_BLOCKED' } } }
  if (!authorization) return { state: 'disabled', error: { code: 'CONFIGURATION_BLOCKED' } }
  const operationLimit = env.PORTFOLIO_CLEANUP_R2_OPERATION_LIMIT ?? '2'
  if (!['1', '2'].includes(operationLimit)) return { state: 'disabled', error: { code: 'CONFIGURATION_BLOCKED' } }
  const db = env.bitreca_db, claimToken = token()
  let lease
  try {
    confirmed(await db.prepare(`UPDATE portfolio_deletion_dispatch
      SET lease_token=?,lease_expires_at=unixepoch()+120,generation=generation+1,attempts=attempts+1,updated_at=unixepoch()
      WHERE job_id=? AND phase NOT IN ('blocked','finalized') AND next_attempt_at<=unixepoch()
        AND (lease_token IS NULL OR lease_expires_at<=unixepoch())`).bind(claimToken, jobId).run())
    const row = await db.prepare('SELECT generation FROM portfolio_deletion_dispatch WHERE job_id=? AND lease_token=? AND lease_expires_at>unixepoch()').bind(jobId, claimToken).first()
    if (!row) return { state: 'busy' }
    lease = { jobId, token: claimToken, generation: row.generation }
    const status = await getPortfolioDeletionStatus(db, jobId)
    if (!status) return { state: 'not_found' }
    if (status.phase === 'finalized') {
      await checkpoint(db, lease, 'finalized', null)
      return { state: 'finalized' }
    }
    const inventory = await attestPortfolioInventory(db, authorization.trust, jobId)
    if (inventory.state !== 'attested') {
      const code = status.error?.code
      const waiting = code === 'WRITERS_OPEN'
      await checkpoint(db, lease, waiting ? 'waiting_writers' : 'blocked', waiting ? 'WRITERS_OPEN' : 'INVENTORY_BLOCKED', waiting ? 60 : 0)
      return { state: waiting ? 'waiting_writers' : 'blocked', error: { code: code || 'INVENTORY_BLOCKED' } }
    }
    const r2 = await guardedCleanupStorage(env, authorization)
    const cleanup = await executeCleanupStep({ db, r2, jobId, token: token(), maxOperations: Number(operationLimit), pageSize: 100, exactInventory: inventory.exactInventory })
    if (cleanup.state === 'storage_verified') {
      if (!authorization.finalizationEnabled) {
        await checkpoint(db, lease, 'storage_verified', 'FINALIZATION_DISABLED', 3600)
        return { state: 'storage_verified' }
      }
      const current = await getDeletionAuthorization(env, authorization.revision)
      if (!current?.finalizationEnabled) throw new Error('Finalization approval changed.')
      const finalLease = await claimFinalizationLease(db, jobId, token())
      if (!finalLease) throw new Error('Finalization lease is unavailable.')
      finalLease.authorizationRevision = authorization.revision
      const result = await finalizePortfolioDeletion(db, finalLease)
      if (result.state !== 'finalized') throw new Error('Finalization outcome is unresolved.')
      await checkpoint(db, lease, 'finalized', null)
      return { state: 'finalized' }
    }
    if (cleanup.state === 'finalized') {
      await checkpoint(db, lease, 'finalized', null)
      return { state: 'finalized' }
    }
    if (cleanup.state === 'blocked') {
      const code = cleanup.error?.code === 'CONFIGURATION_BLOCKED' ? 'CONFIGURATION_BLOCKED' : 'INVENTORY_BLOCKED'
      await checkpoint(db, lease, 'blocked', code)
      return { state: 'blocked', error: { code } }
    }
    const retry = !['pending', 'busy'].includes(cleanup.state)
    await checkpoint(db, lease, retry ? 'retry_wait' : 'queued', retry ? 'RETRY_REQUIRED' : null, retry ? 3600 : 5)
    return { state: retry ? 'retry_wait' : 'queued' }
  } catch (error) {
    const configurationBlocked = error?.code === 'CONFIGURATION_BLOCKED'
    if (lease) {
      try { await checkpoint(db, lease, configurationBlocked ? 'blocked' : 'retry_wait',
        configurationBlocked ? 'CONFIGURATION_BLOCKED' : 'RETRY_REQUIRED', configurationBlocked ? 0 : 3600) } catch { /* Existing leases/manifests remain durable. */ }
    }
    return { state: configurationBlocked ? 'blocked' : 'retry_wait', error: { code: configurationBlocked ? 'CONFIGURATION_BLOCKED' : 'RETRY_REQUIRED' } }
  }
}

export async function schedulePortfolioDeletions(env) {
  if (env.PORTFOLIO_SCHEDULE_ENABLED !== 'true') return { state: 'disabled', processed: 0 }
  try {
    if (!await getDeletionAuthorization(env)) return { state: 'disabled', processed: 0 }
    // One job per tick; no customer bucket enumeration or unbounded scan.
    const due = await env.bitreca_db.prepare(`SELECT job_id FROM portfolio_deletion_dispatch
      WHERE phase NOT IN ('blocked','finalized') AND next_attempt_at<=unixepoch()
        AND (lease_token IS NULL OR lease_expires_at<=unixepoch())
      ORDER BY next_attempt_at,job_id LIMIT 1`).all()
    if (!due?.success || !Array.isArray(due.results)) throw new Error('Queue is unavailable.')
    const results = []
    for (const job of due.results) results.push(await runPortfolioDeletionJob(env, job.job_id))
    return { state: 'processed', processed: results.length }
  } catch { return { state: 'unavailable', processed: 0 } }
}

// A retry queues work; it never certifies ownership, closes writers, renews a
// cleanup lease, resets manifests, or performs any R2 operation.
export async function retryPortfolioDeletion(db, jobId) {
  if (!uuid.test(jobId)) return null
  const status = await getPortfolioDeletionStatus(db, jobId)
  if (!status || status.phase === 'finalized') return status
  const result = await db.prepare(`UPDATE portfolio_deletion_dispatch
    SET phase='queued',error_code=NULL,next_attempt_at=0,updated_at=unixepoch()
    WHERE job_id=? AND (lease_token IS NULL OR lease_expires_at<=unixepoch())`).bind(jobId).run()
  confirmed(result)
  return { ...status, retry_queued: result.meta.changes === 1 }
}
