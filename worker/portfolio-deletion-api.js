import { deletionCapabilities, inventoryTrustFromEnvironment } from './portfolio-deletion-config.js'
import { getPortfolioDeletionStatus } from './portfolio-cleanup-state.js'
import { registerStorageProtocolVerification } from './portfolio-inventory.js'
import { retryPortfolioDeletion } from './portfolio-deletion-workflow.js'
import { registerLegacyReconciliation } from './portfolio-legacy-reconciliation.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const dispatchMessages = {
  CONFIGURATION_BLOCKED: 'Execution is paused until resource and signing configuration is approved.',
  WRITERS_OPEN: 'Waiting for registered upload writers to finish. Age alone cannot settle a writer.',
  INVENTORY_BLOCKED: 'Complete trusted ownership and writer history require verification.',
  RETRY_REQUIRED: 'The last execution could not be confirmed. Durable evidence was retained for a safe retry.',
  FINALIZATION_DISABLED: 'Storage is verified empty. Finalization requires separate authorization.',
}
export async function getPortfolioDeletionAdminStatus(env, jobId, capabilities) {
  const job = await getPortfolioDeletionStatus(env.bitreca_db, jobId)
  if (!job) return null
  // Historical receipts are displayed as history only, never as current authority.
  const historicalTable = await env.bitreca_db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='portfolio_legacy_deletion_finalizations'").first()
  if (historicalTable) {
    const historical = await env.bitreca_db.prepare('SELECT job_id FROM portfolio_legacy_deletion_finalizations WHERE job_id=?').bind(jobId).first()
    if (historical) return { ...job, phase: 'finalized', error: null, cleanup_enabled: false,
      historicalAuthorization: 'legacy-bridge', dispatch: { phase: 'finalized', attempts: 0, next_attempt_at: 0, active: false } }
  }
  const dispatch = await env.bitreca_db.prepare(`SELECT phase,attempts,next_attempt_at,error_code,
    (lease_expires_at>unixepoch()) AS active FROM portfolio_deletion_dispatch WHERE job_id=?`).bind(jobId).first()
  if (!dispatch) throw new Error('Deletion dispatch is unavailable.')
  const configuration = capabilities || await deletionCapabilities(env)
  // A dispatch checkpoint never replaces permanent receipts or erases a
  // substantive ownership/writer blocker. Tokens and object keys stay private.
  if (job.phase !== 'finalized') {
    if (job.error?.code === 'WRITERS_OPEN' && dispatch.phase === 'waiting_writers') job.phase = 'waiting_writers'
    else if (job.phase !== 'blocked' && ['blocked','retry_wait','storage_verified'].includes(dispatch.phase)) job.phase = dispatch.phase
    if ((!job.error || dispatch.error_code === 'FINALIZATION_DISABLED') && dispatch.error_code) {
      job.error = { code: dispatch.error_code, message: dispatchMessages[dispatch.error_code] || 'Execution requires review.' }
    }
  }
  return { ...job, cleanup_enabled: configuration.cleanupEnabled, dispatch: { phase: dispatch.phase,
    attempts: dispatch.attempts, next_attempt_at: dispatch.next_attempt_at, active: Boolean(dispatch.active) } }
}
async function smallJSON(request) {
  if (!request.body) throw new Error('Missing body.')
  const reader = request.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 32768) { await reader.cancel(); return null }
      chunks.push(value)
    }
    const data = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(data))
  } finally { reader.releaseLock() }
}

