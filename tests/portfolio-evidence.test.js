import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { signEvidence, verifyEvidencePackage, sha256, publicKeyPin, prepareSoloEnrollment } from '../scripts/portfolio-evidence.mjs'

test('offline signing and verification bind fake deployment, audit, scope, and public key', async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' })
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' })
  const deployment = Buffer.from('fake isolated artifact'), audit = Buffer.from('fake independent audit')
  const report = { id: '11111111-1111-4111-8111-111111111111', storage_scope: 'isolated-fixture',
    deployment_sha256: sha256(deployment), evidence_sha256: sha256(audit), legacy_writers_settled: true,
    verified_at: Math.floor(Date.now() / 1000) }
  const evidence = await signEvidence({ report, privateKey, deployment, audit, acknowledged: true })
  const input = { evidence, publicKey, scope: report.storage_scope, deployment, audit }
  assert.equal((await verifyEvidencePackage(input)).report.id, report.id)
  const pin = publicKeyPin(publicKey)
  assert.equal((await verifyEvidencePackage({ ...input, expectedSigner: pin.signer_sha256 })).signer, pin.signer_sha256)
  await assert.rejects(verifyEvidencePackage({ ...input, expectedSigner: '0'.repeat(64) }))
  await assert.rejects(verifyEvidencePackage({ ...input, scope: 'foreign' }))
  await assert.rejects(verifyEvidencePackage({ ...input, audit: Buffer.from('different') }))
  await assert.rejects(verifyEvidencePackage({ ...input, deployment: Buffer.from('different') }))
  await assert.rejects(signEvidence({ report, privateKey, deployment, audit, acknowledged: false }))
  await assert.rejects(signEvidence({ report: { ...report, legacy_writers_settled: false }, privateKey, deployment, audit, acknowledged: true }))
})

test('offline public pin requires a P-256 public key and never accepts private PEM or another curve', () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' })
  const pin = publicKeyPin(publicKey)
  const der = pair.publicKey.export({ type: 'spki', format: 'der' })
  assert.equal(pin.signer_sha256, sha256(der))
  assert.deepEqual(Buffer.from(pin.public_key_spki_base64, 'base64'), der)
  assert.throws(() => publicKeyPin(pair.privateKey.export({ type: 'pkcs8', format: 'pem' })))
  const other = generateKeyPairSync('ec', { namedCurve: 'secp384r1' })
  assert.throws(() => publicKeyPin(other.publicKey.export({ type: 'spki', format: 'pem' })))
})

test('offline solo enrollment and signing require explicit owner policy pins and settlement acknowledgement', async () => {
  // Ephemeral test-only keys and synthetic artifacts; no files or network.
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' })
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' })
  const deployment = Buffer.from('synthetic reviewed code manifest'), audit = Buffer.from('synthetic settlement audit')
  const now = Math.floor(Date.now() / 1000), scope = 'portfolioforest/staging/fixture-bucket/22222222-2222-4222-8222-222222222222'
  const enrollment = prepareSoloEnrollment({ publicKey, scope, deployment, policyId: '11111111-1111-4111-8111-111111111111',
    generation: 1, operatorId: 'fixture-owner', enrolledAt: now })
  assert.equal(enrollment.environment.PORTFOLIO_AUTHORIZATION_POLICY, 'solo-operator-v1')
  assert.ok(!JSON.stringify(enrollment).includes('PRIVATE KEY'))
  const authorization = enrollment.authorization
  const report = { version: 2, id: '22222222-2222-4222-8222-222222222222', authorization_policy: 'solo-operator-v1',
    policy_id: authorization.policyId, policy_generation: 1, operator_id: 'fixture-owner', operator_key_id: authorization.operatorKeyId,
    deployment_verified_at: now, writers_fenced_at: now, writers_settled_at: now,
    storage_scope: scope, deployment_sha256: sha256(deployment), evidence_sha256: sha256(audit),
    legacy_writers_settled: true, verified_at: now }
  const input = { report, privateKey, deployment, audit, ownerAcknowledged: true, settlementAcknowledged: true, authorization }
  const evidence = await signEvidence(input)
  assert.equal((await verifyEvidencePackage({ evidence, publicKey, scope, deployment, audit, authorization })).report.version, 2)
  await assert.rejects(signEvidence({ ...input, authorization: undefined }))
  await assert.rejects(signEvidence({ ...input, settlementAcknowledged: false }))
  await assert.rejects(signEvidence({ ...input, acknowledged: true }))
  await assert.rejects(signEvidence({ ...input, report: { ...report, version: undefined }, ownerAcknowledged: false, acknowledged: true }))
  await assert.rejects(verifyEvidencePackage({ evidence, publicKey, scope, deployment, audit,
    authorization: { ...authorization, storageScope: 'foreign' } }))
  await assert.rejects(verifyEvidencePackage({ evidence, publicKey, scope, deployment, audit }))
  await assert.rejects(signEvidence({ ...input, authorization: { ...authorization, enrolledAt: now + 1 } }))
})
