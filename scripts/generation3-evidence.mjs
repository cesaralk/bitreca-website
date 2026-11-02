// OFFLINE ONLY. Default validation never reads a private key, signs or imports.
import assert from 'node:assert/strict'
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises'
import { createHash, createPublicKey } from 'node:crypto'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { canonicalReport, publicKeyPin, signEvidence, verifyEvidencePackage } from './portfolio-evidence.mjs'
import { verifyStagingPackage } from './prepare-portfolio-staging.mjs'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review/solo-generation3-pinned-20261029'
export const generation3EvidencePaths = {
  candidate: join(review, 'candidate'), authorization: join(review, 'owner-authorization.json'),
  plan: join(review, 'deployment-plan.json'), completion: join(review, 'deployment-completion.json'),
  report: join(review, 'evidence/owner-evidence-v2.UNSIGNED.json'), audit: join(review, 'evidence/owner-settlement-audit.json'),
  signed: join(review, 'evidence/owner-evidence-v2.SIGNED.json'), signingReceipt: join(review, 'evidence/offline-signing-result.json'),
  privateKey: 'C:/Users/cezar/BitrecaOwnerKeys/solo-owner-generation3/owner-key.encrypted.pk8.pem',
}
export const generation3EvidenceIdentity = Object.freeze({ policyId: '16563bc5-549f-490d-b392-9284c0769782',
  fingerprint: '7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e',
  scope: 'portfolioforest/staging/bitreca-delete-sandbox-r2-20261025/9c236935-b942-4cd7-9360-fed24db999fa',
  codeSha256: '97dee6f267be82e94ff094a96f39528eaa68e9afa6446284a01c71f36bfbb6d4', enrolledAt: 1793251322 })
const workers = ['bitreca-main-delete-sandbox-20261025', 'bitreca-hosting-delete-sandbox-20261025']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))

