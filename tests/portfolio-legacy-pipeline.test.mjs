import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { canonicalLegacyReconciliation, legacyManifestSha256, readLegacyReconciliationSnapshot,
  registerLegacyReconciliation, loadLegacyReconciliation } from '../worker/portfolio-legacy-reconciliation.js'
import { registerStorageProtocolVerification, attestPortfolioInventory } from '../worker/portfolio-inventory.js'
import { executeCleanupStep } from '../worker/portfolio-cleanup-executor.js'
import { claimCleanupJob, prepareCleanupItems, planCleanupBatch } from '../worker/portfolio-cleanup-state.js'
import { claimFinalizationLease, finalizePortfolioDeletion } from '../worker/portfolio-finalization.js'
import { handlePortfolioDeletionAdmin } from '../worker/portfolio-deletion-api.js'
import { readDeletionEligibility } from '../worker/portfolio-deletion-eligibility.js'
import worker from '../worker/index.js'

beforeEach(t => t.mock.method(globalThis, 'fetch', () => { throw new Error('Network forbidden in focused SQLite tests.') }))
const uuid = number => String(number).padStart(8, '0') + '-0000-4000-8000-000000000000'
const token = number => number.toString(16).padStart(32, '0')
const scope = 'portfolioforest/production/bitreca-media/8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', value)).toString('hex')

