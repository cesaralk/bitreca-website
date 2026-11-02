// OFFLINE PUBLIC proposal only. No credentials, private keys, signing or network.
import assert from 'node:assert/strict'
import { createHash, createPublicKey } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

export const cleanProductionBucket = 'bitreca-portfolios-prod-20261031'
export const productionDatabase = '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
export const existingOwnerFingerprint = '7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e'
const oldBucket = 'bitreca-media'
const oldScope = `portfolioforest/production/${oldBucket}/${productionDatabase}`
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const hash = /^[0-9a-f]{64}$/
const flags = ['DELETE_REQUESTS', 'CLEANUP', 'FINALIZATION', 'EVIDENCE_IMPORT', 'SCHEDULE', 'LEGACY_DELETE', 'LEGACY_RECONCILIATION_IMPORT']
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const parseJSON = bytes => JSON.parse(bytes.toString().replace(/^\ufeff/, ''))

function sourceBindings(config, name, d1Binding, oldBinding) {
  assert.equal(config.name, name)
  assert.ok(config.account_id === undefined || config.account_id === '4ec868eac2a3b9127531ad39d2501f15', 'Unexpected account')
  assert.ok(!config.env || Object.keys(config.env).length === 0, 'Nested overrides require review')
  assert.equal(config.d1_databases?.length, 1)
  assert.equal(config.d1_databases[0].binding, d1Binding)
  assert.equal(config.d1_databases[0].database_id, productionDatabase)
  assert.equal(config.d1_databases[0].database_name, 'bitreca-db')
  assert.equal(config.d1_databases[0].remote, false)
  assert.equal(config.r2_buckets?.length, 1, 'Unexpected or duplicate R2 binding')
  assert.equal(config.r2_buckets[0].binding, oldBinding)
  assert.equal(config.r2_buckets[0].bucket_name, oldBucket)
  assert.equal(config.r2_buckets[0].remote, false)
  assert.ok(!config.triggers?.crons?.length, 'Schedules must remain disabled')
  for (const secret of ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET']) {
    assert.ok(!Object.hasOwn(config.vars || {}, secret), 'Private credentials cannot enter a public proposal')
  }
}