// Called only AFTER the main Worker's admin authentication and Origin checks.
// HTTP endpoints inspect/import signed evidence or enqueue a retry. They never
// invoke the R2 executor or finalization directly.
export async function handlePortfolioDeletionAdmin(request, env, url) {
  if (url.pathname === '/api/admin/portfolio-deletion-capabilities' && request.method === 'GET') {
    return response({ success: true, ...(await deletionCapabilities(env)) })
  }
  if (url.pathname === '/api/admin/portfolio-deletion-jobs' && request.method === 'GET') {
    const before = url.searchParams.get('before')
    if (before && !uuid.test(before)) return response({ success: false, message: 'Invalid job cursor.' }, 400)
    try {
      const rows = await env.bitreca_db.prepare(`SELECT id FROM portfolio_deletion_jobs
        WHERE (? IS NULL OR (created_at,id)<(SELECT created_at,id FROM portfolio_deletion_jobs WHERE id=?))
        ORDER BY created_at DESC,id DESC LIMIT 10`).bind(before, before).all()
      if (!rows.success) throw new Error('Jobs unavailable.')
      const jobs = [], capabilities = await deletionCapabilities(env)
      for (const item of rows.results) jobs.push(await getPortfolioDeletionAdminStatus(env, item.id, capabilities))
      return response({ success: true, jobs: jobs.filter(Boolean), nextCursor: rows.results.length === 10 ? rows.results.at(-1).id : null })
    } catch { return response({ success: false, message: 'Deletion history is unavailable. Please retry.' }, 503) }
  }
  const retry = url.pathname.match(/^\/api\/admin\/portfolio-deletion-jobs\/([0-9a-f-]{36})\/retry$/)
  if (retry && request.method === 'POST') {
    if (!uuid.test(retry[1])) return response({ success: false, message: 'Invalid job ID.' }, 400)
    try {
      const job = await retryPortfolioDeletion(env.bitreca_db, retry[1])
      return job ? response({ success: true, message: job.phase === 'finalized' ? 'Deletion was already finalized.'
        : job.retry_queued ? 'Retry requested. Safety checks will run again; no ownership or writer evidence was changed.'
          : 'A worker currently holds this job. Wait for its current operation, then recheck before requesting another retry.', job }, 202)
        : response({ success: false, message: 'Deletion job not found.' }, 404)
    } catch { return response({ success: false, message: 'Could not confirm the retry. Job evidence was preserved.' }, 503) }
  }
  if (url.pathname === '/api/admin/portfolio-legacy-reconciliation' && request.method === 'POST') {
    if (env.PORTFOLIO_LEGACY_RECONCILIATION_IMPORT_ENABLED !== 'true') return response({ success: false, message: 'Legacy reconciliation import is disabled.' }, 503)
    try {
      const trust = await inventoryTrustFromEnvironment(env), body = await smallJSON(request)
      if (!body) return response({ success: false, message: 'Evidence package exceeds the request limit.' }, 413)
      if (typeof body.payload !== 'string' || typeof body.signature_base64 !== 'string' || body.signature_base64.length > 100 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(body.signature_base64)) throw new Error('Invalid legacy evidence.')
      const result = await registerLegacyReconciliation(env.bitreca_db, trust,
        { payload: body.payload, signature: Uint8Array.from(atob(body.signature_base64), char => char.charCodeAt(0)) })
      return result.state === 'recorded' ? response({ success: true, id: result.id, message: 'Distinct signed reconciliation recorded. Portfolio publication is unchanged.' })
        : response({ success: false, message: 'Reconciliation could not be verified against exact current ownership, writers and policy.' }, 409)
    } catch { return response({ success: false, message: 'Legacy reconciliation import was refused.' }, 400) }
  }
  if (url.pathname === '/api/admin/portfolio-protocol-evidence' && request.method === 'POST') {
    if (env.PORTFOLIO_EVIDENCE_IMPORT_ENABLED !== 'true') return response({ success: false, message: 'Evidence import is disabled.' }, 503)
    try {
      const trust = await inventoryTrustFromEnvironment(env)
      const body = await smallJSON(request)
      if (!body) return response({ success: false, message: 'Evidence package exceeds the request limit.' }, 413)
      if (typeof body.payload !== 'string' || typeof body.signature_base64 !== 'string' || body.signature_base64.length > 100 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(body.signature_base64)) throw new Error('Invalid evidence.')
      const result = await registerStorageProtocolVerification(env.bitreca_db, trust,
        { payload: body.payload, signature: Uint8Array.from(atob(body.signature_base64), char => char.charCodeAt(0)) })
      return result.state === 'recorded' ? response({ success: true, id: result.id, message: 'Signed protocol evidence was verified and recorded.' })
        : response({ success: false, message: 'Evidence could not be verified against the pinned trust and current protocol policy.' }, 409)
    } catch { return response({ success: false, message: 'Evidence import was refused. Check the pinned key, scope, and signed package.' }, 400) }
  }
  return null
}