// Complete new-path integration in volatile SQLite only. Synthetic in-memory
// P-256 keys are never owner keys; signatures cannot authorize the application.
async function fixture(t, { uncertain = false } = {}) {
  const sql = new DatabaseSync(':memory:')
  t.after(() => sql.close())
  sql.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY; PRAGMA journal_mode=MEMORY;')
  assert.equal(sql.prepare('PRAGMA database_list').get().file, '')
  const migrations = readdirSync(new URL('../migrations/', import.meta.url)).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort()
  assert.equal(migrations.length, 17)
  for (const name of migrations) sql.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'))
  const now = Math.floor(Date.now() / 1000)
  let clock = now
  sql.function('unixepoch', () => clock)
  const initial = id => `portfolio-initial/${uuid(id)}/`
  for (const id of [5, 6]) {
    sql.prepare(`INSERT INTO portfolios(id,name,slug,storage_prefix,status,storage_birth_token,publication_revision)
      VALUES(?,?,?,?,?,?,3)`).run(id, 'Synthetic ' + id, 'synthetic-' + id, initial(id), 'published', token(id))
    sql.prepare(`INSERT INTO portfolio_storage_allocations(prefix,portfolio_id,allocation_kind,upload_state,
      writer_protocol_version,writer_token,writer_state,writer_closed_at) VALUES(?,?,'initial','completed',1,?,'closed',unixepoch())`)
      .run(initial(id), id, token(id))
  }
  const folder = `portfolio-versions/5/${uuid(50)}/`
  sql.prepare(`INSERT INTO portfolio_storage_allocations(prefix,portfolio_id,allocation_kind,upload_state,source_prefix,
    writer_protocol_version,writer_token,writer_state) VALUES(?,5,'folder','uploading',?,1,?,'open')`).run(folder, initial(5), token(50))
  sql.prepare("UPDATE portfolio_storage_allocations SET writer_state='closed',writer_closed_at=unixepoch() WHERE prefix=?").run(folder)
  sql.prepare('UPDATE portfolios SET storage_prefix=? WHERE id=5').run(folder)
  sql.prepare("UPDATE portfolio_storage_allocations SET upload_state='completed' WHERE prefix=?").run(folder)
  if (uncertain) {
    const prefix = `portfolio-versions/5/${uuid(51)}/`
    sql.prepare(`INSERT INTO portfolio_storage_allocations(prefix,portfolio_id,allocation_kind,upload_state,source_prefix,
      writer_protocol_version,writer_token,writer_state) VALUES(?,5,'folder','uploading',?,1,?,'open')`).run(prefix, folder, token(51))
    sql.prepare("UPDATE portfolio_storage_allocations SET writer_state='uncertain',upload_state='uncertain' WHERE prefix=?").run(prefix)
  }
  const state = { lostImportResponse: false, changes: [], calls: [], objects: new Map([
    [folder + 'index.html', { key: folder + 'index.html', prefix: folder, size: 10, etag: 'synthetic-html' }],
    [folder + 'style.css', { key: folder + 'style.css', prefix: folder, size: 20, etag: 'synthetic-css' }],
    [initial(6) + 'index.html', { key: initial(6) + 'index.html', prefix: initial(6), size: 30, etag: 'synthetic-other' }],
  ]) }
  function prepare(query, values = []) {
    return { query, values, bind(...bound) { return prepare(query, bound) },
      async first() { return sql.prepare(query).get(...values) ?? null },
      async all() { return { success: true, results: sql.prepare(query).all(...values) } },
      async run() {
        const before = sql.prepare('SELECT total_changes() AS n').get().n
        const result = sql.prepare(query).run(...values)
        const changes = sql.prepare('SELECT total_changes() AS n').get().n - before
        state.changes.push({ query, changes })
        if (state.lostImportResponse && query.includes('INSERT INTO portfolio_legacy_reconciliations')) {
          state.lostImportResponse = false
          throw new Error('Synthetic lost import response after commit.')
        }
        return { success: true, meta: { changes, last_row_id: Number(result.lastInsertRowid) } }
      } }
  }
  const db = { prepare, async batch(statements) {
    sql.exec('BEGIN')
    try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result }
    catch (error) { sql.exec('ROLLBACK'); throw error }
  } }
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publicKeySpki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)), signer = await hash(publicKeySpki)
  const trust = { publicKeySpki, storageScope: scope, authorizationPolicy: 'solo-operator-v1', policyId: uuid(70), policyGeneration: 1,
    operatorId: 'synthetic-test-only', operatorKeyId: signer, deploymentSha256: 'a'.repeat(64) }
  const sign = async payload => ({ payload, signature: new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(payload))) })
  sql.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  sql.prepare(`INSERT INTO portfolio_storage_authorization_policies(id,generation,policy,operator_id,operator_key_id,storage_scope,deployment_sha256,enrolled_at)
    VALUES(?,1,'solo-operator-v1',?,?,?,?,?)`).run(trust.policyId, trust.operatorId, signer, scope, trust.deploymentSha256, now)
  sql.prepare("UPDATE portfolio_storage_authorization_state SET policy='solo-operator-v1',generation=1,policy_id=? WHERE id=1").run(trust.policyId)
  const epoch = { version: 2, id: uuid(71), authorization_policy: trust.authorizationPolicy, policy_id: trust.policyId,
    policy_generation: 1, operator_id: trust.operatorId, operator_key_id: signer, deployment_verified_at: now,
    writers_fenced_at: now, writers_settled_at: now, storage_scope: scope, writer_protocol: 1,
    deployment_sha256: trust.deploymentSha256, evidence_sha256: 'b'.repeat(64), legacy_writers_settled: true, verified_at: now }
  assert.equal((await registerStorageProtocolVerification(db, trust, await sign(JSON.stringify(epoch)))).state, 'recorded')
  async function evidenceFor(id = 5, changes = {}) {
    const current = await readLegacyReconciliationSnapshot(db, id)
    const prefixes = current.snapshot.allocations.map(row => row.prefix)
    const objects = [...state.objects.values()].filter(row => prefixes.includes(row.prefix)).sort((a, b) => a.key.localeCompare(b.key))
      .map(row => ({ prefix: row.prefix, key: row.key, size: row.size, etag: row.etag }))
    const report = { version: 2, report_type: 'legacy-portfolio-reconciliation', authorization_policy: trust.authorizationPolicy,
      id: uuid(80 + id), policy_id: trust.policyId, policy_generation: 1, operator_id: trust.operatorId, operator_key_id: signer,
      storage_scope: scope, deployment_sha256: trust.deploymentSha256, epoch_id: epoch.id, portfolio_id: id,
      birth_token: current.snapshot.portfolio.birth_token, storage_prefix: current.snapshot.portfolio.storage_prefix,
      publication_revision: current.snapshot.portfolio.publication_revision, allocation_count: prefixes.length,
      allocation_revision: current.snapshot.portfolio.allocation_revision, snapshot_sha256: current.snapshotSha256,
      prefixes, objects, manifest_sha256: await legacyManifestSha256(prefixes, objects), audit_sha256: 'c'.repeat(64),
      ownership_verified: true, historical_namespaces_complete: true, legacy_writers_settled: true, observed_at: now, verified_at: now, ...changes }
    return sign(canonicalLegacyReconciliation(report))
  }
  function mark(id = 5) {
    const jobId = uuid(100 + id)
    sql.exec('BEGIN')
    try {
      sql.prepare("UPDATE portfolios SET deletion_requested_at=unixepoch(),status='draft',publication_revision=publication_revision+1 WHERE id=?").run(id)
      sql.prepare("INSERT INTO portfolio_deletion_jobs(id,portfolio_id,requested_by) VALUES(?,?,'synthetic-test-only')").run(jobId, id)
      sql.exec('COMMIT')
    } catch (error) { sql.exec('ROLLBACK'); throw error }
    return jobId
  }
  const r2 = { async list({ prefix, limit }) {
    state.calls.push('list')
    const objects = [...state.objects.values()].filter(row => row.key.startsWith(prefix)).sort((a, b) => a.key.localeCompare(b.key))
    return { objects: objects.slice(0, limit), truncated: objects.length > limit, ...(objects.length > limit ? { cursor: 'synthetic' } : {}) }
  }, async head(key) { state.calls.push('head'); return state.objects.get(key) ?? null },
  async delete(keys) {
    state.calls.push('delete'); for (const key of keys) state.objects.delete(key)
    if (state.lostDeleteResponse) { state.lostDeleteResponse = false; throw new Error('Synthetic lost DELETE response after storage changed.') }
  } }
  return { sql, db, state, trust, signer, now, epoch, sign, evidenceFor, mark, r2, folder, initial,
    advance(seconds) { clock += seconds } }
}

