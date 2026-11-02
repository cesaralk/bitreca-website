import assert from 'node:assert/strict'
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { canonicalReport, publicKeyPin, signEvidence, verifyEvidencePackage } from './portfolio-evidence.mjs'

// Offline only. No Cloudflare/Wrangler/network imports. --plan never reads a key.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
export const step3Paths = {
  report: review + '/solo-settlement-review-20261028/owner-evidence-v2.UNSIGNED.json',
  payload: review + '/solo-settlement-review-20261028/owner-evidence-v2.canonical.UNSIGNED.json',
  audit: review + '/solo-settlement-review-20261028/owner-settlement-audit.json',
  authorization: review + '/solo-settlement-review-20261028/owner-authorization.json',
  receipt: review + '/solo-settlement-review-20261028/protocol-1-reconciled.json',
  deployment: review + '/solo-settlement-review-20261028/code-artifacts.json',
  candidate: review + '/solo-owner-pinned-20261027/candidate',
  publicKey: review + '/solo-owner-public-20261027/owner-public.pem',
  encryptedKey: 'C:/Users/cezar/BitrecaOwnerKeys/solo-owner-v1-20261027/owner-key.encrypted.pk8.pem',
  signed: review + '/solo-step3-20261028/owner-evidence-v2.SIGNED.json',
  signingReceipt: review + '/solo-step3-20261028/offline-signing-result.json',
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
export function validateStep3Fields(report, authorization, fingerprint, receipt, now) {
  assert.equal(report.version, 2)
  assert.equal(report.authorization_policy, 'solo-operator-v1')
  assert.equal(authorization.authorizationPolicy, 'solo-operator-v1')
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(report.id))
  assert.equal(report.policy_id, authorization.policyId)
  assert.equal(report.policy_generation, 1)
  assert.equal(authorization.policyGeneration, 1)
  assert.equal(report.operator_id, 'bitreca-owner')
  assert.equal(authorization.operatorId, report.operator_id)
  assert.equal(report.operator_key_id, fingerprint)
  assert.equal(authorization.operatorKeyId, fingerprint)
  assert.equal(report.storage_scope, authorization.storageScope)
  assert.equal(report.deployment_sha256, authorization.deploymentSha256)
  assert.equal(report.writer_protocol, 1)
  assert.equal(report.legacy_writers_settled, true)
  const times = [authorization.enrolledAt, report.deployment_verified_at, report.writers_fenced_at,
    report.writers_settled_at, report.verified_at, now]
  assert.ok(times.every(value => Number.isSafeInteger(value) && value >= 0))
  assert.ok(times.every((value, index) => index === 0 || value >= times[index - 1]), 'Chronology differs.')
  const state = receipt.state
  assert.equal(state.protocol, 1)
  assert.equal(state.generation, 1)
  assert.equal(state.policy, 'solo-operator-v1')
  assert.equal(state.policy_id, report.policy_id)
  assert.equal(state.operator_key_id, fingerprint)
  assert.equal(state.operator_id, report.operator_id)
  assert.equal(state.storage_scope, report.storage_scope)
  assert.equal(state.deployment_sha256, report.deployment_sha256)
  assert.equal(state.revision, 1)
  for (const field of ['cleanup', 'finalization', 'epochs', 'revocations', 'portfolios', 'allocations', 'unsettled']) assert.equal(state[field], 0)
}
export async function validateStep3Inputs() {
  const p = step3Paths, report = await readJSON(p.report), authorization = await readJSON(p.authorization)
  const audit = await readFile(p.audit), deployment = await readFile(p.deployment), publicKey = await readFile(p.publicKey)
  const fingerprint = publicKeyPin(publicKey).signer_sha256
  assert.equal(fingerprint, '3fb65d834cb5138bd49adeb5ee866268216183df7a0964eda5fe088a25c3d373')
  assert.equal(sha(audit), report.evidence_sha256)
  assert.equal(sha(deployment), report.deployment_sha256)
  assert.equal(await readFile(p.payload, 'utf8'), canonicalReport(report))
  for (const ref of JSON.parse(audit).references) {
    const bytes = await readFile(ref.path)
    assert.equal(bytes.length, ref.bytes)
    assert.equal(sha(bytes), ref.sha256, 'Referenced evidence differs.')
  }
  const manifestBytes = await readFile(join(p.candidate, 'deployment-artifact.json'))
  assert.equal(sha(manifestBytes), '6ac0303aca92f5adf28e5512195d81ecffd5526759a3828cc26726e1af55520a')
  const manifest = JSON.parse(manifestBytes)
  assert.equal(manifest.target, 'portfolioforest-delete-sandbox')
  assert.equal(manifest.files.length, 25)
  for (const entry of manifest.files) {
    const path = resolve(p.candidate, entry.path), child = relative(resolve(p.candidate), path)
    assert.ok(child && !isAbsolute(child) && !child.startsWith('..') && !entry.path.includes('\\'))
    assert.ok((await lstat(path)).isFile())
    const bytes = await readFile(path)
    assert.equal(bytes.length, entry.bytes); assert.equal(sha(bytes), entry.sha256)
  }
  const receipt = await readJSON(p.receipt)
  validateStep3Fields(report, authorization, fingerprint, receipt, Math.floor(Date.now() / 1000))
  return { report, authorization, fingerprint, audit, deployment, publicKey }
}
async function mustNotExist(path) {
  try { await lstat(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  throw new Error('Signing output already exists; preserve it without retrying.')
}
async function main(command) {
  const input = await validateStep3Inputs()
  if (!command || command === '--plan') {
    console.log(JSON.stringify({ validation: 'PASS', report: input.report.id, fingerprint: input.fingerprint,
      retained_protocol: 1, policy_generation: 1, chronology: 'PASS; assessment predates cutover legitimately',
      signing: 'NOT RUN', private_key_read: false, network: false,
      import: 'Separate approval and verified operator-only access/control/restoration plan required.' }))
    return
  }
  const verify = evidence => verifyEvidencePackage({ evidence, publicKey: input.publicKey, scope: input.report.storage_scope,
    deployment: input.deployment, audit: input.audit, expectedSigner: input.fingerprint, authorization: input.authorization })
  if (command === '--verify-signed') {
    const evidence = await readJSON(step3Paths.signed)
    assert.equal(evidence.payload, canonicalReport(input.report))
    await verify(evidence)
    console.log('PASS: signed evidence matches reviewed report, P-256 public pin, policy, scope, chronology and artifact hashes. No import.')
    return
  }
  assert.equal(command, '--approved-signing', 'Explicit offline signing approval required.')
  assert.equal(process.argv.length, 3)
  await mustNotExist(step3Paths.signed); await mustNotExist(step3Paths.signingReceipt)
  const keyPath = await realpath(step3Paths.encryptedKey), child = relative(repository, keyPath)
  assert.ok(isAbsolute(child) || child === '..' || child.startsWith('..\\') || child.startsWith('../'), 'Key must stay outside Git.')
  const chunks = []
  let passphrase, encryptedKey
  try {
    let length = 0
    for await (const chunk of process.stdin) {
      length += chunk.length; assert.ok(length <= 4096)
      chunks.push(Buffer.from(chunk))
    }
    passphrase = Buffer.concat(chunks)
    if (passphrase.at(-1) === 10) passphrase = passphrase.subarray(0, -1)
    if (passphrase.at(-1) === 13) passphrase = passphrase.subarray(0, -1)
    assert.ok(passphrase.length >= 20 && !passphrase.includes(0) && !passphrase.includes(10) && !passphrase.includes(13))
    encryptedKey = await readFile(keyPath)
    assert.ok(encryptedKey.subarray(0, 50).toString('ascii').startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----'))
    // createPrivateKey accepts this options object; no decrypted PEM is exported.
    const evidence = await signEvidence({ report: input.report,
      privateKey: { key: encryptedKey, format: 'pem', passphrase }, deployment: input.deployment, audit: input.audit,
      authorization: input.authorization, ownerAcknowledged: true, settlementAcknowledged: true })
    await verify(evidence)
    const bytes = JSON.stringify(evidence, null, 2) + '\n'
    assert.ok(Buffer.byteLength(bytes) <= 32768)
    await writeFile(step3Paths.signed, bytes, { flag: 'wx', mode: 0o600 })
    await writeFile(step3Paths.signingReceipt, JSON.stringify({ at: new Date().toISOString(), report: input.report.id,
      fingerprint: input.fingerprint, signed_sha256: sha(bytes), signature_verified: true, imported: false, network: false }, null, 2) + '\n', { flag: 'wx' })
    console.log('Offline signing and verification complete. Only the public signed envelope and receipt were written. No import or network access.')
  } finally {
    passphrase?.fill(0); encryptedKey?.fill(0)
    for (const chunk of chunks) chunk.fill(0)
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(() => { console.error('Offline owner evidence operation refused. Stop; preserve outputs. No private material is printed and no automatic retry occurs.'); process.exitCode = 1 })
}
