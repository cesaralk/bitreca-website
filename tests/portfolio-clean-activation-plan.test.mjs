import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildCleanPortfolioProposal, cleanProductionBucket, existingOwnerFingerprint } from '../scripts/prepare-clean-portfolio-activation.mjs'

// PUBLIC retained inputs only. No key generation, signing, network or resources.
const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
const read = name => JSON.parse(readFileSync(name, 'utf8').replace(/^\ufeff/, ''))
function input() {
  return { main: read(review + '/production-pinned-main-20261031/main.wrangler.jsonc'),
    hosting: read('C:/Users/cezar/Desktop/bitreca-deletion-integration/wrangler.portfolio-hosting.jsonc'),
    authorization: read(review + '/production-owner-authorization-20261031/owner-authorization.json'),
    newBucket: cleanProductionBucket, policyId: '22222222-2222-4222-8222-222222222222', deploymentSha256: 'a'.repeat(64) }
}
test('clean proposal preserves old project/legacy bindings and changes only future storage with the SAME owner key', () => {
  const source = input(), original = structuredClone(source), result = buildCleanPortfolioProposal(source)
  assert.deepEqual(source, original)
  assert.equal(result.main.r2_buckets[0].binding, 'bitreca_media')
  assert.equal(result.hosting.r2_buckets[0].binding, 'PORTFOLIO_FILES')
  for (const config of [result.main, result.hosting]) {
    assert.equal(config.r2_buckets[0].bucket_name, 'bitreca-media')
    assert.equal(config.r2_buckets[1].binding, 'PORTFOLIO_STORAGE')
    assert.equal(config.r2_buckets[1].bucket_name, cleanProductionBucket)
    assert.equal(config.vars.PORTFOLIO_MUTATIONS_FROZEN, 'true')
    assert.equal(config.vars.PORTFOLIO_CLEAN_STORAGE_ENABLED, 'true')
    assert.deepEqual(config.triggers.crons, [])
    for (const [name, value] of Object.entries(config.vars)) if (/_ENABLED$/.test(name) && name !== 'PORTFOLIO_CLEAN_STORAGE_ENABLED') assert.equal(value, 'false')
  }
  assert.equal(result.proposedAuthorization.policyGeneration, 2)
  assert.equal(result.proposedAuthorization.operatorKeyId, existingOwnerFingerprint)
  assert.equal(result.proposedAuthorization.enrolledAt, null)
  assert.equal(result.main.vars.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI, original.main.vars.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI)
  assert.equal(result.main.assets.directory, source.main.assets.directory)
})
test('wrong or reused bucket/database/Worker identities and duplicate bindings fail closed', () => {
  for (const mutate of [
    x => { x.newBucket = 'bitreca-media' },
    x => { x.newBucket = 'bitreca-delete-sandbox-r2-20261025' },
    x => { x.main.d1_databases[0].database_id = '9c236935-b942-4cd7-9360-fed24db999fa' },
    x => { x.hosting.name = 'some-other-worker' },
    x => { x.main.r2_buckets.push(structuredClone(x.main.r2_buckets[0])) },
  ]) { const x = input(); mutate(x); assert.throws(() => buildCleanPortfolioProposal(x)) }
})
test('changed public key, stale generation, policy reuse and unreviewed artifact cannot become a proposal', () => {
  for (const mutate of [
    x => { x.authorization.operatorKeyId = 'b'.repeat(64) },
    x => { x.main.vars.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI = '' },
    x => { x.authorization.policyGeneration = 2 },
    x => { x.policyId = x.authorization.policyId },
    x => { x.deploymentSha256 = x.authorization.deploymentSha256 },
    x => { delete x.deploymentSha256 },
    x => { delete x.policyId },
  ]) { const x = input(); mutate(x); assert.throws(() => buildCleanPortfolioProposal(x)) }
})
test('unsafe source controls, schedules, secret values and environment overrides are refused', () => {
  for (const mutate of [
    x => { x.main.vars.PORTFOLIO_CLEANUP_ENABLED = 'true' },
    x => { x.main.vars.PORTFOLIO_EVIDENCE_IMPORT_ENABLED = 'true' },
    x => { x.hosting.triggers = { crons: ['* * * * *'] } },
    x => { x.main.vars.ADMIN_PASSWORD = 'TEST-ONLY-NOT-A-CREDENTIAL' },
    x => { x.main.env = { production: {} } },
  ]) { const x = input(); mutate(x); assert.throws(() => buildCleanPortfolioProposal(x)) }
})
test('proposal cannot certify bucket absence, settlement, deployment, retirement, enrollment or signing', () => {
  const result = buildCleanPortfolioProposal(input())
  assert.equal(result.deploymentReady, false)
  assert.equal(result.executionAuthorized, false)
  assert.equal(result.remoteOperations, false)
  assert.equal(result.evidence.legacy_writers_settled, false)
  assert.ok(Object.values(result.evidence).every(value => value === false))
  assert.deepEqual(result.legacy.ids, [5, 6, 7, 8, 9, 10])
  assert.equal(result.legacy.adoptedIntoNewEpoch, false)
  assert.equal(result.legacy.retirementAuthorized, false)
  assert.ok(result.separateApprovalStages.some(stage => stage.includes('emptiness alone is insufficient')))
  assert.ok(result.separateApprovalStages.some(stage => stage.includes('Privately sign')))
})
