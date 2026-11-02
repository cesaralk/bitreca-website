// Offline review only. No Cloudflare client, credentials, or mutation executor.
import assert from 'node:assert/strict'
import { prepareSoloEnrollment } from './portfolio-evidence.mjs'
export const recoveryTarget = Object.freeze({ account: '4ec868eac2a3b9127531ad39d2501f15', database: 'bitreca-delete-sandbox-db-20261025', databaseId: '9c236935-b942-4cd7-9360-fed24db999fa', bucket: 'bitreca-delete-sandbox-r2-20261025' })
export const generation2Key = '2b0c4db371b429f5af93a57900133df8599504116ef96ad9522bd06704cc1012'
export function validateRecovery(snapshot, stage, enrollment) {
  assert.ok(['activate2', 'enroll3', 'activate3'].includes(stage), 'Unknown separately approved stage')
  assert.deepEqual(snapshot.target, recoveryTarget, 'Sandbox identity mismatch')
  const generation = stage === 'activate2' ? 1 : 2
  assert.equal(snapshot.generation, generation, 'Incorrect generation')
  assert.equal(snapshot.revision, generation, 'Stale runtime revision')
  assert.equal(snapshot.protocol, 1)
  for (const control of ['cleanup', 'finalization', 'deletion', 'import', 'schedules', 'publicAccess']) assert.equal(snapshot[control], false, control)
  assert.equal(snapshot.frozen, true)
  for (const count of ['portfolios', 'epochs', 'allocations', 'jobs', 'unsettledWriters']) assert.equal(snapshot[count], 0, count)
  assert.equal(snapshot.generation2Key, generation2Key, 'Generation-2 key mismatch')
  assert.equal(snapshot.revoked, false)
  assert.equal(snapshot.historyIntact, true)
  assert.equal(snapshot.existingOutputs, false, 'Existing outputs must be preserved')
  if (stage !== 'activate2') {
    assert.equal(enrollment?.authorization.policyGeneration, 3)
    assert.equal(enrollment.authorization.operatorId, 'bitreca-owner')
    assert.match(enrollment.authorization.operatorKeyId, /^[a-f0-9]{64}$/)
    assert.notEqual(enrollment.authorization.operatorKeyId, generation2Key)
    assert.equal(enrollment.authorization.operatorKeyId, snapshot.reviewedGeneration3Fingerprint, 'Generation-3 public pin differs')
  }
  return { stage, planOnly: true, expectedPostGeneration: stage === 'enroll3' ? 2 : generation + 1,
    expectedPostRevision: stage === 'enroll3' ? 2 : generation + 1,
    warning: 'No execution authorized. Fresh provider state, immutable history, exact public pins and atomic D1 preconditions require separate review.' }
}
export async function guardedRecoveryStage({ approved = false, verifyBefore, applyOnce, reconcile }) {
  assert.equal(approved, true, 'Separate stage approval required')
  await verifyBefore()
  try { await applyOnce() } catch {
    throw new Error('Outcome unresolved: stop, preserve receipt, reconcile read-only; never retry or advance automatically')
  }
  await reconcile() // Never reports completion if readback fails.
  return { completed: true }
}
export function prepareRecoverySQL(snapshot, stage, inputs) {
  // Rebuild public enrollment rather than trusting caller-supplied SQL or pins.
  const enrollment = stage === 'activate2' ? null : prepareSoloEnrollment(inputs)
  const plan = validateRecovery(snapshot, stage, enrollment)
  const quote = value => "'" + value.replaceAll("'", "''") + "'"
  assert.match(snapshot.generation2PolicyId, /^[a-f0-9-]{36}$/)
  const scope = `portfolioforest/staging/${recoveryTarget.bucket}/${recoveryTarget.databaseId}`
  if (enrollment) assert.equal(enrollment.authorization.storageScope, scope)
  const newKeyGuard = enrollment && stage === 'enroll3' ? ` AND NOT EXISTS(SELECT 1 FROM portfolio_storage_authorization_policies WHERE operator_key_id=${quote(enrollment.authorization.operatorKeyId)})` : ''
  const generation = snapshot.generation
  const guard = `SELECT CASE WHEN
    (SELECT generation FROM portfolio_storage_authorization_state WHERE id=1 AND policy='solo-operator-v1')=${generation}
    ${generation === 2 ? `AND (SELECT policy_id FROM portfolio_storage_authorization_state WHERE id=1)=${quote(snapshot.generation2PolicyId)}` : ''}
    AND (SELECT revision FROM portfolio_deletion_runtime_policy WHERE id=1 AND cleanup_enabled=0 AND finalization_enabled=0)=${snapshot.revision}
    AND (SELECT minimum_protocol_version FROM portfolio_storage_writer_policy WHERE id=1)=1
    AND (SELECT count(*) FROM portfolios)=0
    AND (SELECT count(*) FROM portfolio_storage_allocations)=0
    AND (SELECT count(*) FROM portfolio_deletion_jobs)=0
    AND (SELECT count(*) FROM portfolio_storage_protocol_verifications)=0
    AND (SELECT count(*) FROM portfolio_storage_key_revocations)=0
    AND EXISTS(SELECT 1 FROM portfolio_storage_authorization_policies WHERE generation=2 AND id=${quote(snapshot.generation2PolicyId)} AND operator_key_id='${generation2Key}' AND storage_scope='${scope}')
    AND (SELECT count(*) FROM portfolio_storage_authorization_policies)=${stage === 'activate3' ? 3 : 2}
    ${newKeyGuard}
    THEN 1 ELSE 0 END`
  let change
  if (stage === 'enroll3') change = enrollment.enrollmentSQL.split('\nUPDATE portfolio_storage_authorization_state')[0]
  else {
    const id = stage === 'activate2' ? snapshot.generation2PolicyId : enrollment.authorization.policyId
    const keyCheck = stage === 'activate3' ? ` AND EXISTS(SELECT 1 FROM portfolio_storage_authorization_policies WHERE id=${quote(id)} AND generation=3 AND operator_key_id=${quote(enrollment.authorization.operatorKeyId)} AND deployment_sha256=${quote(enrollment.authorization.deploymentSha256)} AND storage_scope='${scope}')` : ''
    change = `UPDATE portfolio_storage_authorization_state SET generation=${generation + 1},policy_id=${quote(id)} WHERE id=1 AND generation=${generation}${keyCheck};\nINSERT INTO recovery_assert VALUES(changes());`
  }
  return { ...plan, enrollment, sql: `-- REVIEW ONLY. Execute only as a separately approved atomic D1 batch after provider/config identity checks.\nCREATE TEMP TABLE recovery_assert(ok INTEGER CHECK(ok=1));\nINSERT INTO recovery_assert ${guard};\n${change}\nDROP TABLE recovery_assert;` }
}
