// Local production release preparation only: no network, key access or activation.
import assert from 'node:assert/strict'
import { readFile, mkdir, open, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, dirname, relative, isAbsolute } from 'node:path'
import { latestSandboxDeployment } from './verify-sandbox-deployment.mjs'
const review='C:/Users/cezar/Desktop/bitreca-deletion-review'
const candidate=join(review,'deletion-production-candidate-20261029')
const output=join(review,'production-live-enablement-20261030')
const pin='39a757be83bf446aa126e4241604ac0ae03b7abec1f8e035e10d3ea468fa6e73'
const database='8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const readJSON=async path=>JSON.parse(await readFile(path,'utf8'))
const manifestBytes=await readFile(join(candidate,'deployment-artifact.json'))
assert.equal(sha(manifestBytes),pin)
const manifest=JSON.parse(manifestBytes)
for(const file of manifest.files){
  const path=resolve(candidate,file.path),child=relative(candidate,path)
  assert.ok(child&&!isAbsolute(child)&&!child.startsWith('..')&&!file.path.includes('\\'))
  assert.ok((await lstat(path)).isFile())
  const bytes=await readFile(path);assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256)
}
const preflightPath=join(review,'production-release-preflight-20261030.json')
const preflight=await readJSON(preflightPath),backup=await readJSON(join(review,'production-metadata-backup-20261030.json'))
const upgrade=await readJSON(join(review,'production-migration16-snapshot-validation.json'))
assert.equal(preflight.target.database,database);assert.equal(preflight.target.bucket,'bitreca-media')
assert.equal(preflight.authorization.admin_auth_state[0].auth_version,2)
assert.equal(backup.databaseId,database);assert.equal(backup.sha256,upgrade.backupSha256)
assert.ok(upgrade.actualMetadataRestoredInMemory&&upgrade.allTableRowDigestsUnchanged&&upgrade.sixPublishedPortfoliosUnchanged)
const migrationNames=manifest.files.filter(row=>row.path.startsWith('migrations/')).map(row=>row.path.slice(11)).sort()
assert.equal(migrationNames.length,16)
assert.deepEqual(preflight.migrations.map(row=>row.name).sort(),migrationNames.slice(0,15))
assert.equal(preflight.authorization.marked.length,0)
assert.equal(preflight.authorization.unsettledWriters.length,0)
const pending=preflight.authorization.queue.filter(row=>row.protected_finalized!==1&&row.historically_legacy_finalized!==1)
assert.equal(pending.length,0,'Outstanding queue requires specific approval before enabling execution')
assert.equal(preflight.portfolios.length,6);assert.ok(preflight.portfolios.every(row=>row.status==='published'&&row.id>=5&&row.id<=10))
const requiredSecrets=['ADMIN_AUTH_VERSION','ADMIN_PASSWORD','ADMIN_USERNAME','SESSION_SECRET']
const main=preflight.workers.find(row=>row.name==='bitreca-website')
assert.deepEqual(main.secretNames,requiredSecrets)
for(const file of ['main.wrangler.jsonc','hosting.wrangler.jsonc']){
  const config=await readJSON(join(candidate,file))
  assert.equal(config.d1_databases[0].database_id,database);assert.equal(config.r2_buckets[0].bucket_name,'bitreca-media')
  if(file.startsWith('main'))for(const flag of ['DELETE_REQUESTS','CLEANUP','FINALIZATION','EVIDENCE_IMPORT','SCHEDULE','LEGACY_DELETE'])assert.equal(config.vars['PORTFOLIO_'+flag+'_ENABLED'],'false')
}
const wrangler=resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'../node_modules/wrangler/bin/wrangler.js')
const prefix='node "'+wrangler+'" '
const mainConfig='"'+join(candidate,'main.wrangler.jsonc')+'"',hostingConfig='"'+join(candidate,'hosting.wrangler.jsonc')+'"'
const migration=manifest.files.find(row=>row.path==='migrations/0016_disable_legacy_finalization_bridge.sql')
assert.equal(migration.sha256,upgrade.migration16Sha256)
const plan={format:1,preparedAt:new Date().toISOString(),productionActivationReady:false,
  target:preflight.target,candidate,candidateManifestSha256:pin,allCandidateDigestsVerified:manifest.files.length,
  sourcePreflight:{path:preflightPath,sha256:sha(await readFile(preflightPath))},metadataBackup:{receipt:join(review,'production-metadata-backup-20261030.json'),sha256:backup.sha256,restoreAndMigrationProof:join(review,'production-migration16-snapshot-validation.json')},
  expectedBaselineWorkers:preflight.workers.map(worker=>({name:worker.name,activeVersion:latestSandboxDeployment(worker.deployments.deployments).versions[0].version_id,percentage:100})),
  admin:{authoritativeVersion:2,requiredExistingSecretNames:requiredSecrets,valuesRead:false,requiredCondition:'Preserve existing secret bindings; owner must ensure existing ADMIN_AUTH_VERSION value matches authoritative version2. Never reset it to1 or replace credentials silently.'},
  queue:{markedPortfolios:0,unsettledRegisteredWriters:0,unfinishedWithoutHistoricalReceipt:pending.length,historicalReceiptedJobs:preflight.authorization.queue.length},
  migration:{pendingOnly:migration.path,sha256:migration.sha256,validatedOnActualMetadataCopy:true,allRowsPreserved:true,approvalRequired:true,
    commandAfterApproval:prefix+'d1 migrations apply bitreca-db --remote --config '+mainConfig,
    precondition:'Immediately before execution verify exact UUID and migration names: only0016 pending. No reapply1–15; stop on drift. Retain actual migration receipt.'},
  disabledDeployments:[{worker:'bitreca-website',commandAfterSeparateApproval:prefix+'deploy --no-bundle --no-autoconfig --strict --config '+mainConfig},{worker:'bitreca-portfolio-hosting',commandAfterSeparateApproval:prefix+'deploy --no-bundle --no-autoconfig --strict --config '+hostingConfig}],
  postDeploymentVerification:['Each exact Worker active at100%; JavaScript matches candidate bytes; exact D1/R2 bindings; all disable flags and no schedules; Admin authentication healthy with retained version2 secrets; all six statuses/prefixes/website links unchanged. Stop on partial failure, no automatic rollback/retry.'],
  productionAuthorization:{currentWriterProtocol:0,currentPolicy:'independent-v1',currentGeneration:0,currentRuntimeRevision:0,epochs:0,
    requiredPolicy:'Separately approve production-scoped solo-operator-v1 enrollment and public pin deployment using a reviewed owner key. Sandbox generation3 evidence conveys no production authority.',
    storageIdentity:{exists:false,initializationApprovalRequired:true,key:'__portfolioforest_control__/storage-identity',rule:'Initialize only this absent control key with exact production custom metadata and no-overwrite protection; never touch customer prefixes.'},
    stages:['Verified production writer fencing/settlement and credential/rollback discipline', 'Production policy enrollment/public pins and protocol1 cutover, each separately approved',
      'Truthful production-scoped evidence, separately approved private signing and controlled import', 'Runtime cleanup/finalization revisions and Cron only after separate approval and atomic empty-eligible-queue checks', 'Enable exact-ID requests last; enabling never authorizes a deletion request for any of the six']},
  legacy:{ids:[5,6,7,8,9,10],eligible:false,currentProof:'Two registered prefixes each and closed writers; every birth is protocol0 with no epoch',
    missingImplementation:'Distinct signed per-portfolio append-only reconciliation authority, immutable exact-object manifest, snapshot re-verification and allowlist-aware storage adapter (proposed migration0017); reuse existing cleanup/finalization.',
    missingEvidence:'Original allocation/source/root custody, complete proven historical namespaces, exact object identities and exclusive ownership, and genuine external-writer settlement. Namespace resemblance and owner approval alone are insufficient.',
    noBypass:'Never rewrite origins/epochs/events, enable old hardcoded bridge, or certify a global signed epoch as retroactive birth.'},
  omittedFromCriticalProductionPath:['Sandbox audit-log403 investigation','Another sandbox/environment','Repeating historical suites'],
  deployed:false,enabled:false,remoteMutations:false}
await mkdir(output,{recursive:false})
const file=await open(join(output,'production-release-plan.json'),'wx')
try{await file.writeFile(JSON.stringify(plan,null,2)+'\n');await file.sync()}finally{await file.close()}
console.log(JSON.stringify({output,planSha256:sha(await readFile(join(output,'production-release-plan.json'))),allCandidateDigestsVerified:manifest.files.length,pendingMigration:migration.path,
 metadataBackupAndInMemoryUpgradeVerified:true,productionActivationReady:false,remoteMutations:false,commands:{migration16:plan.migration.commandAfterApproval,deployments:plan.disabledDeployments}},null,2))
