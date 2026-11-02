// GET/SELECT only. No arbitrary endpoints, SQL, write methods or secret outputs.
import assert from 'node:assert/strict'
import { readFile, open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import process from 'node:process'
import { sandboxReadCredential, latestSandboxDeployment } from './verify-sandbox-deployment.mjs'
import { recoveryTarget } from './generation3-recovery.mjs'
import { readStateSQL } from './execute-generation3-recovery.mjs'

const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
const release = join(review, 'solo-generation3-pinned-20261029')
const prior = join(review, 'solo-owner-enrollment-plan-20261027')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
const start = '2026-10-27T22:33:00.047Z'
const ownerReceived = '2026-10-27T23:18:14.637Z'
const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--read-only-existing' && args[1] === '--approved-audit-read'), 'Default plan; remote reads require both explicit scope flags')
if (args.length === 0) {
  console.log(JSON.stringify({ planOnly: true, intervalStart: start, baselineQualification: 'Last retained provider object inventory; multipart/token provider timestamps absent',
    accountAuditRequiresApproval: true, credentialInventory: 'Previously 403; do not retry or change permissions', writes: false }, null, 2))
  process.exit(0)
}
const completion = await readJSON(join(release, 'deployment-completion.json'))
const historical = await readJSON(join(prior, 'writer-authority-gaps-20261028.json'))
const bucketBaseline = await readJSON(join(prior, 'object-writer-reconciliation-20261028.json'))
const checks = await readJSON(join(review, 'solo-settlement-review-20261028/owner-reported-checks.json'))
assert.equal(bucketBaseline.at, start); assert.equal(checks.received_at, ownerReceived)
assert.equal(bucketBaseline.bucket, recoveryTarget.bucket); assert.equal(bucketBaseline.account, recoveryTarget.account)
const candidate = join(release, 'candidate'), mainConfig = await readJSON(join(candidate, 'main.wrangler.jsonc'))
const hostingConfig = await readJSON(join(candidate, 'hosting.wrangler.jsonc'))
const credential = await sandboxReadCredential(join(candidate, 'main.wrangler.jsonc'))
const base = `/accounts/${recoveryTarget.account}`
const collectedFrom = new Date().toISOString()
const requests = []
async function request(path, sql, permitDenied = false) {
  assert.ok(path.startsWith(base + '/'), 'Exact account only')
  assert.ok(!sql || sql === readStateSQL, 'Only fixed read-only SQL permitted')
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, { method: sql ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, ...(sql ? { body: JSON.stringify({ sql }) } : {}), signal: AbortSignal.timeout(30000) })
  requests.push({ path, method: sql ? 'POST:SELECT' : 'GET', httpStatus: response.status })
  if (permitDenied && [401, 403].includes(response.status)) return { denied: response.status }
  assert.ok(response.ok, `Read-only HTTP ${response.status}; stop without retry`)
  const data = await response.json(); assert.equal(data.success, true)
  return data
}
const auditEnd = new Date().toISOString()
const audit = { since: start, before: auditEnd, permission: 'Explicit owner approval in current session', pages: [], records: [], completePagination: false,
  limitation: 'Account configuration events only; not complete PutObject/multipart data-access history, and not proof of all user-scoped token activity' }
