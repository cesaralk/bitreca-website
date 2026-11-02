import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash, createPublicKey } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { sealCandidate, prepareOwnerCandidate, prepareReleasePlan, validateDatabaseState, deployBoth, saveStageCompletion } from '../scripts/solo-sandbox-release.mjs'
import { sandboxResources } from '../scripts/check-portfolio-config.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
async function fixture(t) {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Network forbidden') })
  const parent = await mkdtemp(join(tmpdir(), 'bitreca-solo-release-test-'))
  t.after(async () => {
    assert.ok(resolve(parent).startsWith(resolve(tmpdir()) + '\\') || resolve(parent).startsWith(resolve(tmpdir()) + '/'))
    await rm(parent, { recursive: true })
  })
  const source = join(parent, 'source')
  await cp('C:/Users/cezar/Desktop/bitreca-deletion-review/candidate-module-discovery-off-20261027', source, { recursive: true })
  const manifest = await readJSON(join(source, 'deployment-artifact.json'))
  const bytes = await readFile(new URL('../migrations/0014_add_solo_operator_authorization.sql', import.meta.url))
  const path = 'migrations/0014_add_solo_operator_authorization.sql'
  await writeFile(join(source, path), bytes)
  manifest.files.push({ path, bytes: bytes.length, sha256: sha(bytes) })
  await writeFile(join(source, 'deployment-artifact.json'), JSON.stringify(manifest, null, 2) + '\n')
  const sealed = await sealCandidate(source, join(parent, 'sealed'))
  return { parent, source, sealed }
}
test('solo release sealing checks every digest, retains exact frozen configuration and prepares migration-only approval', async t => {
  const f = await fixture(t)
  assert.equal(f.sealed.files, 25); assert.equal(f.sealed.migrations, 14); assert.equal(f.sealed.ownerPinned, false)
  for (const name of ['main.wrangler.jsonc', 'hosting.wrangler.jsonc']) assert.deepEqual(await readFile(join(f.source, name)), await readFile(join(f.sealed.directory, name)))
  const plan = await prepareReleasePlan({ candidate: f.sealed.directory, expectedPin: f.sealed.artifactSha256, output: join(f.parent, 'plan') })
  assert.deepEqual(plan.stagesReady, ['migration'])
  const text = await readFile(join(plan.directory, 'migration.ps1'), 'utf8')
  assert.ok(text.includes('if (-not $Approved)')); assert.ok(text.includes(plan.planSha256)); assert.ok(text.includes('--approved-migration'))
  await assert.rejects(prepareReleasePlan({ candidate: f.sealed.directory, expectedPin: '0'.repeat(64), output: join(f.parent, 'wrong') }))
  await writeFile(join(f.sealed.directory, 'main-worker.mjs'), 'tampered')
  await assert.rejects(sealCandidate(f.sealed.directory, join(f.parent, 'tampered')))
})
test('solo owner successor pins only public data, preserves code hashes and prepares distinct approval stages', async t => {
  const f = await fixture(t)
  // Public P-256 generator point as a public-only fixture; no private key exists.
  const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256',
    x: Buffer.from('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296', 'hex').toString('base64url'),
    y: Buffer.from('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5', 'hex').toString('base64url') }, format: 'jwk' })
  const publicFile = join(f.parent, 'fixture-public.pem')
  await writeFile(publicFile, publicKey.export({ type: 'spki', format: 'pem' }))
  const owner = await prepareOwnerCandidate({ source: f.sealed.directory, output: join(f.parent, 'owner'), publicKey: publicFile,
    operatorId: 'fixture-owner', policyId: '11111111-1111-4111-8111-111111111111', enrolledAt: Math.floor(Date.now() / 1000) })
  assert.deepEqual(await readFile(join(owner.candidate, 'main-worker.mjs')), await readFile(join(f.sealed.directory, 'main-worker.mjs')))
  const plan = await prepareReleasePlan({ candidate: owner.candidate, expectedPin: owner.artifactSha256,
    enrollmentFile: join(owner.directory, 'enrollment.json'), output: join(f.parent, 'owner-plan') })
  assert.deepEqual(plan.stagesReady, ['migration', 'enrollment', 'deployment'])
  const data = await readJSON(join(plan.directory, 'release-plan.json'))
  assert.equal(data.enrollment.authorization.storageScope, `portfolioforest/staging/${sandboxResources.bucket}/${sandboxResources.databaseId}`)
  assert.ok(!JSON.stringify(data).includes('PRIVATE KEY'))
  const row = { migrations: JSON.stringify(data.migrations.slice(0, 13)), portfolios: 0, allocations: 0, origins: 0,
    events: 0, seals: 0, epochs: 0, jobs: 0, finalizations: 0, unsettled: 0, protocol: 0, revision: 0, cleanup: 0, finalization: 0 }
  validateDatabaseState(row, data, 'migration')
  for (const field of ['portfolios', 'allocations', 'unsettled', 'protocol', 'cleanup', 'finalization', 'revision']) {
    assert.throws(() => validateDatabaseState({ ...row, [field]: 1 }, data, 'migration'))
  }
  assert.throws(() => validateDatabaseState({ ...row, migrations: JSON.stringify([...data.migrations.slice(0, 12), data.migrations[0]]) }, data, 'migration'))
  const independent = { ...row, migrations: JSON.stringify(data.migrations), policy: 'independent-v1', generation: 0, policies: 0, revocations: 0 }
  validateDatabaseState(independent, data, 'enrollment')
  const auth = data.enrollment.authorization
  const solo = { ...independent, policy: 'solo-operator-v1', generation: 1, policies: 1, revision: 1,
    policy_id: auth.policyId, operator_id: auth.operatorId, operator_key_id: auth.operatorKeyId, storage_scope: auth.storageScope,
    deployment_sha256: auth.deploymentSha256, enrolled_at: auth.enrolledAt }
  validateDatabaseState(solo, data, 'deployment')
  assert.throws(() => validateDatabaseState({ ...solo, revocations: 1 }, data, 'deployment'))
  assert.throws(() => validateDatabaseState({ ...solo, operator_key_id: '0'.repeat(64) }, data, 'deployment'))
})
test('solo deployment targets each distinct sandbox Worker once, verifies each, and rejects partial completion', async () => {
  const plan = { workers: [{ name: sandboxResources.mainName }, { name: sandboxResources.hostingName }] }
  for (const failure of ['none', 'main', 'hosting', 'verify-hosting', 'wrong-worker']) {
    const targeted = [], verified = []
    const operation = deployBoth(plan, async worker => {
      targeted.push(worker.name)
      if ((failure === 'main' && targeted.length === 1) || (failure === 'hosting' && targeted.length === 2)) throw new Error('Mock failure')
      return '11111111-1111-4111-8111-111111111111'
    }, async (worker, version) => {
      verified.push(worker.name)
      return { Verified: !(failure === 'verify-hosting' && verified.length === 2),
        Name: failure === 'wrong-worker' ? 'unexpected-worker' : worker.name, Version: version }
    })
    if (failure === 'none') { assert.equal((await operation).length, 2); assert.deepEqual(targeted, plan.workers.map(w => w.name)); assert.deepEqual(verified, targeted) }
    else await assert.rejects(operation)
  }
})