async function prepared(t) {
  const f = await fixture(t), evidence = await f.evidenceFor()
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, evidence)).state, 'recorded')
  f.jobId = f.mark()
  assert.equal((await attestPortfolioInventory(f.db, f.trust, f.jobId)).state, 'attested')
  f.authority = await loadLegacyReconciliation(f.db, f.trust, 5)
  return f
}

test('actual legacy authority capture, original provenance, bounded cleanup and separate finalization work together', async t => {
  const f = await prepared(t)
  assert.ok(f.state.changes.some(row => row.query.includes('INSERT INTO portfolio_legacy_reconciliations') && row.changes === 3))
  const origin = f.sql.prepare('SELECT * FROM portfolio_storage_origins WHERE portfolio_id=5').get()
  assert.equal(origin.minimum_at_birth, 0); assert.equal(origin.epoch_id, null)
  const other = { ...f.sql.prepare('SELECT * FROM portfolios WHERE id=6').get() }
  let result
  for (let step = 0; step < 20; step++) {
    const before = f.state.calls.length
    result = await executeCleanupStep({ db: f.db, r2: f.r2, jobId: f.jobId, token: token(200 + step), maxOperations: 2, exactInventory: f.authority.objects })
    assert.ok(f.state.calls.length - before <= 2)
    assert.ok(['pending', 'storage_verified'].includes(result.state), JSON.stringify(result))
    if (result.state === 'storage_verified') break
  }
  assert.equal(result.state, 'storage_verified')
  assert.equal([...f.state.objects.values()].filter(row => row.prefix === f.folder).length, 0)
  assert.equal(f.state.objects.has(f.initial(6) + 'index.html'), true)
  const lease = await claimFinalizationLease(f.db, f.jobId, token(500))
  assert.ok(lease)
  const runtime = f.sql.prepare('SELECT revision FROM portfolio_deletion_runtime_policy').get()
  lease.authorizationRevision = runtime.revision
  assert.equal((await finalizePortfolioDeletion(f.db, lease)).state, 'stale_lease')
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_finalizations').get().n, 0)
  f.sql.prepare(`UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,environment='production',storage_scope=?,
    bucket_name='bitreca-media',database_id='8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a',signer_sha256=?,cleanup_enabled=1,finalization_enabled=1 WHERE id=1`).run(scope, f.signer)
  lease.authorizationRevision++
  assert.equal((await finalizePortfolioDeletion(f.db, lease)).state, 'finalized')
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolios WHERE id=5').get().n, 0)
  assert.deepEqual({ ...f.sql.prepare('SELECT * FROM portfolios WHERE id=6').get() }, other)
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_legacy_reconciliations').get().n, 1)
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_batch_receipts').get().n, 2)
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_finalizations').get().n, 1)
  assert.equal(f.sql.prepare('SELECT minimum_at_birth FROM portfolio_storage_origins WHERE portfolio_id=5').get().minimum_at_birth, 0)
})

