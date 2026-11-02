// Applies ONLY the explicitly approved immutable migration0017 to exact production
// D1. Atomic before/DDL/tracking/after batch; no Worker/R2/security-control API.
import assert from 'node:assert/strict'
import { migration17Guards } from './production-migration17-guards.mjs'
import { readFile, open, mkdir, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import process from 'node:process'
import { sandboxReadCredential } from './verify-sandbox-deployment.mjs'
import { normalizeSchemaLineEndings } from './portfolio-schema-identity.mjs'

const account='4ec868eac2a3b9127531ad39d2501f15', database='8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
const review='C:/Users/cezar/Desktop/bitreca-deletion-review'
const candidate = join(review, 'deletion-production-reconciliation-candidate-20261030-v3')
const folder = join(review, 'production-live-enablement-20261030/migration17-execution-v3')
let manifestPin
const migrationName='0017_add_legacy_reconciliation_authority.sql'
let migrationPin
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const readJSON=async path=>JSON.parse(await readFile(path,'utf8'))
async function save(name,value){const file=await open(join(folder,name+'.json'),'wx');try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync()}finally{await file.close()}}
const args=process.argv.slice(2)
if(args.length===0){console.log('PLAN ONLY: apply ONLY0017 after explicit approval, exact sandbox-free production identity, sealed successor SHA256, NEW metadata backup integrity + in-memory restore + schema/ALL row comparison, migration history1-16 only, six published unchanged, protocol0/generation0/runtime0/auth2, cleanup/finalization disabled. Atomic guarded DDL+tracking; no Workers/R2/security changes. Requires --approved-migration17 --manifest-sha256 SHA256. No credentials read or network used in this mode.');process.exit(0)}
assert.equal(args.length,3);assert.equal(args[0],'--approved-migration17');assert.equal(args[1],'--manifest-sha256');manifestPin=args[2];assert.match(manifestPin,/^[0-9a-f]{64}$/)
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
  assert.equal(new Set(manifest.files.map(row=>row.path)).size,manifest.files.length)
  assert.ok(manifest.files.some(row=>row.path==='main.wrangler.jsonc'))
  const config=await readJSON(join(candidate,'main.wrangler.jsonc'))
  assert.equal(config.name,'bitreca-website');assert.equal(config.d1_databases.length,1)
  assert.equal(config.d1_databases[0].database_id,database);assert.equal(config.d1_databases[0].database_name,'bitreca-db')
  const migrations=manifest.files.filter(row=>row.path.startsWith('migrations/')).map(row=>row.path.slice(11)).sort()
  assert.equal(migrations.length,17);migrations.forEach((name,index)=>assert.equal(Number(name.slice(0,4)),index+1));assert.equal(new Set(migrations).size,17);assert.equal(migrations.at(-1),migrationName)
  assert.equal(config.r2_buckets.length,1);assert.equal(config.r2_buckets[0].bucket_name,'bitreca-media')
  for(const flag of ['DELETE_REQUESTS','CLEANUP','FINALIZATION','EVIDENCE_IMPORT','SCHEDULE','LEGACY_DELETE','LEGACY_RECONCILIATION_IMPORT'])assert.equal(config.vars['PORTFOLIO_'+flag+'_ENABLED'],'false')
  assert.deepEqual(config.triggers.crons,[])
  migrationPin=manifest.files.find(row=>row.path==='migrations/'+migrationName)?.sha256;assert.match(migrationPin,/^[0-9a-f]{64}$/)
  const migration=await readFile(join(candidate,'migrations',migrationName),'utf8');assert.equal(sha(migration),migrationPin)
  const backup=await readJSON(join(review,'production-metadata-backup-before-migration17.json'))
  assert.equal(backup.databaseId,database)
  assert.equal(resolve(backup.path),resolve('C:/Users/cezar/BitrecaProductionRecovery/deletion-release-20261030/production-before-migration17.sql'))
  const backupBytes=await readFile(backup.path)
  assert.equal(backupBytes.length,backup.bytes);assert.equal(sha(backupBytes),backup.sha256)
  // Restore the private metadata COPY only to obtain exact schema/column names.
  const model=new DatabaseSync(':memory:')
  const quote=name=>'"'+name.replaceAll('"','""')+'"'
  let snapshotSQL,newSchema,backupSnapshot,changedSchemaNames
  try{
    model.exec(backupBytes.toString('utf8'))
    const tables=model.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'d1_migrations' ORDER BY name").all().map(row=>row.name)
    const parts=tables.map(table=>{
      const cols=model.prepare('PRAGMA table_info('+quote(table)+')').all().map(row=>quote(row.name))
      return `'${table}',json((SELECT json_group_array(json(row)) FROM (SELECT json_array(${cols.join(',')}) AS row FROM ${quote(table)} ORDER BY row)))`
    })
    snapshotSQL=`SELECT json_object('migrationNames',json((SELECT json_group_array(name) FROM (SELECT name FROM d1_migrations ORDER BY name))),
      'schema',json((SELECT json_group_array(json(row)) FROM (SELECT json_object('type',type,'name',name,'tbl_name',tbl_name,'sql',sql) AS row FROM sqlite_schema WHERE NOT (type='table' AND name='_cf_KV') ORDER BY type,name))),
      'tables',json_object(${parts.join(',')})) AS snapshot`
    backupSnapshot=JSON.parse(model.prepare(snapshotSQL).get().snapshot)
    const applicationRows=JSON.stringify(backupSnapshot.tables)
    model.exec(migration)
    assert.deepEqual(model.prepare('PRAGMA foreign_key_check').all(),[])
    assert.equal(model.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
    assert.equal(JSON.stringify(JSON.parse(model.prepare(snapshotSQL).get().snapshot).tables),applicationRows,'0017 must preserve every existing application row')
    newSchema=model.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE NOT (type='table' AND name='_cf_KV') ORDER BY type,name").all()
    changedSchemaNames=new Set(newSchema.filter(row=>!backupSnapshot.schema.some(old=>old.name===row.name&&old.type===row.type&&normalizeSchemaLineEndings(old.sql)===normalizeSchemaLineEndings(row.sql))).map(row=>row.name))
    for(const table of ['portfolio_legacy_reconciliations','portfolio_legacy_reconciliation_objects','portfolio_legacy_inventory_bindings'])assert.equal(model.prepare('SELECT count(*) AS n FROM '+table).get().n,0)

  }finally{model.close()}
  backupBytes.fill(0)

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
  assert.equal(new Set(names).size,names.length);assert.deepEqual(names,migrations.slice(0,16),'Unexpected migration history; stop before write')
  const pending=migrations.filter(name=>!names.includes(name));assert.deepEqual(pending,[migrationName])
  const beforeText=(await queryRead(snapshotSQL))[0].snapshot,before=JSON.parse(beforeText)
  const normalize=rows=>rows.map(row=>({...row,sql:normalizeSchemaLineEndings(row.sql)}))
  assert.deepEqual(normalize(before.schema),normalize(backupSnapshot.schema),'Schema differs from verified before0017 backup')
  assert.equal(JSON.stringify(before.tables),JSON.stringify(backupSnapshot.tables),'Application rows differ from backup; refresh backup before approval')
  const sixBefore=await queryRead('SELECT * FROM portfolios WHERE id BETWEEN 5 AND 10 ORDER BY id')
  assert.equal(sixBefore.length,6)
  for(const row of sixBefore){assert.ok(row.id>=5&&row.id<=10&&row.status==='published'&&row.deletion_requested_at===null,'A client portfolio differs; stop before write')}
  const auth=await queryRead('SELECT auth_version FROM admin_auth_state WHERE admin_id=\'primary-admin\'')
  assert.equal(auth[0].auth_version,2)
  const controls=await queryRead('SELECT * FROM portfolio_deletion_runtime_policy WHERE id=1')
  assert.equal(controls[0].revision,0);assert.equal(controls[0].environment,null);assert.equal(controls[0].storage_scope,null)
  assert.equal(controls[0].cleanup_enabled,0);assert.equal(controls[0].finalization_enabled,0)
  const writer=await queryRead('SELECT minimum_protocol_version FROM portfolio_storage_writer_policy WHERE id=1')
  assert.equal(writer[0].minimum_protocol_version,0)
  const policy=await queryRead('SELECT * FROM portfolio_storage_authorization_state WHERE id=1')
  assert.deepEqual(policy,[{id:1,policy:'independent-v1',generation:0,policy_id:null}])
  const after=structuredClone(before)
  after.migrationNames=migrations
  after.schema=after.schema.filter(row=>!changedSchemaNames.has(row.name)).concat(newSchema.filter(row=>changedSchemaNames.has(row.name))).sort((a,b)=>a.type<b.type?-1:a.type>b.type?1:a.name<b.name?-1:a.name>b.name?1:0)
  const {beforeGuard,afterGuard}=migration17Guards(snapshotSQL,beforeText,migrations,after.schema)
  await save('preflight',{observedAt:new Date().toISOString(),account,databaseName:'bitreca-db',databaseId:database,backupSha256:backup.sha256,migrationSha256:migrationPin,manifestSha256:manifestPin,pending,
    six:sixBefore.map(row=>({id:row.id,slug:row.slug,status:row.status,recordSha256:sha(JSON.stringify(row))})),allApplicationRowsBeforeSha256:sha(JSON.stringify(before.tables)),controls})
  await identity()
  await save('intent',{at:new Date().toISOString(),approved:'ONLY0017',databaseId:database,migration:migrationName,writeScope:'Exact migration DDL plus its d1_migrations tracking row; no other migration, portfolio data, R2 or Worker operations'})
  attempting=true
  const applied=await request(endpoint,{batch:[beforeGuard,{sql:migration},{sql:'INSERT INTO d1_migrations(name) VALUES(?)',params:[migrationName]},afterGuard]})
  assert.ok(applied.every(row=>row.success===true))
  assert.ok(applied.some(row=>row.results?.[0]?.verified==='preflight-matched')&&applied.some(row=>row.results?.[0]?.verified==='postconditions-matched'))
  const actual=JSON.parse((await queryRead(snapshotSQL))[0].snapshot)
  assert.deepEqual(actual,after)
  for(const table of ['portfolio_legacy_reconciliations','portfolio_legacy_reconciliation_objects','portfolio_legacy_inventory_bindings'])assert.equal((await queryRead('SELECT count(*) AS n FROM '+table))[0].n,0)
  const sixAfter=await queryRead('SELECT * FROM portfolios WHERE id BETWEEN 5 AND 10 ORDER BY id');assert.deepEqual(sixAfter,sixBefore)
  const result={completed:'production-migration0017',at:new Date().toISOString(),databaseId:database,migration:migrationName,onlyPendingBefore:pending,
    appliedMigrationCount:1,atomicPreAndPostConditionsMatched:true,sixPortfolioRecordsByteForByteUnchanged:true,sixPublished:true,
    allApplicationTableRowsUnchanged:sha(JSON.stringify(actual.tables))===sha(JSON.stringify(before.tables)),backupSha256:backup.sha256,
    legacyFinalizationExceptionDisabled:true,legacyAuthoritiesSeeded:0,allOriginalBirthRecordsPreserved:true,protocol:0,authorizationGeneration:0,runtimeRevision:0,cleanup:false,finalization:false,
    r2Operations:0,workerOperations:0,securityFlagChanges:0}
  await save('completion',result);console.log(JSON.stringify(result,null,2))
}catch{
  await save(attempting?'outcome-unresolved':'preflight-stopped',{at:new Date().toISOString(),databaseId:database,writeAttempted:attempting,action:'STOP. Preserve evidence; no automatic retry/rollback or additional migration.'})
  console.error(attempting?'STOP: migration outcome requires read-only reconciliation; no retry or rollback.':'STOP: preflight discrepancy; no remote write attempted.');process.exitCode=1
}
