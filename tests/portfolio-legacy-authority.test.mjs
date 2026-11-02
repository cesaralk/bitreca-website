import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalLegacyReconciliation, legacyManifestSha256, verifyLegacyReconciliation,
  readLegacyReconciliationSnapshot, registerLegacyReconciliation, loadLegacyReconciliation } from '../worker/portfolio-legacy-reconciliation.js'

// Ephemeral test-only keys and synthetic reports stay in memory. No owner key,
// real object record, operational signature, or Cloudflare binding is accessed.
const digest = async value => Buffer.from(await crypto.subtle.digest('SHA-256', value)).toString('hex')
const id = '55555555-5555-4555-8555-555555555555'
async function fixture() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publicKeySpki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  const fingerprint = await digest(publicKeySpki), now = Math.floor(Date.now() / 1000)
  const trust = { publicKeySpki, authorizationPolicy: 'solo-operator-v1', policyId: '77777777-7777-4777-8777-777777777777',
    policyGeneration: 999, operatorId: 'synthetic-test-only', operatorKeyId: fingerprint,
    storageScope: 'portfolioforest/production/bitreca-media/8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a', deploymentSha256: 'a'.repeat(64) }
  const row = { portfolio_id: 5, storage_prefix: 'test-only/one/', birth_token: '1'.repeat(32), initial_prefix: 'test-only/one/',
    born_at: now - 1000, minimum_at_birth: 0, publication_revision: 4, allocation_count: 1, allocation_revision: 1,
    deletion_requested_at: null, status: 'published' }
  const allocations = [{ prefix: row.storage_prefix, allocation_kind: 'initial', source_prefix: null, writer_protocol_version: 1,
    writer_token: row.birth_token, writer_state: 'closed', writer_closed_at: now - 200, sequence: 1 }]
  const policy = { id: trust.policyId, generation: trust.policyGeneration, operator_id: trust.operatorId, operator_key_id: fingerprint,
    storage_scope: trust.storageScope, deployment_sha256: trust.deploymentSha256, active_policy: trust.authorizationPolicy, enrolled_at: now - 500 }
  const sign = async payload => ({ payload, signature: new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(payload))) })
  const epochReport = { version: 2, id: '66666666-6666-4666-8666-666666666666', authorization_policy: 'solo-operator-v1',
    policy_id: trust.policyId, policy_generation: trust.policyGeneration, operator_id: trust.operatorId, operator_key_id: fingerprint,
    deployment_verified_at: now - 400, writers_fenced_at: now - 300, writers_settled_at: now - 200, storage_scope: trust.storageScope,
    writer_protocol: 1, deployment_sha256: trust.deploymentSha256, evidence_sha256: 'b'.repeat(64), legacy_writers_settled: true, verified_at: now - 100 }
  const signedEpoch = await sign(JSON.stringify(epochReport))
  const epoch = { id: epochReport.id, evidence_json: signedEpoch.payload, signature_hex: Buffer.from(signedEpoch.signature).toString('hex'),
    signer_sha256: fingerprint, storage_scope: trust.storageScope, verified_at: epochReport.verified_at }
  const state = { stored: null, policy, epoch, row, allocations, lostResponse: false, writes: 0, candidate: true }
  const db = { prepare(sql) { return { values: [], bind(...values) { this.values = values; return this },
    async first() {
      if (sql.includes('active_policy')) return state.policy
      if (sql.includes('FROM portfolio_storage_authorized_epochs')) return state.epoch
      if (sql.includes('FROM portfolio_legacy_reconciliation_candidates')) return state.candidate ? state.row : null
      if (sql.includes('FROM portfolio_legacy_reconciliations WHERE')) return state.stored
      throw new Error(`Unexpected first query: ${sql}`)
    }, async all() {
      if (sql.includes('FROM portfolio_storage_allocations')) return { success: true, results: state.allocations }
      if (sql.includes('FROM portfolio_legacy_reconciliations_current')) return { success: true, results: state.stored && (this.values[1] == null || this.values[1] === state.stored.id) ? [state.stored] : [] }
      throw new Error(`Unexpected all query: ${sql}`)
    }, async run() {
      assert.match(sql, /INSERT INTO portfolio_legacy_reconciliations/)
      state.writes++
      const v = this.values
      state.stored = { ...JSON.parse(v[15]), evidence_json: v[15], signature_hex: v[16], signer_sha256: v[17] }
      if (state.lostResponse) { state.lostResponse = false; throw new Error('Synthetic response lost after commit.') }
      return { success: true, meta: { changes: state.changeCount ?? 1 } }
    } } } }
  const snapshot = await readLegacyReconciliationSnapshot(db, 5)
  const prefixes = [row.storage_prefix], objects = [{ prefix: row.storage_prefix, key: `${row.storage_prefix}index.html`, size: 1, etag: 'test-only-etag' }]
  const report = { version: 2, report_type: 'legacy-portfolio-reconciliation', authorization_policy: 'solo-operator-v1',
    ownership_verified: true, historical_namespaces_complete: true, legacy_writers_settled: true,
    id, policy_id: trust.policyId, policy_generation: trust.policyGeneration, operator_id: trust.operatorId, operator_key_id: fingerprint,
    storage_scope: trust.storageScope, deployment_sha256: trust.deploymentSha256, epoch_id: epoch.id, portfolio_id: 5,
    birth_token: row.birth_token, storage_prefix: row.storage_prefix, publication_revision: row.publication_revision,
    allocation_count: 1, allocation_revision: 1, snapshot_sha256: snapshot.snapshotSha256, prefixes, objects,
    manifest_sha256: await legacyManifestSha256(prefixes, objects), audit_sha256: 'c'.repeat(64), observed_at: now - 10, verified_at: now - 5 }
  const evidence = await sign(canonicalLegacyReconciliation(report))
  return { db, trust, report, evidence, state, sign, now }
}

