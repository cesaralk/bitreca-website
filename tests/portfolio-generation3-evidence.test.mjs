import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generation3EvidenceIdentity as identity, validateGeneration3EvidenceFields } from '../scripts/generation3-evidence.mjs'

function fixture() {
  const authorization = { authorizationPolicy: 'solo-operator-v1', policyId: identity.policyId, policyGeneration: 3,
    operatorId: 'bitreca-owner', operatorKeyId: identity.fingerprint, storageScope: identity.scope,
    deploymentSha256: identity.codeSha256, enrolledAt: identity.enrolledAt }
  const time = identity.enrolledAt + 100, candidateSha256 = 'a'.repeat(64)
  const report = { version: 2, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', authorization_policy: authorization.authorizationPolicy,
    policy_id: authorization.policyId, policy_generation: 3, operator_id: authorization.operatorId, operator_key_id: authorization.operatorKeyId,
    deployment_verified_at: time, writers_fenced_at: time + 1, writers_settled_at: time + 2, storage_scope: identity.scope,
    writer_protocol: 1, deployment_sha256: identity.codeSha256, evidence_sha256: 'b'.repeat(64), legacy_writers_settled: true, verified_at: time + 4 }
  const audit = { owner_confirmation: { operator: 'bitreca-owner', policyGeneration: 3, fingerprint: identity.fingerprint, storageScope: identity.scope,
    confirmedAt: time + 3, factualWriterSettlementReviewed: true, soleOwnerResponsibilityAcknowledged: true },
    settlement_observations: [{ summary: 'PUBLIC synthetic validator fixture; not operational settlement evidence', referencePaths: ['/public-fixture.json'] }],
    inferences: [], residual_risks: [] }
  const completion = { verifiedAt: time,
    workers: ['bitreca-main-delete-sandbox-20261025', 'bitreca-hosting-delete-sandbox-20261025'].map(Name => ({ Name, Version: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Verified: true,
      Frozen: true, Private: true, Schedules: 0, CandidateManifestSha256: candidateSha256 })),
    state: { state: [{ id: 1, policy: 'solo-operator-v1', generation: 3, policy_id: identity.policyId }], protocol: 1,
      runtime: [{ id: 1, revision: 3, cleanup_enabled: 0, finalization_enabled: 0 }], revocations: [], policies: [{}, {},
        { id: identity.policyId, generation: 3, policy: authorization.authorizationPolicy, operator_id: authorization.operatorId,
          operator_key_id: authorization.operatorKeyId, storage_scope: identity.scope, deployment_sha256: identity.codeSha256, enrolled_at: identity.enrolledAt }],
      portfolios: 0, allocations: 0, jobs: 0, epochs: 0 } }
  return { report, authorization, audit, completion, candidateSha256, now: time + 10 }
}
test('generation-3 evidence validates public pins, current policy, both frozen deployments and chronology without signing', () => {
  assert.equal(validateGeneration3EvidenceFields(fixture()), true)
})
test('old policy/key/artifact, fabricated chronology, partial deployment and missing factual acknowledgment remain blocked', () => {
  const changes = [
    f => { f.report.policy_generation = 1 }, f => { f.report.operator_key_id = '0'.repeat(64) },
    f => { f.report.deployment_sha256 = '0'.repeat(64) }, f => { f.report.deployment_verified_at-- },
    f => { f.report.writers_settled_at = f.report.writers_fenced_at - 1 }, f => { f.completion.workers.pop() },
    f => { f.completion.workers[1].Frozen = false }, f => { f.completion.state.runtime[0].cleanup_enabled = 1 },
    f => { f.completion.state.state[0].generation = 2 }, f => { f.audit.owner_confirmation.factualWriterSettlementReviewed = false },
    f => { f.audit.settlement_observations = [] }, f => { f.report.extra = 'silently stripped field' },
  ]
  for (const change of changes) { const f = fixture(); change(f); assert.throws(() => validateGeneration3EvidenceFields(f)) }
})