export function validateGeneration3EvidenceFields({ report, authorization, completion, audit, candidateSha256, now }) {
  const identity = generation3EvidenceIdentity
  assert.deepEqual(authorization, { authorizationPolicy: 'solo-operator-v1', policyId: identity.policyId, policyGeneration: 3,
    operatorId: 'bitreca-owner', operatorKeyId: identity.fingerprint, storageScope: identity.scope,
    deploymentSha256: identity.codeSha256, enrolledAt: identity.enrolledAt }, 'Generation-3 enrollment pins differ')
  assert.deepEqual(JSON.parse(canonicalReport(report)), report, 'Unknown/noncanonical report fields or silent conversion forbidden')
  assert.equal(report.version, 2); assert.equal(report.authorization_policy, authorization.authorizationPolicy)
  assert.equal(report.policy_id, authorization.policyId); assert.equal(report.policy_generation, 3)
  assert.equal(report.operator_id, authorization.operatorId); assert.equal(report.operator_key_id, authorization.operatorKeyId)
  assert.equal(report.storage_scope, authorization.storageScope); assert.equal(report.deployment_sha256, authorization.deploymentSha256)
  assert.equal(report.writer_protocol, 1); assert.equal(report.legacy_writers_settled, true)
  assert.match(report.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.match(report.evidence_sha256, /^[0-9a-f]{64}$/)
  assert.match(candidateSha256, /^[0-9a-f]{64}$/)
  const times = [authorization.enrolledAt, completion.verifiedAt, report.deployment_verified_at, report.writers_fenced_at,
    report.writers_settled_at, audit.owner_confirmation?.confirmedAt, report.verified_at, now]
  assert.ok(times.every(value => Number.isSafeInteger(value) && value >= 0), 'Missing real verification/settlement chronology')
  assert.ok(times.every((value, index) => !index || value >= times[index - 1]), 'Stale or future chronology')
  assert.equal(report.deployment_verified_at, completion.verifiedAt, 'Report must bind actual deployment verification time')
  assert.deepEqual(completion.workers?.map(row => row.Name), workers)
  for (const worker of completion.workers) {
    assert.equal(worker.Verified, true); assert.equal(worker.CandidateManifestSha256, candidateSha256)
    assert.equal(worker.Frozen, true); assert.equal(worker.Private, true); assert.equal(worker.Schedules, 0)
    assert.match(worker.Version, /^[0-9a-f-]{36}$/)
  }
  const state = completion.state
  assert.deepEqual(state.state, [{ id: 1, policy: 'solo-operator-v1', generation: 3, policy_id: authorization.policyId }])
  assert.equal(state.protocol, 1); assert.equal(state.runtime.length, 1)
  assert.equal(state.runtime[0].id, 1); assert.equal(state.runtime[0].revision, 3)
  assert.equal(state.runtime[0].cleanup_enabled, 0); assert.equal(state.runtime[0].finalization_enabled, 0)
  assert.deepEqual(state.revocations, []); assert.equal(state.policies.length, 3)
  const enrolled = state.policies.find(row => row.generation === 3)
  assert.deepEqual(enrolled, { id: authorization.policyId, generation: 3, policy: authorization.authorizationPolicy,
    operator_id: authorization.operatorId, operator_key_id: authorization.operatorKeyId, storage_scope: authorization.storageScope,
    deployment_sha256: authorization.deploymentSha256, enrolled_at: authorization.enrolledAt })
  for (const field of ['portfolios', 'allocations', 'jobs', 'epochs']) assert.equal(state[field], 0)
  // These are explicit owner-reviewed factual assertions, not software proof of external writer settlement.
  const owner = audit.owner_confirmation
  assert.equal(owner.operator, 'bitreca-owner'); assert.equal(owner.policyGeneration, 3)
  assert.equal(owner.fingerprint, identity.fingerprint); assert.equal(owner.storageScope, identity.scope)
  assert.equal(owner.factualWriterSettlementReviewed, true); assert.equal(owner.soleOwnerResponsibilityAcknowledged, true)
  assert.ok(Array.isArray(audit.settlement_observations) && audit.settlement_observations.length > 0, 'Actual settlement observations required')
  assert.ok(audit.settlement_observations.every(row => typeof row.summary === 'string' && row.summary.trim() &&
    Array.isArray(row.referencePaths) && row.referencePaths.length > 0), 'Every observation must cite retained records')
  assert.ok(Array.isArray(audit.inferences) && Array.isArray(audit.residual_risks), 'Distinguish observed facts, inferences and residual risks')
  return true
}

async function readPublicReference(ref) {
  assert.equal(typeof ref.path, 'string'); assert.ok(isAbsolute(ref.path)); assert.match(ref.sha256, /^[0-9a-f]{64}$/)
  assert.ok(Number.isSafeInteger(ref.bytes) && ref.bytes >= 0)
  const path = await realpath(ref.path)
  assert.ok(!/bitrecaownerkeys|(?:^|[\\/])(?:\.env|\.dev\.vars|[^\\/]*(?:private|encrypted|credential)[^\\/]*)/i.test(path), 'Private/credential inputs are forbidden in audit references')
  assert.ok(/\.(?:json|md|txt|log|mjs|js|ps1|sql)$/i.test(path), 'Only retained public operational records may be referenced')
  assert.ok((await lstat(ref.path)).isFile(), 'Reference must be a regular file')
  const bytes = await readFile(path)
  assert.equal(bytes.length, ref.bytes); assert.equal(sha(bytes), ref.sha256, 'Referenced evidence differs')
  return resolve(ref.path)
}
export async function validateGeneration3EvidenceInputs() {
  const p = generation3EvidencePaths
  const [report, authorization, completion, plan] = await Promise.all([readJSON(p.report), readJSON(p.authorization), readJSON(p.completion), readJSON(p.plan)])
  const audit = await readFile(p.audit), auditObject = JSON.parse(audit)
  assert.equal(sha(audit), report.evidence_sha256)
  assert.equal((await verifyStagingPackage(p.candidate)).artifactSha256, plan.candidateSha256, 'Reviewed candidate differs')
  const deployment = await readFile(join(p.candidate, 'code-artifacts.json'))
  assert.equal(sha(deployment), generation3EvidenceIdentity.codeSha256)
  const config = await readJSON(join(p.candidate, 'main.wrangler.jsonc'))
  const expectedVars = { PORTFOLIO_AUTHORIZATION_POLICY: authorization.authorizationPolicy,
    PORTFOLIO_AUTHORIZATION_POLICY_ID: authorization.policyId, PORTFOLIO_AUTHORIZATION_GENERATION: '3',
    PORTFOLIO_OPERATOR_ID: authorization.operatorId, PORTFOLIO_OPERATOR_KEY_ID: authorization.operatorKeyId,
    PORTFOLIO_DEPLOYMENT_SHA256: authorization.deploymentSha256, PORTFOLIO_STORAGE_SCOPE: authorization.storageScope }
  for (const filename of ['main.wrangler.jsonc', 'hosting.wrangler.jsonc']) {
    const candidateConfig = await readJSON(join(p.candidate, filename))
    for (const [name, value] of Object.entries(expectedVars)) assert.equal(candidateConfig.vars[name], value, 'Candidate policy pins differ from enrollment')
    const candidatePublic = createPublicKey({ key: Buffer.from(candidateConfig.vars.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI, 'base64'), type: 'spki', format: 'der' }).export({ type: 'spki', format: 'pem' })
    assert.equal(publicKeyPin(candidatePublic).signer_sha256, generation3EvidenceIdentity.fingerprint, 'Both candidate public keys must match generation 3')
  }
  const publicKey = createPublicKey({ key: Buffer.from(config.vars.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI, 'base64'), type: 'spki', format: 'der' }).export({ type: 'spki', format: 'pem' })
  assert.equal(publicKeyPin(publicKey).signer_sha256, generation3EvidenceIdentity.fingerprint)
  const code = JSON.parse(deployment)
  for (const worker of completion.workers) assert.equal(worker.JavaScriptSha256,
    code.workers.find(row => row.name === worker.Name)?.javascript_sha256, 'Verified deployment JavaScript differs from reviewed code artifact')
  assert.ok(Array.isArray(auditObject.references) && auditObject.references.length > 0)
  const refs = await Promise.all(auditObject.references.map(readPublicReference))
  assert.equal(new Set(refs).size, refs.length, 'Duplicate audit reference')
  assert.ok(refs.includes(resolve(p.completion)), 'Audit must retain and bind actual deployment completion')
  for (const observation of auditObject.settlement_observations || []) for (const path of observation.referencePaths || []) {
    assert.ok(refs.includes(resolve(path)), 'Settlement observation cites an unverified reference')
  }
  validateGeneration3EvidenceFields({ report, authorization, completion, audit: auditObject, candidateSha256: plan.candidateSha256, now: Math.floor(Date.now() / 1000) })
  return { report, authorization, audit, deployment, publicKey }
}
async function requireAbsent(path) {
  try { await lstat(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  throw new Error('Output already exists; preserve it and stop')
}
export async function generation3EvidenceCLI(command = '--plan') {
  assert.ok(['--plan', '--verify-signed', '--approved-signing'].includes(command))
  const input = await validateGeneration3EvidenceInputs()
  const verify = evidence => verifyEvidencePackage({ evidence, publicKey: input.publicKey, scope: generation3EvidenceIdentity.scope,
    deployment: input.deployment, audit: input.audit, expectedSigner: generation3EvidenceIdentity.fingerprint, authorization: input.authorization })
  if (command === '--plan') return { validation: 'PASS', generation: 3, signing: false, privateKeyRead: false, network: false,
    warning: 'Owner factual settlement assertions require genuine supporting records. No independent oversight is claimed. Import requires separate approval.' }
  if (command === '--verify-signed') {
    const evidence = await readJSON(generation3EvidencePaths.signed)
    assert.equal(evidence.payload, canonicalReport(input.report)); await verify(evidence)
    return { verified: true, imported: false }
  }
  await requireAbsent(generation3EvidencePaths.signed); await requireAbsent(generation3EvidencePaths.signingReceipt)
  const keyPath = await realpath(generation3EvidencePaths.privateKey), child = relative(repository, keyPath)
  assert.ok(isAbsolute(child) || child === '..' || child.startsWith('..\\') || child.startsWith('../'))
  const chunks = []
  let passphrase, encryptedKey, fullInput
  try {
    let length = 0
    for await (const chunk of process.stdin) { length += chunk.length; assert.ok(length <= 4096); chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)) }
    fullInput = Buffer.concat(chunks); passphrase = fullInput
    if (passphrase.at(-1) === 10) passphrase = passphrase.subarray(0, -1)
    if (passphrase.at(-1) === 13) passphrase = passphrase.subarray(0, -1)
    assert.ok(passphrase.length >= 20 && ![0, 10, 13].some(byte => passphrase.includes(byte)))
    encryptedKey = await readFile(keyPath)
    assert.ok(encryptedKey.subarray(0, 50).toString('ascii').startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----'))
    const evidence = await signEvidence({ report: input.report, privateKey: { key: encryptedKey, format: 'pem', passphrase },
      deployment: input.deployment, audit: input.audit, authorization: input.authorization, ownerAcknowledged: true, settlementAcknowledged: true })
    await verify(evidence)
    const bytes = JSON.stringify(evidence, null, 2) + '\n'
    assert.ok(Buffer.byteLength(bytes) <= 32768)
    await writeFile(generation3EvidencePaths.signed, bytes, { flag: 'wx', mode: 0o600 })
    await writeFile(generation3EvidencePaths.signingReceipt, JSON.stringify({ verifiedAt: Math.floor(Date.now() / 1000), fingerprint: generation3EvidenceIdentity.fingerprint,
      signedSha256: sha(bytes), signatureVerified: true, imported: false, network: false }, null, 2) + '\n', { flag: 'wx' })
    return { signedAndVerified: true, imported: false, network: false }
  } finally {
    fullInput?.fill(0); encryptedKey?.fill(0); for (const chunk of chunks) chunk.fill(0)
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) { console.error('BLOCKED: one explicit offline command only.'); process.exitCode = 1 }
  else generation3EvidenceCLI(process.argv[2]).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error.code === 'ENOENT' ? 'BLOCKED: actual generation-3 deployment receipt, factual unsigned report or audit is not yet available. No signing/key access/import performed.' :
      'BLOCKED: generation-3 evidence validation/signing refused. Preserve outputs; no secret diagnostics or automatic retry.'); process.exitCode = 1
  })
}