test('SQL refuses keys outside signed inventory, incomplete prefix receipts and authority rebinding', async t => {
  const f = await prepared(t), lease = await claimCleanupJob(f.db, f.jobId, token(600))
  assert.ok(await prepareCleanupItems(f.db, lease))
  await assert.rejects(planCleanupBatch(f.db, lease, uuid(601), f.folder, [f.folder + 'unapproved']), /outside/)
  assert.throws(() => f.sql.prepare('INSERT INTO portfolio_deletion_prefix_receipts(job_id,prefix,generation,lease_token) VALUES(?,?,?,?)')
    .run(f.jobId, f.folder, lease.generation, lease.token), /exact cleanup receipt/)
  assert.throws(() => f.sql.prepare('UPDATE portfolio_legacy_inventory_bindings SET reconciliation_id=? WHERE job_id=?').run(uuid(602), f.jobId), /immutable/)
  assert.throws(() => f.sql.prepare('DELETE FROM portfolio_legacy_inventory_bindings WHERE job_id=?').run(f.jobId), /retained/)
  assert.throws(() => f.sql.prepare('INSERT OR REPLACE INTO portfolio_legacy_inventory_bindings(job_id,reconciliation_id,snapshot_sha256) SELECT job_id,reconciliation_id,snapshot_sha256 FROM portfolio_legacy_inventory_bindings').run(), /bind|binding/)
  assert.equal(f.state.calls.length, 0)
})

test('actual append-only reconciliation survives lost response and rejects stale/revoked authority', async t => {
  const f = await fixture(t), evidence = await f.evidenceFor()
  f.state.lostImportResponse = true
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, evidence)).state, 'blocked')
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, evidence)).state, 'recorded')
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_legacy_reconciliations').get().n, 1)
  f.sql.exec('UPDATE portfolios SET publication_revision=publication_revision+1 WHERE id=5')
  await assert.rejects(loadLegacyReconciliation(f.db, f.trust, 5))
  f.sql.prepare('INSERT INTO portfolio_storage_key_revocations(operator_key_id) VALUES(?)').run(f.signer)
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, evidence)).state, 'blocked')
  assert.equal(f.state.calls.length, 0)
})

test('uncertain actual registered writer excludes reconciliation; ownership is never inferred from object count', async t => {
  const f = await fixture(t, { uncertain: true })
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_legacy_reconciliation_candidates WHERE portfolio_id=5').get().n, 0)
  await assert.rejects(f.evidenceFor())
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_legacy_reconciliations').get().n, 0)
})

for (const failure of ['unknown', 'changed', 'missing']) test(`actual cleanup refuses ${failure} object state before unauthorized deletion`, async t => {
  const f = await prepared(t)
  if (failure === 'unknown') f.state.objects.set(f.folder + 'foreign.html', { prefix: f.folder, key: f.folder + 'foreign.html', size: 1, etag: 'foreign' })
  if (failure === 'changed') f.state.objects.get(f.folder + 'index.html').etag = 'changed'
  if (failure === 'missing') f.state.objects.delete(f.folder + 'style.css')
  let result
  for (let step = 0; step < 12; step++) {
    result = await executeCleanupStep({ db: f.db, r2: f.r2, jobId: f.jobId, token: token(700 + step), maxOperations: 2, exactInventory: f.authority.objects })
    if (result.state !== 'pending') break
  }
  assert.equal(result.state, 'blocked', JSON.stringify(result))
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_storage_receipts').get().n, 0)
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_finalizations').get().n, 0)
  assert.ok(f.sql.prepare('SELECT id FROM portfolios WHERE id=5').get())
  assert.equal(f.state.objects.has(f.initial(6) + 'index.html'), true)
  if (failure !== 'missing') assert.equal(f.state.calls.includes('delete'), false)
})

test('migration 0017 keeps native min-1 origin attestation compatible', async t => {
  const f = await fixture(t), prefix = `portfolio-initial/${uuid(11)}/`
  f.sql.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix,storage_birth_token) VALUES(11,?,?,?,?)').run('Native synthetic', 'native-synthetic', prefix, token(11))
  f.sql.prepare(`INSERT INTO portfolio_storage_allocations(prefix,portfolio_id,allocation_kind,upload_state,writer_protocol_version,
    writer_token,writer_state,writer_closed_at,authorization_policy_id,authorization_generation,authorization_artifact)
    VALUES(?,11,'initial','completed',1,?,'closed',unixepoch(),?,1,?)`).run(prefix, token(11), f.trust.policyId, f.trust.deploymentSha256)
  const jobId = f.mark(11)
  assert.equal((await attestPortfolioInventory(f.db, f.trust, jobId)).state, 'attested')
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_legacy_inventory_bindings WHERE job_id=?').get(jobId).n, 0)
  assert.equal(f.sql.prepare('SELECT minimum_at_birth FROM portfolio_storage_origins WHERE portfolio_id=11').get().minimum_at_birth, 1)
})

