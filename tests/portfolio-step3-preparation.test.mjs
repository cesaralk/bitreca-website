import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateStep3Inputs, validateStep3Fields, step3Paths } from '../scripts/solo-owner-step3.mjs'
import { controlledEvidenceImport } from '../scripts/portfolio-evidence-import-window.mjs'

test('existing unsigned owner report, hashes, policy and protocol-one receipt validate without reading a key or signing', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Preparation must remain offline'))
  const input = await validateStep3Inputs()
  const receipt = JSON.parse(await readFile(step3Paths.receipt, 'utf8'))
  const now = Math.floor(Date.now() / 1000)
  for (const change of [{ policy_generation: 2 }, { operator_key_id: '0'.repeat(64) },
    { evidence_sha256: '0'.repeat(64), legacy_writers_settled: false },
    { verified_at: now + 100 }, { deployment_verified_at: 0 }, { storage_scope: 'foreign' }]) {
    assert.throws(() => validateStep3Fields({ ...input.report, ...change }, input.authorization, input.fingerprint, receipt, now))
  }
  assert.throws(() => validateStep3Fields(input.report, input.authorization, input.fingerprint,
    { state: { ...receipt.state, protocol: 0 } }, now))
})
test('import requires separate approval and operator-only access before any control change', async () => {
  for (const gate of [{ approvedImport: false, operatorAccessVerified: true }, { approvedImport: true, operatorAccessVerified: false }]) {
    await assert.rejects(controlledEvidenceImport({ ...gate, verifyClosed: () => assert.fail('No transport call permitted') }))
  }
})
test('import controls restore after success, failed import, lost open response and failed epoch verification without retry', async () => {
  for (const failure of ['none', 'open', 'verifyOpen', 'postOnce', 'verifyEpoch', 'restore', 'verifyRestored']) {
    const events = []
    const callbacks = Object.fromEntries(['verifyClosed', 'open', 'verifyOpen', 'postOnce', 'verifyEpoch', 'restore', 'verifyRestored'].map(name =>
      [name, async () => { events.push(name); if (name === failure) throw new Error('Synthetic control-window failure') }]))
    const operation = controlledEvidenceImport({ approvedImport: true, operatorAccessVerified: true, ...callbacks })
    if (failure === 'none') assert.equal((await operation).state, 'imported-and-restored')
    else await assert.rejects(operation)
    assert.equal(events.filter(x => x === 'restore').length, 1)
    assert.ok(events.filter(x => x === 'postOnce').length <= 1)
    if (failure === 'none' || failure === 'verifyEpoch') {
      assert.equal(events.at(-1), 'verifyEpoch')
      assert.ok(events.indexOf('verifyRestored') < events.indexOf('verifyEpoch'))
    } else if (failure !== 'restore') assert.equal(events.at(-1), 'verifyRestored')
  }
})
