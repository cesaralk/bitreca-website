import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { createPublicKey } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { publicKeyPin } from '../scripts/portfolio-evidence.mjs'
import { recoveryTarget, generation2Key, validateRecovery, guardedRecoveryStage, prepareRecoverySQL } from '../scripts/generation3-recovery.mjs'
const snapshot = () => ({ target: { ...recoveryTarget }, generation: 1, revision: 1, protocol: 1,
  cleanup: false, finalization: false, deletion: false, import: false, schedules: false, publicAccess: false,
  frozen: true, portfolios: 0, epochs: 0, allocations: 0, jobs: 0, unsettledWriters: 0,
  generation2Key, revoked: false, historyIntact: true, existingOutputs: false,
  generation2PolicyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
test('recovery rejects wrong generations, stale revision, mismatched keys, existing outputs and unsafe controls', () => {
  assert.equal(validateRecovery(snapshot(), 'activate2').expectedPostRevision, 2)
  for (const patch of [{ generation: 2 }, { revision: 2 }, { generation2Key: '0'.repeat(64) }, { existingOutputs: true }, { import: true }, { frozen: false }, { epochs: 1 }]) {
    assert.throws(() => validateRecovery({ ...snapshot(), ...patch }, 'activate2'))
  }
  const next = { ...snapshot(), generation: 2, revision: 2, reviewedGeneration3Fingerprint: 'a'.repeat(64) }
  assert.throws(() => validateRecovery(next, 'enroll3', { authorization: { policyGeneration: 2 } }))
  assert.throws(() => validateRecovery(next, 'activate3', { authorization: { policyGeneration: 3, operatorId: 'bitreca-owner', operatorKeyId: 'b'.repeat(64) } }))
  const prepared = prepareRecoverySQL(snapshot(), 'activate2')
  assert.match(prepared.sql, /CHECK\(ok=1\)/)
  assert.match(prepared.sql, /generation=2/)
  assert.doesNotMatch(prepared.sql, /DELETE FROM|REPLACE INTO|minimum_protocol_version SET/)
})
test('failed or ambiguous transitions cannot advance, retry or report completion', async () => {
  for (const failure of ['verifyBefore', 'applyOnce', 'reconcile']) {
    const calls = []
    const methods = Object.fromEntries(['verifyBefore', 'applyOnce', 'reconcile'].map(name => [name, async () => { calls.push(name); if (name === failure) throw new Error('synthetic failure') }]))
    await assert.rejects(guardedRecoveryStage({ approved: true, ...methods }))
    assert.ok(calls.filter(name => name === 'applyOnce').length <= 1)
    if (failure === 'verifyBefore') assert.deepEqual(calls, ['verifyBefore'])
  }
  await assert.rejects(guardedRecoveryStage({}))
})
test('migration 0014 activation is forward-only, retains history and atomically rejects stale recovery SQL', async t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close())
  const directory = new URL('../migrations/', import.meta.url)
  for (const name of (await readdir(directory)).filter(name => /^00(0[1-9]|1[0-4])_/.test(name)).sort()) db.exec(await readFile(new URL(name, directory), 'utf8'))
  const scope = `portfolioforest/staging/${recoveryTarget.bucket}/${recoveryTarget.databaseId}`
  db.exec("UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1 WHERE id=1")
  const insert = db.prepare('INSERT INTO portfolio_storage_authorization_policies VALUES(?,?,?,?,?,?,?,?)')
  insert.run('11111111-1111-4111-8111-111111111111', 1, 'solo-operator-v1', 'bitreca-owner', '1'.repeat(64), scope, 'a'.repeat(64), 1)
  db.exec("UPDATE portfolio_storage_authorization_state SET policy='solo-operator-v1',generation=1,policy_id='11111111-1111-4111-8111-111111111111' WHERE id=1")
  insert.run(snapshot().generation2PolicyId, 2, 'solo-operator-v1', 'bitreca-owner', generation2Key, scope, 'a'.repeat(64), 2)
  const sql = prepareRecoverySQL(snapshot(), 'activate2').sql
  const atomic = statement => { db.exec('BEGIN'); try { db.exec(statement); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error } }
  atomic(sql)
  assert.equal(db.prepare('SELECT generation FROM portfolio_storage_authorization_state').get().generation, 2)
  assert.equal(db.prepare('SELECT revision FROM portfolio_deletion_runtime_policy').get().revision, 2)
  assert.throws(() => atomic(sql))
  assert.equal(db.prepare('SELECT count(*) AS n FROM portfolio_storage_authorization_policies').get().n, 2)
  assert.throws(() => db.exec('DELETE FROM portfolio_storage_authorization_policies'))
  assert.equal(db.prepare('SELECT cleanup_enabled+finalization_enabled AS n FROM portfolio_deletion_runtime_policy').get().n, 0)
  // Public generator point only; no key generation or signing.
  const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256',
    x: Buffer.from('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296', 'hex').toString('base64url'),
    y: Buffer.from('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5', 'hex').toString('base64url') }, format: 'jwk' }).export({ type: 'spki', format: 'pem' })
  const next = { ...snapshot(), generation: 2, revision: 2, reviewedGeneration3Fingerprint: publicKeyPin(publicKey).signer_sha256 }
  const inputs = { publicKey, scope, deployment: 'public synthetic code manifest', policyId: '33333333-3333-4333-8333-333333333333', generation: 3, operatorId: 'bitreca-owner', enrolledAt: 3 }
  atomic(prepareRecoverySQL(next, 'enroll3', inputs).sql)
  assert.equal(db.prepare('SELECT generation FROM portfolio_storage_authorization_state').get().generation, 2)
  assert.throws(() => atomic(prepareRecoverySQL(next, 'enroll3', inputs).sql))
  atomic(prepareRecoverySQL(next, 'activate3', inputs).sql)
  assert.equal(db.prepare('SELECT generation FROM portfolio_storage_authorization_state').get().generation, 3)
  assert.equal(db.prepare('SELECT revision FROM portfolio_deletion_runtime_policy').get().revision, 3)
  assert.equal(db.prepare('SELECT count(*) AS n FROM portfolio_storage_authorization_policies').get().n, 3)
  assert.equal(db.prepare('SELECT cleanup_enabled+finalization_enabled AS n FROM portfolio_deletion_runtime_policy').get().n, 0)
})