test('reconciled Admin eligibility requires a current imported authority and revocation removes it', async t => {
  const f = await fixture(t)
  assert.equal((await readDeletionEligibility(f.db, 5)).canRequest, false)
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, await f.evidenceFor())).state, 'recorded')
  assert.equal((await readDeletionEligibility(f.db, 5)).code, 'RECONCILED_REQUEST_CANDIDATE')
  assert.equal((await readDeletionEligibility(f.db, 5)).canRequest, true)
  f.sql.prepare('INSERT INTO portfolio_storage_key_revocations(operator_key_id) VALUES(?)').run(f.signer)
  assert.equal((await readDeletionEligibility(f.db, 5)).canRequest, false)
  await assert.rejects(loadLegacyReconciliation(f.db, f.trust, 5))
})

test('legacy reconciliation import stays disabled and shared authentication/Origin checks precede all mutations', async () => {
  let databaseAccesses = 0
  const url = new URL('https://bitreca.com/api/admin/portfolio-legacy-reconciliation')
  const db = { prepare() { databaseAccesses++; throw new Error('Database must not be consulted.') } }
  const env = { ADMIN_USERNAME: 'synthetic-admin', ADMIN_PASSWORD: 'synthetic-password', SESSION_SECRET: 'synthetic-session-secret',
    ADMIN_AUTH_VERSION: '1', bitreca_db: db, PORTFOLIO_ENVIRONMENT: 'production', PORTFOLIO_LEGACY_RECONCILIATION_IMPORT_ENABLED: 'true' }
  const request = origin => new Request(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal((await worker.fetch(request('https://foreign.invalid'), env)).status, 403)
  assert.equal((await worker.fetch(request(url.origin), env)).status, 401)
  const disabled = await handlePortfolioDeletionAdmin(request(url.origin), { ...env, PORTFOLIO_LEGACY_RECONCILIATION_IMPORT_ENABLED: 'false' }, url)
  assert.equal(disabled.status, 503)
  assert.equal(databaseAccesses, 0)
})

test('interrupted exact DELETE reuses durable intent and records each object only once', async t => {
  const f = await prepared(t)
  f.state.lostDeleteResponse = true
  let sawRetry = false, result
  for (let step = 0; step < 20; step++) {
    const before = f.state.calls.length
    await loadLegacyReconciliation(f.db, f.trust, 5, f.authority.reconciliationId)
    result = await executeCleanupStep({ db: f.db, r2: f.r2, jobId: f.jobId, token: token(900 + step), maxOperations: 2, exactInventory: f.authority.objects })
    assert.ok(f.state.calls.length - before <= 2)
    if (result.state === 'retry_wait') { sawRetry = true; f.advance(120) }
    else assert.ok(['pending', 'storage_verified'].includes(result.state), JSON.stringify(result))
    if (result.state === 'storage_verified') break
  }
  assert.equal(sawRetry, true)
  assert.equal(result.state, 'storage_verified')
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_batch_receipts').get().n, 2)
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_batches').get().n, 2)
  assert.equal(f.state.objects.has(f.initial(6) + 'index.html'), true)
})

test('one reconciled key has one durable intent before and after its immutable acknowledgement', async t => {
  const f = await prepared(t), lease = await claimCleanupJob(f.db, f.jobId, token(1200))
  assert.ok(await prepareCleanupItems(f.db, lease))
  const key = f.authority.objects[0].key, batchId = uuid(1201)
  assert.equal((await planCleanupBatch(f.db, lease, batchId, f.folder, [key])).state, 'planned')
  const original = { ...f.sql.prepare('SELECT * FROM portfolio_deletion_batches WHERE id=?').get(batchId) }
  await assert.rejects(planCleanupBatch(f.db, lease, uuid(1202), f.folder, [key]), /outside the reconciled inventory/)
  assert.equal((await planCleanupBatch(f.db, lease, batchId, f.folder, [key])).state, 'planned')
  assert.deepEqual({ ...f.sql.prepare('SELECT * FROM portfolio_deletion_batches WHERE id=?').get(batchId) }, original)
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_batches').get().n, 1)
  f.sql.prepare('INSERT INTO portfolio_deletion_batch_receipts(batch_id,generation,lease_token) VALUES(?,?,?)')
    .run(batchId, lease.generation, lease.token)
  await assert.rejects(planCleanupBatch(f.db, lease, uuid(1203), f.folder, [key]), /outside the reconciled inventory/)
  assert.deepEqual({ ...f.sql.prepare('SELECT * FROM portfolio_deletion_batches WHERE id=?').get(batchId) }, original)
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_batches').get().n, 1)
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_batch_receipts').get().n, 1)
  assert.equal(f.state.calls.length, 0)
})