export function buildCleanPortfolioProposal({ main, hosting, authorization, newBucket, policyId, deploymentSha256 }) {
  sourceBindings(main, 'bitreca-website', 'bitreca_db', 'bitreca_media')
  sourceBindings(hosting, 'bitreca-portfolio-hosting', 'PORTFOLIO_DB', 'PORTFOLIO_FILES')
  assert.equal(newBucket, cleanProductionBucket, 'Only the explicitly proposed new production bucket is supported')
  assert.equal(authorization.authorizationPolicy, 'solo-operator-v1')
  assert.equal(authorization.policyGeneration, 1, 'Expected retained generation 1; refresh on state changes')
  assert.equal(authorization.storageScope, oldScope)
  assert.equal(authorization.operatorId, 'bitreca-owner')
  assert.equal(authorization.operatorKeyId, existingOwnerFingerprint, 'Preserve the existing owner key')
  assert.match(authorization.policyId, uuid)
  assert.match(policyId || '', uuid, 'Explicit new policy identity required')
  assert.notEqual(policyId, authorization.policyId, 'The old immutable policy cannot be edited')
  assert.match(deploymentSha256 || '', hash, 'Actual reviewed code-artifact digest required')
  assert.notEqual(deploymentSha256, authorization.deploymentSha256, 'Old code-artifact evidence cannot authorize changed code')
  const pins = main.vars
  assert.equal(pins.PORTFOLIO_ENVIRONMENT, 'production')
  assert.equal(pins.PORTFOLIO_DATABASE_ID, productionDatabase)
  assert.equal(pins.PORTFOLIO_BUCKET_NAME, oldBucket)
  assert.equal(pins.PORTFOLIO_STORAGE_SCOPE, oldScope)
  assert.equal(pins.PORTFOLIO_AUTHORIZATION_POLICY, authorization.authorizationPolicy)
  assert.equal(pins.PORTFOLIO_AUTHORIZATION_POLICY_ID, authorization.policyId)
  assert.equal(pins.PORTFOLIO_AUTHORIZATION_GENERATION, String(authorization.policyGeneration))
  assert.equal(pins.PORTFOLIO_OPERATOR_ID, authorization.operatorId)
  assert.equal(pins.PORTFOLIO_OPERATOR_KEY_ID, authorization.operatorKeyId)
  assert.equal(pins.PORTFOLIO_DEPLOYMENT_SHA256, authorization.deploymentSha256)
  assert.match(pins.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI || '', /^[A-Za-z0-9+/]{40,700}={0,2}$/)
  const spki = Buffer.from(pins.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI, 'base64')
  assert.equal(spki.toString('base64'), pins.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI)
  const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' })
  assert.equal(publicKey.asymmetricKeyType, 'ec')
  assert.equal(publicKey.asymmetricKeyDetails.namedCurve, 'prime256v1')
  assert.equal(digest(spki), existingOwnerFingerprint)
  for (const flag of flags) assert.equal(pins[`PORTFOLIO_${flag}_ENABLED`], 'false', 'Source execution/import controls must be disabled')
  assert.notEqual(pins.PORTFOLIO_PRODUCTION_CLEANUP_APPROVED, 'true')

  const scope = `portfolioforest/production/${newBucket}/${productionDatabase}`
  const routing = { PORTFOLIO_ENVIRONMENT: 'production', PORTFOLIO_DATABASE_ID: productionDatabase,
    PORTFOLIO_BUCKET_NAME: newBucket, PORTFOLIO_STORAGE_SCOPE: scope,
    PORTFOLIO_CLEAN_STORAGE_ENABLED: 'true', PORTFOLIO_MUTATIONS_FROZEN: 'true',
    PORTFOLIO_LEGACY_STORAGE_SCOPE: oldScope }
  const proposedMain = structuredClone(main), proposedHosting = structuredClone(hosting)
  for (const config of [proposedMain, proposedHosting]) {
    config.account_id = '4ec868eac2a3b9127531ad39d2501f15'
    config.r2_buckets.push({ binding: 'PORTFOLIO_STORAGE', bucket_name: newBucket,
      preview_bucket_name: newBucket + '-preview-isolated', remote: false })
    config.vars = { ...config.vars, ...routing }
    config.triggers = { crons: [] }
    for (const flag of flags) config.vars[`PORTFOLIO_${flag}_ENABLED`] = 'false'
    config.vars.PORTFOLIO_PRODUCTION_CLEANUP_APPROVED = 'false'
  }
  proposedMain.main = 'main-worker.mjs'
  proposedMain.assets = { ...proposedMain.assets, directory: './client' }
  proposedHosting.main = 'hosting-worker.mjs'
  Object.assign(proposedMain.vars, { PORTFOLIO_AUTHORIZATION_POLICY_ID: policyId,
    PORTFOLIO_AUTHORIZATION_GENERATION: '2', PORTFOLIO_DEPLOYMENT_SHA256: deploymentSha256 })
  return {
    format: 'bitreca-clean-portfolio-proposal-v1', classification: 'OFFLINE_PROPOSAL_NOT_DEPLOYMENT_OR_AUTHORIZATION',
    target: { databaseName: 'bitreca-db', databaseId: productionDatabase, oldBucket, newBucket, storageScope: scope },
    proposedAuthorization: { authorizationPolicy: 'solo-operator-v1', policyId, policyGeneration: 2,
      operatorId: authorization.operatorId, operatorKeyId: authorization.operatorKeyId,
      storageScope: scope, deploymentSha256, enrolledAt: null },
    main: proposedMain, hosting: proposedHosting,
    legacy: { ids: [5, 6, 7, 8, 9, 10], recordsAndObjectsPreserved: true,
      readOnlyServingFromOldBucket: true, adoptedIntoNewEpoch: false, retirementAuthorized: false },
    evidence: { bucketAbsenceVerified: false, bucketCreated: false, identitySentinelVerified: false,
      deploymentVerified: false, externalWriterSettlementVerified: false,
      legacy_writers_settled: false, signedEpochPrepared: false, signedEvidenceImported: false },
    separateApprovalStages: [
      'Create only the reviewed new bucket after checking the exact name is absent; retain identity/creation proof.',
      'Enroll/activate the next production policy generation with the SAME owner key and reviewed new scope/artifact; preserve old policy records and protocol1.',
      'Deploy and individually verify both reviewed frozen Workers, old/new bindings, unchanged public serving, and disabled execution/import/schedules.',
      'Initialize only the new bucket identity sentinel with conditional no-overwrite protection; verify completion.',
      'Establish genuine new-scope writer fencing/settlement and credential/deployment authority evidence; emptiness alone is insufficient.',
      'Privately sign genuine version2 evidence using the existing encrypted key; then separately approve authenticated same-origin controlled import while data mutations stay frozen, followed by immediate import closure.',
      'Unfreeze future portfolio creation/uploads only after the current signed new-scope epoch is verified; never adopt IDs5-10.',
      'Separately authorize cleanup/finalization/scheduling and enable exact-ID deletion requests last; no portfolio/R2 deletion is authorized by this proposal.',
    ],
    deploymentReady: false, executionAuthorized: false, remoteOperations: false,
  }
}

