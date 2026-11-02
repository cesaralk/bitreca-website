// Offline public evidence reconciliation. No private key, credentials or network.
import assert from 'node:assert/strict'
import { readFile, open } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { canonicalReport } from './portfolio-evidence.mjs'
import { verifyStagingPackage } from './prepare-portfolio-staging.mjs'
import { generation3EvidenceIdentity as identity, validateGeneration3EvidenceFields } from './generation3-evidence.mjs'

const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
const release = join(review, 'solo-generation3-pinned-20261029')
const output = join(release, 'evidence')
const historicalAuditPath = join(review, 'solo-settlement-review-20261028/owner-settlement-audit.json')
const historicalChecksPath = join(review, 'solo-settlement-review-20261028/owner-reported-checks.json')
const completionPath = join(release, 'deployment-completion.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
const json = value => JSON.stringify(value, null, 2) + '\n'
async function saveNew(path, bytes) {
  const file = await open(path, 'wx')
  try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
}
const args = new Set(process.argv.slice(2))
assert.ok([...args].every(arg => ['--prepare', '--owner-continuity-confirmed'].includes(arg)))
const ownerConfirmed = args.has('--owner-continuity-confirmed')
assert.ok(!ownerConfirmed || args.has('--prepare'), 'Confirmation is a deliberate owner factual review, not a plan default')
const [completion, authorization, plan, historicalAudit] = await Promise.all([
  readJSON(completionPath), readJSON(join(release, 'owner-authorization.json')),
  readJSON(join(release, 'deployment-plan.json')), readJSON(historicalAuditPath) ])
const verifiedPackage = await verifyStagingPackage(join(release, 'candidate'))
assert.equal(verifiedPackage.artifactSha256, plan.candidateSha256)
const activated = await readJSON(join(review, 'generation3-activate3-plan.json.completed.json'))
assert.equal(activated.stage, 'activate3')
assert.deepEqual(completion.state, activated.state, 'Deployment changed the reviewed generation3 runtime state')
assert.equal(authorization.policyId, identity.policyId); assert.equal(authorization.policyGeneration, 3)
assert.equal(authorization.operatorKeyId, identity.fingerprint); assert.equal(authorization.storageScope, identity.scope)
assert.equal(authorization.deploymentSha256, identity.codeSha256); assert.equal(authorization.enrolledAt, identity.enrolledAt)
const deployment = await readFile(join(release, 'candidate/code-artifacts.json'))
assert.equal(sha(deployment), identity.codeSha256)
const code = JSON.parse(deployment)
assert.deepEqual(completion.workers.map(row => row.Name), code.workers.map(row => row.name))
for (const worker of completion.workers) {
  assert.deepEqual(await readJSON(join(release, `verified-${worker.Name}.json`)), worker)
  assert.equal((await readJSON(join(release, `uploaded-${worker.Name}.json`))).version, worker.Version)
  assert.equal(worker.JavaScriptSha256, code.workers.find(row => row.name === worker.Name)?.javascript_sha256)
  assert.equal(worker.Percentage, 100)
  assert.equal(worker.Verified, true); assert.equal(worker.Frozen, true); assert.equal(worker.Private, true)
  assert.equal(worker.Schedules, 0); assert.equal(worker.CandidateManifestSha256, plan.candidateSha256)
}
const references = [], seen = new Set()
async function addReference(path, expected) {
  path = resolve(path)
  if (seen.has(path.toLowerCase())) return
  assert.ok(!path.toLowerCase().includes('bitrecaownerkeys'), 'Never reference private material')
  const bytes = await readFile(path)
  if (expected) { assert.equal(bytes.length, expected.bytes); assert.equal(sha(bytes), expected.sha256, 'Historical evidence changed') }
  references.push({ path, bytes: bytes.length, sha256: sha(bytes) }); seen.add(path.toLowerCase())
}
for (const ref of historicalAudit.references) await addReference(ref.path, ref)
for (const path of [historicalAuditPath, historicalChecksPath, completionPath,
  ...completion.workers.map(worker => join(release, `verified-${worker.Name}.json`)),
  join(release, 'candidate/deployment-artifact.json'), join(release, 'candidate/code-artifacts.json'),
  join(release, 'owner-authorization.json'), join(review, 'generation3-activate3-plan.json.completed.json')]) await addReference(path)
const now = Math.floor(Date.now() / 1000)
assert.ok(completion.verifiedAt <= now)
const missingFact = 'Owner must confirm no intervening direct-R2-capable credentials/permission changes, additional writer bindings, unrecorded writes/multipart operations, unfreeze or rollback affecting this exact bucket since the retained inspection, and review the generation-3 settlement assertions; otherwise reconcile the specific changes.'
const manifest = await readJSON(join(release, 'candidate/deployment-artifact.json'))
const audit = {
  format: 1, classification: ownerConfirmed ? 'UNSIGNED GENERATION-3 SOLO-OWNER SETTLEMENT REVIEW' : 'UNSIGNED NON-ATTESTING GENERATION-3 REVIEW; OWNER CONTINUITY CONFIRMATION PENDING',
  preparedAt: now, authorization_policy: authorization.authorizationPolicy, policy_id: authorization.policyId,
  policy_generation: 3, operator_id: authorization.operatorId, storage_scope: authorization.storageScope,
  references,
  owner_confirmation: { operator: 'bitreca-owner', policyGeneration: 3, fingerprint: identity.fingerprint,
    storageScope: identity.scope, confirmedAt: ownerConfirmed ? now : null,
    factualWriterSettlementReviewed: ownerConfirmed, soleOwnerResponsibilityAcknowledged: ownerConfirmed },
  owner_continuity: { confirmed: ownerConfirmed, scopeOfRequiredConfirmation: missingFact,
    source: ownerConfirmed ? 'Explicit owner confirmation in the current session' : 'Not yet supplied; previous generation owner acknowledgements were not converted' },
  settlement_observations: [
    { summary: 'Actual deployment receipt verifies both exact sandbox Workers at 100%, reviewed JavaScript byte hashes, frozen/private configuration, zero schedules and current protocol1/generation3/revision3 disabled state. This does not independently prove external writer settlement.',
      referencePaths: [resolve(completionPath), ...completion.workers.map(worker => resolve(join(release, `verified-${worker.Name}.json`)))] },
    { summary: 'Retained prior audit reconciles the fixed sentinel PUT and matching source/retrieved bytes, historical frozen Worker code and setup operations. These remain historical records, not a new observation timestamp.',
      referencePaths: [resolve(historicalAuditPath), ...historicalAudit.references.filter(ref => /sentinel-local-records|object-writer-reconciliation/.test(ref.path)).map(ref => resolve(ref.path))] },
    { summary: 'Prior whole-bucket-only-sentinel, multipart0, R2-token0 and build-token-no-direct-R2-write findings are explicitly owner-reported. Their original raw provider responses were not retained by the assistant; current continuity is separately gated.',
      referencePaths: [resolve(historicalChecksPath), resolve(historicalAuditPath)] },
  ],
  observed: { workers: completion.workers, protocol: completion.state.protocol, generation: 3, revision: 3,
    cleanup: false, finalization: false, portfolios: completion.state.portfolios, allocations: completion.state.allocations,
    warning: 'Empty counts are observations, not evidence excluding untracked writers' },
  static_assets: { localCandidateClientFiles: manifest.files.filter(row => row.path.startsWith('client/')),
    localHashesVerified: true, providerSideAssetManifestOrByteComparison: 'NOT RETAINED / UNVERIFIED',
    scope: 'Signed deployment digest binds only main+hosting Worker JavaScript, not browser/static asset byte identity',
    smallestResolution: 'Retain provider asset-manifest/upload identity if available or later compare asset bytes through separately approved private operator access. Do not expose or unfreeze now.' },
  inferences: [
    'With byte-identical reviewed writer code and verified mutation freeze, the recorded public-pin deployments do not introduce an identified application R2 writer.',
    'Static-asset identity is a separate release-completeness limitation. Static assets themselves have no R2 binding; the verified Worker freeze gates portfolio API writes.',
    'Historical writer settlement can carry forward only when the owner accounts for intervening authority and operations; the absence of D1 rows alone does not establish continuity.',
  ],
  residual_risks: [
    'No independent second-person oversight; explicitly identified solo-owner policy.',
    'Sole administrator and deployment/D1 authority can replace code/bindings, add writers or restore data; code cannot enforce external credential/rollback discipline.',
    'Historical multipart/credential observations rely on owner statements, not newly collected raw provider responses.',
    'Live static-asset byte identity has not been independently verified.',
    'No production authorization, legacy adoption, import authorization, cleanup or finalization approval is granted.',
  ],
  blockers: ownerConfirmed ? [] : [missingFact],
  chronology: { deploymentVerifiedAt: completion.verifiedAt, writersFencedObservedAt: completion.verifiedAt,
    settlementReviewedAt: ownerConfirmed ? now : null, meaning: 'No historical operation-completion times are invented or moved forward; settlement review time is new only after actual owner continuity confirmation' },
  signed: false, imported: false, remoteChanges: false,
}
const auditBytes = json(audit)
const report = { version: 2, id: randomUUID(), authorization_policy: authorization.authorizationPolicy,
  policy_id: authorization.policyId, policy_generation: 3, operator_id: authorization.operatorId,
  operator_key_id: authorization.operatorKeyId, deployment_verified_at: completion.verifiedAt,
  writers_fenced_at: completion.verifiedAt, writers_settled_at: ownerConfirmed ? now : null,
  storage_scope: authorization.storageScope, writer_protocol: 1, deployment_sha256: sha(deployment),
  evidence_sha256: sha(auditBytes), legacy_writers_settled: ownerConfirmed, verified_at: now }
if (ownerConfirmed) validateGeneration3EvidenceFields({ report, authorization, completion, audit, candidateSha256: plan.candidateSha256, now })
const summary = { actualDeploymentReceiptValidated: true, workers: completion.workers.map(row => ({ name: row.Name, version: row.Version, percentage: row.Percentage })),
  candidateSha256: plan.candidateSha256, historicalHashesVerified: historicalAudit.references.length, totalPublicReferences: references.length,
  signingReady: ownerConfirmed, externalWriterContinuity: ownerConfirmed ? 'OWNER CONFIRMED' : 'BLOCKED: owner confirmation pending',
  staticAssets: 'Local hashes verified; provider-side identity unverified (separate scoped release limitation)',
  reportSha256: sha(json(report)), auditSha256: sha(auditBytes), noPrivateKeyAccess: true, noNetwork: true }
if (args.has('--prepare')) {
  await saveNew(join(output, 'owner-settlement-audit.json'), auditBytes)
  await saveNew(join(output, 'owner-evidence-v2.UNSIGNED.json'), json(report))
  await saveNew(join(output, 'owner-evidence-v2.canonical.UNSIGNED.json'), canonicalReport(report))
  await saveNew(join(output, 'preparation-validation.json'), json(summary))
}
console.log(JSON.stringify({ ...summary, prepared: args.has('--prepare'), blocker: ownerConfirmed ? null : missingFact }, null, 2))
