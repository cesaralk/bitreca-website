import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { authorizationFromActivation, verifyPublicConfigDelta, guardedGeneration3Deployment, generation3Release } from '../scripts/generation3-sandbox-release.mjs'
const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
const workers = [{ name: 'bitreca-main-delete-sandbox-20261025', version: 'b8cec2ff-37df-4235-ae6e-858a63e9a8d3' },
  { name: 'bitreca-hosting-delete-sandbox-20261025', version: '116ccbb3-97f0-40de-a55b-54994f782d9a' }]
test('public successor must match active generation3 and preserves all frozen configuration and code pins', async () => {
  const receipt = await readJSON(review + '/generation3-activate3-plan.json.completed.json')
  const authorization = authorizationFromActivation(receipt)
  for (const file of ['main.wrangler.jsonc', 'hosting.wrangler.jsonc']) {
    const old = await readJSON(review + '/solo-owner-pinned-20261027/candidate/' + file)
    const next = await readJSON(generation3Release + '/candidate/' + file)
    verifyPublicConfigDelta(old, next, authorization)
    assert.throws(() => verifyPublicConfigDelta(old, { ...next, vars: { ...next.vars, PORTFOLIO_STAGING_MUTATIONS_FROZEN: 'false' } }, authorization))
  }
  for (const mutate of [r => { r.state.state[0].generation = 2 }, r => { r.state.runtime[0].cleanup_enabled = 1 }, r => { r.state.policies[2].operator_key_id = '0'.repeat(64) }]) {
    const wrong = structuredClone(receipt); mutate(wrong); assert.throws(() => authorizationFromActivation(wrong))
  }
})
test('guarded pin deployment verifies both distinct Workers and retains per-Worker results', async () => {
  const events = [], receipts = []
  const result = await guardedGeneration3Deployment({ approved: true, plan: { workers },
    verifyBefore: async () => {}, retain: async name => receipts.push(name),
    deploy: async worker => { events.push('deploy:' + worker.name); return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    verify: async (worker, version) => { events.push('verify:' + worker.name); return { Name: worker.name, Version: version, Verified: true } } })
  assert.equal(result.length, 2)
  assert.deepEqual(events, workers.flatMap(worker => ['deploy:' + worker.name, 'verify:' + worker.name]))
  assert.ok(receipts.includes('verified-' + workers[0].name) && receipts.includes('verified-' + workers[1].name))
})
test('partial deployment, lost upload response and wrong Worker verification cannot report completion or retry', async () => {
  for (const failure of ['upload', 'verify', 'second']) {
    const deployed = [], receipts = []
    await assert.rejects(guardedGeneration3Deployment({ approved: true, plan: { workers }, verifyBefore: async () => {}, retain: async name => receipts.push(name),
      deploy: async worker => { deployed.push(worker.name); if (failure === 'upload' || (failure === 'second' && deployed.length === 2)) throw new Error('synthetic lost response'); return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      verify: async (worker, version) => ({ Verified: true, Name: failure === 'verify' ? 'wrong-worker' : worker.name, Version: version }) }), /unresolved/)
    assert.equal(deployed.length, failure === 'second' ? 2 : 1)
    assert.equal(new Set(deployed).size, deployed.length)
    assert.ok(receipts.includes('deployment-unresolved'))
  }
  await assert.rejects(guardedGeneration3Deployment({ approved: false }), /approval/)
})
