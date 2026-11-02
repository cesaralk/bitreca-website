import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFile, readdir } from 'node:fs/promises'
import { buildAtomicTransition, executeTransition, readStateSQL, generation3Public, generation3Fingerprint, runRecoveryCLI } from '../scripts/execute-generation3-recovery.mjs'
import { recoveryTarget, generation2Key } from '../scripts/generation3-recovery.mjs'

async function fixture(t) {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Network forbidden in offline tests') })
  const db = new DatabaseSync(':memory:'); t.after(() => db.close())
  const directory = new URL('../migrations/', import.meta.url)
  for (const name of (await readdir(directory)).filter(name => /^00(0[1-9]|1[0-4])_/.test(name)).sort()) db.exec(await readFile(new URL(name, directory), 'utf8'))
  const scope = `portfolioforest/staging/${recoveryTarget.bucket}/${recoveryTarget.databaseId}`
  const insert = db.prepare('INSERT INTO portfolio_storage_authorization_policies VALUES(?,?,?,?,?,?,?,?)')
  const digest = '97dee6f267be82e94ff094a96f39528eaa68e9afa6446284a01c71f36bfbb6d4'
  const id1 = 'b156f918-7352-481e-8812-224b53dbe6a5', id2 = 'fb0f169e-73c0-4d42-b232-dab26efece45'
  db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1 WHERE id=1')
  insert.run(id1, 1, 'solo-operator-v1', 'bitreca-owner', '3fb65d834cb5138bd49adeb5ee866268216183df7a0964eda5fe088a25c3d373', scope, digest, 1793137853)
  db.prepare("UPDATE portfolio_storage_authorization_state SET policy='solo-operator-v1',generation=1,policy_id=? WHERE id=1").run(id1)
  insert.run(id2, 2, 'solo-operator-v1', 'bitreca-owner', generation2Key, scope, digest, 1793147875)
  let writes = 0
  const read = async () => JSON.parse(db.prepare(readStateSQL).get().snapshot)
  const batch = async (statements, failure) => {
    writes++; db.exec('BEGIN')
    try {
      const results = []
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]
        results.push({ success: true, results: db.prepare(statement.sql).all(...(statement.params || [])) })
        if (failure === i) throw new Error('Synthetic interrupted batch')
      }
      db.exec('COMMIT'); return results
    } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  return { db, read, batch, writes: () => writes, inputs: { publicKey: generation3Public, scope,
    deployment: await readFile('C:/Users/cezar/Desktop/bitreca-deletion-review/solo-owner-pinned-20261027/candidate/code-artifacts.json', 'utf8'),
    policyId: '33333333-3333-4333-8333-333333333333', generation: 3, operatorId: 'bitreca-owner', enrolledAt: 1793147875 } }
}

test('default CLI is offline plan only and wrong-stage approval never writes', async t => {
  const f = await fixture(t)
  assert.equal((await runRecoveryCLI([])).planOnly, true)
  assert.equal((await runRecoveryCLI(['--stage', 'enroll3'])).generation3Fingerprint, generation3Fingerprint)
  await assert.rejects(executeTransition({ stage: 'activate2', approvedStage: 'activate3' }))
  assert.equal(f.writes(), 0)
})
test('atomic before/write/after batch supports all stages, retains history, protocol and disabled controls', async t => {
  const f = await fixture(t)
  for (const stage of ['activate2', 'enroll3', 'activate3']) {
    const transition = buildAtomicTransition(await f.read(), stage, f.inputs)
    const receipts = []
    const result = await executeTransition({ stage, approvedStage: stage, transition,
      transport: { read: f.read, batch: f.batch }, verifyControls: async () => {}, backupVerified: true,
      save: async name => { receipts.push(name) } })
    assert.equal(result.completed, stage); assert.deepEqual(await f.read(), transition.after)
    assert.deepEqual(receipts, ['intent', 'completed'])
  }
  const after = await f.read()
  assert.equal(after.protocol, 1); assert.equal(after.state[0].generation, 3); assert.equal(after.runtime[0].revision, 3)
  assert.equal(after.runtime[0].cleanup_enabled + after.runtime[0].finalization_enabled, 0)
  assert.equal(after.policies.length, 3)
})
test('partial batch failures and failed postcondition roll back mutation and trigger revision', async t => {
  const f = await fixture(t), before = await f.read()
  const transition = buildAtomicTransition(before, 'activate2')
  for (const index of [0, 1, 2]) {
    await assert.rejects(f.batch(transition.batch, index))
    assert.deepEqual(await f.read(), before)
  }
  const damaged = structuredClone(transition.batch); damaged[2].params = ['{}']
  await assert.rejects(f.batch(damaged))
  assert.deepEqual(await f.read(), before)
})
test('stale state is rejected inside the atomic batch, even after prior read checks', async t => {
  const f = await fixture(t), transition = buildAtomicTransition(await f.read(), 'activate2')
  f.db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=revision+1 WHERE id=1')
  await assert.rejects(f.batch(transition.batch))
  assert.equal((await f.read()).state[0].generation, 1)
})
test('lost committed response stops without retry; replay and existing intent cannot write again', async t => {
  const f = await fixture(t), transition = buildAtomicTransition(await f.read(), 'activate2')
  const receipts = []
  await assert.rejects(executeTransition({ stage: 'activate2', approvedStage: 'activate2', transition,
    transport: { read: f.read, batch: async batch => { await f.batch(batch); throw new Error('Lost response after commit') } },
    verifyControls: async () => {}, save: async name => receipts.push(name) }), /unresolved/)
  assert.equal(f.writes(), 1); assert.deepEqual(receipts, ['intent', 'unresolved'])
  assert.equal((await f.read()).state[0].generation, 2)
  await assert.rejects(f.batch(transition.batch)) // Provider guard also prevents replay.
  assert.equal((await f.read()).runtime[0].revision, 2)
  const next = buildAtomicTransition(await f.read(), 'enroll3', f.inputs)
  await assert.rejects(executeTransition({ stage: 'enroll3', approvedStage: 'enroll3', transition: next,
    transport: { read: f.read, batch: f.batch }, verifyControls: async () => {}, backupVerified: true,
    save: async () => { throw new Error('Existing exclusive intent') } }))
  assert.equal((await f.read()).policies.length, 2)
  await assert.rejects(executeTransition({ stage: 'enroll3', approvedStage: 'enroll3', backupVerified: false }), /backup/)
})
