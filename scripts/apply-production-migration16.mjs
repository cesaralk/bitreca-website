// Applies ONLY the explicitly approved immutable migration0016 to exact production
// D1. Atomic before/DDL/tracking/after batch; no Worker/R2/security-control API.
import assert from 'node:assert/strict'
import { readFile, open, mkdir, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import process from 'node:process'
import { sandboxReadCredential } from './verify-sandbox-deployment.mjs'
import { normalizeSchemaLineEndings } from './portfolio-schema-identity.mjs'

const account='4ec868eac2a3b9127531ad39d2501f15', database='8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
const review='C:/Users/cezar/Desktop/bitreca-deletion-review'
const candidate=join(review,'deletion-production-candidate-20261029')
const folder=join(review,'production-live-enablement-20261030/migration16-execution')
const manifestPin='39a757be83bf446aa126e4241604ac0ae03b7abec1f8e035e10d3ea468fa6e73'
const migrationName='0016_disable_legacy_finalization_bridge.sql'
const migrationPin='59457d2304b63990d8c087c8b554ebd38c84f9cf900c9b553c61a665ce636699'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const readJSON=async path=>JSON.parse(await readFile(path,'utf8'))
async function save(name,value){const file=await open(join(folder,name+'.json'),'wx');try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync()}finally{await file.close()}}
const args=process.argv.slice(2)
assert.ok(args.length===0||(args.length===1&&args[0]==='--approved-migration16'))
if(args.length===0){console.log('PLAN ONLY: verify exact production UUID, immutable candidate/backup, pending0016, all six published rows and disabled controls; atomic apply0016 only; no R2/Worker calls.');process.exit(0)}
await mkdir(folder,{recursive:false}) // Existing intent/output forbids blind rerun.
let attempting=false
try{
  const manifestBytes=await readFile(join(candidate,'deployment-artifact.json'));assert.equal(sha(manifestBytes),manifestPin)
  const manifest=JSON.parse(manifestBytes)
  for(const item of manifest.files){
    const path=resolve(candidate,item.path),child=relative(candidate,path)
    assert.ok(child&&!isAbsolute(child)&&!child.startsWith('..')&&!item.path.includes('\\'))
    assert.ok((await lstat(path)).isFile())
    const bytes=await readFile(path);assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256)
  }
  const config=await readJSON(join(candidate,'main.wrangler.jsonc'))
  assert.equal(config.name,'bitreca-website');assert.equal(config.d1_databases.length,1)
  assert.equal(config.d1_databases[0].database_id,database);assert.equal(config.d1_databases[0].database_name,'bitreca-db')
  const migrations=manifest.files.filter(row=>row.path.startsWith('migrations/')).map(row=>row.path.slice(11)).sort()
  assert.equal(migrations.length,16);assert.equal(migrations.at(-1),migrationName)
  const migration=await readFile(join(candidate,'migrations',migrationName),'utf8');assert.equal(sha(migration),migrationPin)
  const backup=await readJSON(join(review,'production-metadata-backup-20261030.json'))
  const proof=await readJSON(join(review,'production-migration16-snapshot-validation.json'))
  assert.equal(backup.databaseId,database);assert.equal(proof.databaseId,database)
  const backupBytes=await readFile(backup.path)
  assert.equal(backupBytes.length,backup.bytes);assert.equal(sha(backupBytes),backup.sha256)
  assert.equal(proof.backupSha256,backup.sha256);assert.equal(proof.migration16Sha256,migrationPin)
  assert.ok(proof.actualMetadataRestoredInMemory&&proof.allTableRowDigestsUnchanged&&proof.sixPublishedPortfoliosUnchanged)
  // Restore the private metadata COPY only to obtain exact schema/column names.
  const model=new DatabaseSync(':memory:')
  const quote=name=>'"'+name.replaceAll('"','""')+'"'
  let snapshotSQL,newTriggers
  try{
    model.exec(backupBytes.toString('utf8'))
    const tables=model.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'d1_migrations' ORDER BY name").all().map(row=>row.name)
    const parts=tables.map(table=>{
      const cols=model.prepare('PRAGMA table_info('+quote(table)+')').all().map(row=>quote(row.name))
      return `'${table}',json((SELECT json_group_array(json(row)) FROM (SELECT json_array(${cols.join(',')}) AS row FROM ${quote(table)} ORDER BY row)))`
    })
    snapshotSQL=`SELECT json_object('migrationNames',json((SELECT json_group_array(name) FROM (SELECT name FROM d1_migrations ORDER BY name))),
      'schema',json((SELECT json_group_array(json(row)) FROM (SELECT json_object('type',type,'name',name,'tbl_name',tbl_name,'sql',sql) AS row FROM sqlite_schema ORDER BY type,name))),
      'tables',json_object(${parts.join(',')})) AS snapshot`
    model.exec(migration)
    newTriggers=model.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name IN ('portfolio_legacy_finalization_disabled','portfolios_finalization_delete_guard') ORDER BY type,name").all()
    assert.equal(newTriggers.length,2)
  }finally{model.close()}
  backupBytes.fill(0)
  const prior=await readJSON(join(review,'production-release-preflight-20261030.json'))
  const credential=await sandboxReadCredential(join(candidate,'main.wrangler.jsonc'))
  const base=`/accounts/${account}`, endpoint=base+'/d1/database/'+database+'/query'
  const request=async(path,body)=>{
    assert.ok(path===base||path===base+'/d1/database/'+database||path===endpoint)
    const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)})
    assert.ok(response.ok,`HTTP ${response.status}; stop without retry`)
    const data=await response.json();assert.equal(data.success,true);return data.result
  }
  const identity=async()=>{assert.equal((await request(base)).id,account);const db=await request(base+'/d1/database/'+database);assert.equal(db.uuid,database);assert.equal(db.name,'bitreca-db')}
  const queryRead=async sql=>{
    assert.ok(sql.startsWith('SELECT '))
    const result=await request(endpoint,{sql});assert.ok(result.length===1&&result[0].success&&result[0].meta.rows_written===0);return result[0].results
  }
  await identity()
  const names=(await queryRead('SELECT name FROM d1_migrations ORDER BY name')).map(row=>row.name)
  assert.equal(new Set(names).size,names.length);assert.deepEqual(names,migrations.slice(0,15),'Unexpected migration history; stop before write')
  const pending=migrations.filter(name=>!names.includes(name));assert.deepEqual(pending,[migrationName])
  const beforeText=(await queryRead(snapshotSQL))[0].snapshot,before=JSON.parse(beforeText)
  const normalize=rows=>rows.map(row=>({...row,sql:normalizeSchemaLineEndings(row.sql)}))
  assert.deepEqual(normalize(before.schema),normalize(prior.schema),'Schema differs from reviewed production preflight')
  const sixBefore=await queryRead('SELECT * FROM portfolios WHERE id BETWEEN 5 AND 10 ORDER BY id')
  assert.equal(sixBefore.length,6)
  for(const row of sixBefore){const expected=prior.portfolios.find(p=>p.id===row.id);assert.ok(expected&&row.slug===expected.slug&&row.storage_prefix===expected.storage_prefix&&row.status==='published'&&row.deletion_requested_at===null,'A client portfolio differs; stop before write')}
  const auth=await queryRead('SELECT auth_version FROM admin_auth_state WHERE admin_id=\'primary-admin\'')
  assert.equal(auth[0].auth_version,2)
  const controls=await queryRead('SELECT * FROM portfolio_deletion_runtime_policy WHERE id=1')
  assert.deepEqual(controls,prior.authorization.portfolio_deletion_runtime_policy)
  assert.equal(controls[0].cleanup_enabled,0);assert.equal(controls[0].finalization_enabled,0)
  const writer=await queryRead('SELECT minimum_protocol_version FROM portfolio_storage_writer_policy WHERE id=1')
  assert.equal(writer[0].minimum_protocol_version,0)
  const policy=await queryRead('SELECT * FROM portfolio_storage_authorization_state WHERE id=1')
  assert.deepEqual(policy,prior.authorization.portfolio_storage_authorization_state)
  const after=structuredClone(before)
  after.migrationNames=migrations
  after.schema=after.schema.filter(row=>row.name!=='portfolios_finalization_delete_guard').concat(newTriggers).sort((a,b)=>a.type<b.type?-1:a.type>b.type?1:a.name<b.name?-1:a.name>b.name?1:0)
  const expression=snapshotSQL.replace(/^SELECT /,'').replace(/ AS snapshot$/,'')
  const beforeGuard={sql:`SELECT CASE WHEN (${expression})=? THEN 'preflight-matched' ELSE json('MIGRATION16_STATE_MISMATCH') END AS verified`,params:[beforeText]}
  // Compare application rows inside SQLite, preserving numeric JSON encodings;
  // only schema and migration tracking are allowed to differ after this batch.
  const afterGuard={sql:`SELECT CASE WHEN json_extract((${expression}),'$.tables')=json_extract(?,'$.tables')
    AND json_extract((${expression}),'$.migrationNames')=json(?) AND json_extract((${expression}),'$.schema')=json(?)
    THEN 'postconditions-matched' ELSE json('MIGRATION16_STATE_MISMATCH') END AS verified`,params:[beforeText,JSON.stringify(after.migrationNames),JSON.stringify(after.schema)]}
  await save('preflight',{observedAt:new Date().toISOString(),account,databaseName:'bitreca-db',databaseId:database,backupSha256:backup.sha256,migrationSha256:migrationPin,manifestSha256:manifestPin,pending,
    six:sixBefore.map(row=>({id:row.id,slug:row.slug,status:row.status,recordSha256:sha(JSON.stringify(row))})),allApplicationRowsBeforeSha256:sha(JSON.stringify(before.tables)),controls})
  await identity()
  await save('intent',{at:new Date().toISOString(),approved:'ONLY0016',databaseId:database,migration:migrationName,writeScope:'Exact migration DDL plus its d1_migrations tracking row; no other migration, portfolio data, R2 or Worker operations'})
  attempting=true
  const applied=await request(endpoint,{batch:[beforeGuard,{sql:migration},{sql:'INSERT INTO d1_migrations(name) VALUES(?)',params:[migrationName]},afterGuard]})
  assert.ok(applied.every(row=>row.success===true))
  assert.ok(applied.some(row=>row.results?.[0]?.verified==='preflight-matched')&&applied.some(row=>row.results?.[0]?.verified==='postconditions-matched'))
  const actual=JSON.parse((await queryRead(snapshotSQL))[0].snapshot)
  assert.deepEqual(actual,after)
  const sixAfter=await queryRead('SELECT * FROM portfolios WHERE id BETWEEN 5 AND 10 ORDER BY id');assert.deepEqual(sixAfter,sixBefore)
  const result={completed:'production-migration0016',at:new Date().toISOString(),databaseId:database,migration:migrationName,onlyPendingBefore:pending,
    appliedMigrationCount:1,atomicPreAndPostConditionsMatched:true,sixPortfolioRecordsByteForByteUnchanged:true,sixPublished:true,
    allApplicationTableRowsUnchanged:sha(JSON.stringify(actual.tables))===sha(JSON.stringify(before.tables)),backupSha256:backup.sha256,
    legacyFinalizationExceptionDisabled:true,protocol:0,authorizationGeneration:0,runtimeRevision:0,cleanup:false,finalization:false,
    r2Operations:0,workerOperations:0,securityFlagChanges:0}
  await save('completion',result);console.log(JSON.stringify(result,null,2))
}catch{
  await save(attempting?'outcome-unresolved':'preflight-stopped',{at:new Date().toISOString(),databaseId:database,writeAttempted:attempting,action:'STOP. Preserve evidence; no automatic retry/rollback or additional migration.'})
  console.error(attempting?'STOP: migration outcome requires read-only reconciliation; no retry or rollback.':'STOP: preflight discrepancy; no remote write attempted.');process.exitCode=1
}
