// Two exact production Workers, one exact DB and bucket. SELECT/GET ONLY.
import assert from 'node:assert/strict'
import { writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { sandboxReadCredential, latestSandboxDeployment } from './verify-sandbox-deployment.mjs'
const account = '4ec868eac2a3b9127531ad39d2501f15', database = '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
const releasePreflight = process.argv.includes('--release-preflight')
assert.ok(process.argv.slice(2).every(arg => ['--read-only', '--release-preflight'].includes(arg)))
const output = releasePreflight ? 'C:/Users/cezar/Desktop/bitreca-deletion-review/production-release-preflight-20261030.json'
  : 'C:/Users/cezar/Desktop/bitreca-deletion-review/production-deletion-readonly-20261029.json'
if (!process.argv.includes('--read-only')) { console.log('PLAN ONLY: exact production identity, migration, six-row and two-Worker read-only snapshot; --release-preflight additionally reads missing authorization/queue facts and the exact storage-identity control object. Never writes Cloudflare.'); process.exit(0) }
await assert.rejects(access(output), error => error.code === 'ENOENT')
const configPath = 'C:/Users/cezar/Desktop/bitreca-deletion-review/solo-owner-pinned-20261027/candidate/main.wrangler.jsonc'
const credential = await sandboxReadCredential(configPath)
const request = async (path, sql) => {
  if (sql) assert.ok(/^SELECT\b/.test(sql) && !sql.includes(';'))
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, { method: sql ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, ...(sql ? { body: JSON.stringify({ sql }) } : {}), signal: AbortSignal.timeout(30000) })
  assert.ok(response.ok, `Read-only HTTP ${response.status}; stop without retry`)
  const body = await response.json(); assert.equal(body.success, true)
  return body.result
}
const base = '/accounts/' + account
assert.equal((await request(base)).id, account)
const db = await request(base + '/d1/database/' + database)
assert.equal(db.uuid, database); assert.equal(db.name, 'bitreca-db')
assert.equal((await request(base + '/r2/buckets/bitreca-media')).name, 'bitreca-media')
const query = async sql => {
  const rows = await request(base + '/d1/database/' + database + '/query', sql)
  assert.ok(rows.length === 1 && rows[0].success && rows[0].meta.rows_written === 0)
  return rows[0].results
}
const schema = await query('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')
const migrations = await query('SELECT * FROM d1_migrations ORDER BY id')
const selector = "SELECT id FROM portfolios WHERE slug IN ('cezar','rona','taline','hadeel','rahaf','roua')"
const portfolios = await query("SELECT id,name,slug,storage_prefix,status FROM portfolios WHERE slug IN ('cezar','rona','taline','hadeel','rahaf','roua') ORDER BY id")
const history = {}
for (const [table, column] of (releasePreflight ? [] : [['portfolio_storage_allocations', 'portfolio_id'], ['portfolio_storage_origins', 'portfolio_id'], ['portfolio_storage_allocation_events', 'portfolio_id'], ['portfolio_deletion_jobs', 'portfolio_id']])) {
  if (schema.some(row => row.type === 'table' && row.name === table)) history[table] = await query(`SELECT * FROM ${table} WHERE ${column} IN (${selector})`)
}
const authorization = {}
if (releasePreflight) {
  for (const [table, columns] of [
    ['admin_auth_state', 'admin_id,auth_version'], ['portfolio_storage_writer_policy', '*'],
    ['portfolio_storage_authorization_state', '*'], ['portfolio_storage_authorization_policies', '*'],
    ['portfolio_storage_key_revocations', '*'], ['portfolio_deletion_runtime_policy', '*'],
    ['portfolio_storage_protocol_verifications', 'id,storage_scope,signer_sha256,verified_at'],
  ]) if (schema.some(row => row.type === 'table' && row.name === table)) authorization[table] = await query(`SELECT ${columns} FROM ${table}`)
  authorization.queue = await query(`SELECT j.id,j.portfolio_id,j.state,p.deletion_requested_at,
    (f.job_id IS NOT NULL) AS protected_finalized,(l.job_id IS NOT NULL) AS historically_legacy_finalized
    FROM portfolio_deletion_jobs j LEFT JOIN portfolios p ON p.id=j.portfolio_id
    LEFT JOIN portfolio_deletion_finalizations f ON f.job_id=j.id
    LEFT JOIN portfolio_legacy_deletion_finalizations l ON l.job_id=j.id ORDER BY j.created_at,j.id`)
  authorization.marked = await query('SELECT id,slug,deletion_requested_at FROM portfolios WHERE deletion_requested_at IS NOT NULL ORDER BY id')
  authorization.unsettledWriters = await query("SELECT portfolio_id,count(*) AS n FROM portfolio_storage_allocations WHERE writer_state IS NOT 'closed' OR writer_closed_at IS NULL OR writer_closed_at>unixepoch() GROUP BY portfolio_id")
  authorization.sixOrigins = await query('SELECT portfolio_id,minimum_at_birth,epoch_id FROM portfolio_storage_origins WHERE portfolio_id BETWEEN 5 AND 10 ORDER BY portfolio_id')
}
const workers = []
for (const name of ['bitreca-website', 'bitreca-portfolio-hosting']) {
  const path = base + '/workers/scripts/' + name
  const deployments = await request(path + '/deployments'), settings = await request(path + '/settings')
  const allowedVars = /^(PORTFOLIO_(ENVIRONMENT|BUCKET_NAME|DATABASE_ID|STORAGE_SCOPE|AUTHORIZATION_.*|OPERATOR_.*|DEPLOYMENT_SHA256|.*_ENABLED|PRODUCTION_CLEANUP_APPROVED)|ADMIN_AUTH_VERSION)$/
  workers.push({ name, deployments, secretNames: releasePreflight ? settings.bindings.filter(row => row.type === 'secret_text').map(row => row.name).sort() : undefined,
    bindings: settings.bindings.filter(row => row.type === 'd1' || row.type === 'r2_bucket' || (row.type === 'plain_text' && allowedVars.test(row.name))),
    schedules: await request(path + '/schedules') })
}
let storageIdentity
if (releasePreflight) {
  // Exact control-object GET, using the same endpoint as installed Wrangler getR2Object.
  const response = await fetch(`https://api.cloudflare.com/client/v4${base}/r2/buckets/bitreca-media/objects/__portfolioforest_control__/storage-identity`, {
    method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${credential}` }, signal: AbortSignal.timeout(30000) })
  storageIdentity = { key: '__portfolioforest_control__/storage-identity', httpStatus: response.status,
    exists: response.status === 404 ? false : response.ok ? true : null, expectedMetadata: { environment: 'production',
      storage_scope: `portfolioforest/production/bitreca-media/${database}`, bucket_name: 'bitreca-media', database_id: database }, metadataVerified: false }
  if (response.ok) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    storageIdentity.bytes = bytes.length
    storageIdentity.bodySha256 = createHash('sha256').update(bytes).digest('hex')
    const metadata = Object.fromEntries(Object.keys(storageIdentity.expectedMetadata).map(name => [name, response.headers.get('x-amz-meta-' + name)]))
    storageIdentity.observedMetadata = metadata
    storageIdentity.metadataVerified = Object.entries(storageIdentity.expectedMetadata).every(([name, value]) => metadata[name] === value)
  } else assert.ok([401, 403, 404].includes(response.status), 'Unexpected control-object read; stop without retry')
}
const snapshot = { observedAt: new Date().toISOString(), readOnly: true, target: { account, database, databaseName: 'bitreca-db', bucket: 'bitreca-media' }, schema, migrations, portfolios, history, workers, authorization, storageIdentity }
const bytes = JSON.stringify(snapshot, null, 2) + '\n'
await writeFile(output, bytes, { flag: 'wx' })
console.log(JSON.stringify({ output, sha256: createHash('sha256').update(bytes).digest('hex'), migrations: migrations.map(row => row.name),
  portfolios: portfolios.map(({ id, slug, status }) => ({ id, slug, status })), authorization, storageIdentity,
  workers: workers.map(worker => ({ name: worker.name, active: latestSandboxDeployment(worker.deployments.deployments).versions, secretNames: worker.secretNames, bindings: worker.bindings, schedules: worker.schedules })) }, null, 2))