test('legacy authority is distinct, canonical, exact, and cryptographically verified', async () => {
  const f = await fixture()
  assert.equal((await verifyLegacyReconciliation(f.trust, f.evidence)).report.report_type, 'legacy-portfolio-reconciliation')
  assert.throws(() => canonicalLegacyReconciliation({ ...f.report, ownership_verified: false }), /factual/)
  assert.throws(() => canonicalLegacyReconciliation({ ...f.report, historical_namespaces_complete: undefined }), /factual/)
  for (const changes of [{ report_type: 'storage-protocol-verification' }, { version: 1 }, { legacy_writers_settled: false },
    { ownership_verified: false }, { historical_namespaces_complete: false }, { unexpected: true }]) {
    const payload = JSON.stringify({ ...JSON.parse(f.evidence.payload), ...changes })
    await assert.rejects(verifyLegacyReconciliation(f.trust, await f.sign(payload)))
  }
  await assert.rejects(verifyLegacyReconciliation(f.trust, { ...f.evidence, signature: new Uint8Array(64) }), /signature/)
})

test('wrong keys, generations, policy, scope, artifact and chronology never confer authority', async () => {
  const f = await fixture(), other = await fixture()
  for (const trust of [{ ...f.trust, publicKeySpki: other.trust.publicKeySpki }, { ...f.trust, policyGeneration: 998 },
    { ...f.trust, authorizationPolicy: 'independent-v1' }, { ...f.trust, storageScope: 'sandbox' }, { ...f.trust, deploymentSha256: 'd'.repeat(64) }]) {
    await assert.rejects(verifyLegacyReconciliation(trust, f.evidence))
  }
  for (const changes of [{ observed_at: f.now + 1 }, { verified_at: f.now + 1 }, { portfolio_id: 11 }]) {
    await assert.rejects(verifyLegacyReconciliation(f.trust, await f.sign(canonicalLegacyReconciliation({ ...f.report, ...changes }))))
  }
})

test('unlisted prefixes, duplicates, changed manifests and foreign/control objects are rejected', async () => {
  const f = await fixture()
  for (const changes of [{ objects: [{ ...f.report.objects[0], key: 'foreign/index.html' }] },
    { objects: [f.report.objects[0], f.report.objects[0]] }, { manifest_sha256: 'f'.repeat(64) },
    { prefixes: ['__portfolioforest_control__/'] }, { objects: [{ ...f.report.objects[0], size: -1 }] },
    { objects: [{ ...f.report.objects[0], etag: '' }] }, { objects: [{ ...f.report.objects[0], extra: true }] }]) {
    await assert.rejects(verifyLegacyReconciliation(f.trust, await f.sign(canonicalLegacyReconciliation({ ...f.report, ...changes }))))
  }
})

test('append-only import, identical replay and lost responses retain one authority', async () => {
  const f = await fixture()
  f.state.lostResponse = true
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, f.evidence)).state, 'blocked')
  assert.equal(f.state.writes, 1)
  assert.deepEqual(await registerLegacyReconciliation(f.db, f.trust, f.evidence), { state: 'recorded', id })
  assert.equal(f.state.writes, 1)
  const conflicting = await f.sign(canonicalLegacyReconciliation({ ...f.report, audit_sha256: 'e'.repeat(64) }))
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, conflicting)).state, 'blocked')
  assert.equal(f.state.writes, 1)
})

test('stale snapshots, uncertain writers, revoked policy and unsigned settlement fail closed', async () => {
  for (const modify of [f => { f.state.row.publication_revision++ }, f => { f.state.allocations[0].writer_state = 'uncertain' },
    f => { f.state.policy = { active_policy: 'solo-operator-v1' } }, f => { f.state.epoch = null },
    f => { f.state.epoch.signature_hex = '0'.repeat(128) }, f => { f.state.allocations[0].writer_closed_at = f.now - 1 },
    f => { f.state.candidate = false }]) {
    const f = await fixture(); modify(f)
    assert.equal((await registerLegacyReconciliation(f.db, f.trust, f.evidence)).state, 'blocked')
    assert.equal(f.state.writes, 0)
  }
})

test('reverification binds current state; the sole allowed marking revision preserves authority', async () => {
  const f = await fixture()
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, f.evidence)).state, 'recorded')
  f.state.row.deletion_requested_at = f.now
  f.state.row.publication_revision++
  f.state.row.status = 'draft'
  assert.equal((await loadLegacyReconciliation(f.db, f.trust, 5)).reconciliationId, id)
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, f.evidence)).state, 'recorded')
  const next = await f.sign(canonicalLegacyReconciliation({ ...f.report, id: '88888888-8888-4888-8888-888888888888' }))
  f.state.stored = null
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, next)).state, 'blocked')
  f.state.row.publication_revision++
  await assert.rejects(loadLegacyReconciliation(f.db, f.trust, 5))
})

test('D1 trigger-inclusive change counts use exact readback and job-bound loads reject substituted authorities', async () => {
  const f = await fixture()
  f.state.changeCount = 17
  assert.equal((await registerLegacyReconciliation(f.db, f.trust, f.evidence)).state, 'recorded')
  assert.equal((await loadLegacyReconciliation(f.db, f.trust, 5, id)).reconciliationId, id)
  await assert.rejects(loadLegacyReconciliation(f.db, f.trust, 5, '88888888-8888-4888-8888-888888888888'))
  f.state.stored.epoch_id = '88888888-8888-4888-8888-888888888888'
  await assert.rejects(loadLegacyReconciliation(f.db, f.trust, 5, id), /differs/)
})