let cursor = null
const cursors = new Set()
for (let page = 0; page < 20; page++) {
  const query = new URLSearchParams({ since: start, before: auditEnd, direction: 'asc', limit: '1000' })
  if (cursor) query.set('cursor', cursor)
  const data = await request(base + '/logs/audit?' + query, null, true)
  if (data.denied) { audit.httpStatus = data.denied; audit.blocker = 'Existing credential cannot read account audit logs; no retry, fallback, credential or permission change'; break }
  assert.ok(Array.isArray(data.result))
  audit.pages.push({ returned: data.result.length, hasNextCursor: Boolean(data.result_info?.cursor) })
  for (const row of data.result) {
    const uri = String(row.raw?.uri || '').split('?')[0]
    const product = String(row.resource?.product || '')
    const payload = JSON.stringify(row.resource?.request || {}) + JSON.stringify(row.resource?.response || {})
    const relevant = /worker|r2|token|api.?key|member|role|permission|d1/i.test(product + ' ' + uri)
    if (!relevant) continue
    const worker = uri.match(/\/workers\/(?:scripts|services)\/([^/]+)/)?.[1] || null
    audit.records.push({ id: row.id, time: row.action?.time, actionType: row.action?.type, actionResult: row.action?.result,
      method: row.raw?.method, httpStatus: row.raw?.status_code, product, resourceType: row.resource?.type,
      resourceIdSha256: sha(String(row.resource?.id || '')), actorContext: row.actor?.context, actorType: row.actor?.type,
      worker, exactSandboxBucketMentioned: (uri + payload + String(row.resource?.id || '')).includes(recoveryTarget.bucket),
      exactSandboxDatabaseMentioned: (uri + payload + String(row.resource?.id || '')).includes(recoveryTarget.databaseId),
      bindingPayloadPresent: /"(?:bindings|r2_buckets)"\s*:/.test(payload),
      payloadRetained: false, secretValuesRetained: false })
  }
  const next = data.result_info?.cursor
  if (!next || data.result.length === 0) { audit.completePagination = true; break }
  assert.ok(!cursors.has(next), 'Repeated audit cursor; no completeness claim')
  cursors.add(next); cursor = next
}
const auditPath = join(release, 'evidence', `writer-continuity-audit-${Date.now()}.json`)
const auditFile = await open(auditPath, 'wx')
try { await auditFile.writeFile(JSON.stringify({ target: recoveryTarget, audit }, null, 2) + '\n'); await auditFile.sync() } finally { await auditFile.close() }
assert.notEqual(audit.httpStatus, 401, 'Authentication failed; stop without further API calls or retry')
const workers = [], discrepancies = []
for (const expected of completion.workers) {
  assert.ok(['bitreca-main-delete-sandbox-20261025', 'bitreca-hosting-delete-sandbox-20261025'].includes(expected.Name))
  const path = base + '/workers/scripts/' + expected.Name
  const historyData = (await request(path + '/deployments')).result
  const histories = historyData.deployments
  const current = latestSandboxDeployment(histories)
  if (current.versions[0].version_id !== expected.Version) discrepancies.push({ kind: 'ACTIVE_VERSION_CHANGED', worker: expected.Name })
  const relevantDeployments = histories.filter(row => Date.parse(row.created_on) >= Date.parse(start)).map(row => ({ id: row.id, created_on: row.created_on, source: row.source, versions: row.versions }))
  for (const row of relevantDeployments) if (row.id !== expected.Deployment || row.versions.some(version => version.version_id !== expected.Version)) discrepancies.push({ kind: 'ADDITIONAL_DEPLOYMENT_REQUIRES_RECONCILIATION', worker: expected.Name, deployment: row })
  const listedVersions = (await request(path + '/versions?page=1&per_page=100')).result
  assert.ok(Array.isArray(listedVersions.items), 'Version list shape unavailable; no completeness claim')
  const versionCount = listedVersions.items.length
  const versionIds = new Set([expected.Version, ...listedVersions.items.filter(row => Date.parse(row.metadata?.created_on || row.created_on) >= Date.parse(start)).map(row => row.id),
    ...relevantDeployments.flatMap(row => row.versions.map(item => item.version_id))])
  const priorVersions = historical.histories.find(row => row.worker === expected.Name)?.versions || []
  const versionChecks = []
  for (const id of versionIds) {
    const version = (await request(path + '/versions/' + id)).result
    const bindings = version.resources?.bindings
    assert.ok(Array.isArray(bindings))
    const vars = Object.fromEntries(bindings.filter(row => row.type === 'plain_text').map(row => [row.name, row.text]))
    const r2 = bindings.filter(row => row.type === 'r2_bucket').map(row => ({ name: row.name, bucket: row.bucket_name }))
    const d1 = bindings.filter(row => row.type === 'd1').map(row => ({ name: row.name, database: row.database_id || row.id }))
    const frozen = vars.PORTFOLIO_STAGING_MUTATIONS_FROZEN === 'true'
    const disabled = ['DELETE_REQUESTS', 'CLEANUP', 'FINALIZATION', 'SCHEDULE', 'EVIDENCE_IMPORT'].every(flag => vars['PORTFOLIO_' + flag + '_ENABLED'] !== 'true')
    if (!frozen || !disabled || r2.length !== 1 || r2[0].bucket !== recoveryTarget.bucket || d1.length !== 1 || d1[0].database !== recoveryTarget.databaseId) discrepancies.push({ kind: 'UNSAFE_OR_DIFFERENT_VERSION_CONFIGURATION', worker: expected.Name, id })
    if (id !== expected.Version && !priorVersions.some(row => row.id === id)) discrepancies.push({ kind: 'UNRECORDED_UPLOADED_VERSION', worker: expected.Name, id })
    versionChecks.push({ id, frozen, deletionControlsDisabled: disabled, r2, d1, knownBaselineVersion: priorVersions.some(row => row.id === id), matchesCompletedDeployment: id === expected.Version })
  }
  const settings = (await request(path + '/settings')).result
  const expectedConfig = expected.Name.includes('main-') ? mainConfig : hostingConfig
  const liveVars = Object.fromEntries(settings.bindings.filter(row => row.type === 'plain_text').map(row => [row.name, row.text]))
  for (const [name, value] of Object.entries(expectedConfig.vars)) if (liveVars[name] !== value) discrepancies.push({ kind: 'CURRENT_VARIABLE_DRIFT', worker: expected.Name, name })
  const exposure = (await request(path + '/subdomain')).result
  const schedules = (await request(path + '/schedules')).result
  const routes = (await request(`${base}/workers/services/${expected.Name}/environments/production/routes?show_zonename=true`)).result
  if (exposure.enabled !== false || exposure.previews_enabled !== false || schedules.schedules?.length !== 0 || routes.length !== 0) discrepancies.push({ kind: 'PUBLIC_ACCESS_OR_SCHEDULE_DRIFT', worker: expected.Name })
  const after = latestSandboxDeployment((await request(path + '/deployments')).result.deployments)
  assert.equal(after.id, current.id, 'Deployment changed during read')
  workers.push({ name: expected.Name, activeVersion: current.versions[0].version_id, trafficPercentage: current.versions[0].percentage,
    intervalDeployments: relevantDeployments, listedVersions: versionCount, versionChecks,
    deploymentHistoryCoversBaseline: histories.some(row => Date.parse(row.created_on) <= Date.parse(start)),
    versionPaginationComplete: versionCount < 100, privateAccess: exposure.enabled === false && exposure.previews_enabled === false && routes.length === 0,
    schedules: schedules.schedules?.length, liveExpectedVarsMatch: Object.entries(expectedConfig.vars).every(([name, value]) => liveVars[name] === value) })
}
const d1 = (await request(`${base}/d1/database/${recoveryTarget.databaseId}/query`, readStateSQL)).result
assert.ok(d1.length === 1 && d1[0].success && d1[0].meta.rows_written === 0 && d1[0].results.length === 1)
const state = JSON.parse(d1[0].results[0].snapshot)
if (JSON.stringify(state) !== JSON.stringify(completion.state)) discrepancies.push({ kind: 'D1_STATE_CHANGED_SINCE_DEPLOYMENT' })
const result = { observedFrom: collectedFrom, observedThrough: new Date().toISOString(), target: recoveryTarget,
  baseline: { providerBucketInventoryAt: start, ownerStatementsReceivedAt: ownerReceived, originalMultipartTokenProviderTimestamp: null,
    qualification: 'Exact last provider multipart/token checkpoint cannot be reconstructed; received_at is not provider inspection time' },
  generation3DeploymentVerifiedAt: new Date(completion.verifiedAt * 1000).toISOString(), auditReference: auditPath, audit, workers,
  currentD1: { protocol: state.protocol, generation: state.state[0].generation, revision: state.runtime[0].revision,
    cleanup: state.runtime[0].cleanup_enabled, finalization: state.runtime[0].finalization_enabled,
    portfolios: state.portfolios, allocations: state.allocations, epochs: state.epochs, matchesDeploymentReceipt: JSON.stringify(state) === JSON.stringify(completion.state) },
  discrepancies, requests,
  unresolved: ['Direct R2 object/multipart operations are not excluded by account configuration audit logs',
    'Current incomplete multipart-upload state has not been reread through S3',
    'Complete current credential/user-token inventory was previously permission-restricted; no new inventory or permission changes attempted',
    'Additional/deleted writer bindings and external tools require complete interval records or factual owner reconciliation; current two-Worker snapshots alone cannot prove absence'],
  decision: 'BLOCKED', legacy_writers_settled: false, remoteMutations: false, signed: false, imported: false }
const bytes = JSON.stringify(result, null, 2) + '\n'
const path = join(release, 'evidence', `writer-continuity-readonly-${Date.now()}.json`)
const file = await open(path, 'wx')
try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
console.log(JSON.stringify({ path, sha256: sha(bytes), baseline: result.baseline, observedThrough: result.observedThrough,
  auditHttpStatus: audit.httpStatus || 200, auditPages: audit.pages, auditRecords: audit.records, auditPaginationComplete: audit.completePagination,
  workers, currentD1: result.currentD1, discrepancies, decision: result.decision, legacy_writers_settled: false }, null, 2))