test('deployment completion cannot collide with or overwrite the two-Worker receipt', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bitreca-completion-test-'))
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '\\') || resolve(directory).startsWith(resolve(tmpdir()) + '/'))
    await rm(directory, { recursive: true })
  })
  const receipt = JSON.stringify([{ Name: sandboxResources.mainName, Verified: true }, { Name: sandboxResources.hostingName, Verified: true }])
  const receiptPath = join(directory, 'deployment-result.json')
  await writeFile(receiptPath, receipt, { flag: 'wx' })
  // Reproduce the prior defect without any deployment or Cloudflare access.
  await assert.rejects(writeFile(receiptPath, '{}', { flag: 'wx' }), { code: 'EEXIST' })
  const state = { protocol: 0, cleanup: 0, finalization: 0, generation: 1 }
  await saveStageCompletion(directory, 'deployment', state)
  assert.equal(await readFile(receiptPath, 'utf8'), receipt)
  const completionPath = join(directory, 'deployment-completion.json')
  const completion = await readJSON(completionPath)
  assert.equal(completion.stage, 'deployment')
  assert.deepEqual(completion.state, state)
  const originalCompletion = await readFile(completionPath, 'utf8')
  await assert.rejects(saveStageCompletion(directory, 'deployment', state), { code: 'EEXIST' })
  assert.equal(await readFile(completionPath, 'utf8'), originalCompletion)
  assert.equal(await readFile(receiptPath, 'utf8'), receipt)
})