async function main(args) {
  if (!args.length) {
    console.log('PLAN ONLY: prepare a frozen generation2 clean-bucket proposal, preserving the existing public key, six legacy sites and project media. Requires --prepare NEW_DIRECTORY --policy-id UUID --deployment-artifact REVIEWED_CODE_ARTIFACT_JSON. No files, credentials, keys or network accessed.')
    return
  }
  assert.equal(args.length, 6)
  assert.equal(args[0], '--prepare'); assert.equal(args[2], '--policy-id'); assert.equal(args[4], '--deployment-artifact')
  const artifactPath = resolve(args[5]), artifactBytes = await readFile(artifactPath), artifact = parseJSON(artifactBytes)
  assert.equal(artifact.format, 'bitreca-worker-code-artifacts-v1')
  for (const [role, name] of [['main', 'main-worker.mjs'], ['hosting', 'hosting-worker.mjs']]) {
    assert.equal(artifact[role]?.path, name)
    const bytes = await readFile(join(dirname(artifactPath), name))
    assert.equal(bytes.length, artifact[role].bytes); assert.equal(digest(bytes), artifact[role].sha256)
  }
  const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
  const configMain = parseJSON(await readFile(join(review, 'production-pinned-main-20261031/main.wrangler.jsonc')))
  const configHosting = parseJSON(await readFile(new URL('../wrangler.portfolio-hosting.jsonc', import.meta.url)))
  const authorization = parseJSON(await readFile(join(review, 'production-owner-authorization-20261031/owner-authorization.json')))
  const result = buildCleanPortfolioProposal({ main: configMain, hosting: configHosting, authorization,
    newBucket: cleanProductionBucket, policyId: args[3], deploymentSha256: digest(artifactBytes) })
  const output = resolve(args[1])
  await mkdir(output, { recursive: false })
  await writeFile(join(output, 'main.PROPOSED.wrangler.jsonc'), JSON.stringify(result.main, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(output, 'hosting.PROPOSED.wrangler.jsonc'), JSON.stringify(result.hosting, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(output, 'clean-portfolio-PROPOSED.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ output, classification: result.classification, deploymentReady: false,
    existingKeyFingerprint: existingOwnerFingerprint, proposedPolicyGeneration: 2,
    newBucket: cleanProductionBucket, artifactSha256: digest(artifactBytes), remoteOperations: false }, null, 2))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2))
}
