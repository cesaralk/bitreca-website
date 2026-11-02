// Read-only reconciliation of the single approved attempt. Never retries a write.
import assert from 'node:assert/strict'
import { readFile, open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { sandboxReadCredential } from './verify-sandbox-deployment.mjs'
const root='C:/Users/cezar/Desktop/bitreca-deletion-review/production-live-enablement-20261030/migration16-execution'
const candidate='C:/Users/cezar/Desktop/bitreca-deletion-review/deletion-production-candidate-20261029'
const account='4ec868eac2a3b9127531ad39d2501f15',database='8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
const before=JSON.parse(await readFile(root+'/preflight.json','utf8'))
const credential=await sandboxReadCredential(candidate+'/main.wrangler.jsonc')
const get=async(path,body)=>{
  const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)})
  assert.ok(response.ok,`Read-only HTTP${response.status}; stop`)
  const data=await response.json();assert.equal(data.success,true);return data.result
}
const identity=await get(`/accounts/${account}/d1/database/${database}`)
assert.equal(identity.uuid,database);assert.equal(identity.name,'bitreca-db')
const queries=['SELECT name FROM d1_migrations ORDER BY name',"SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name IN ('portfolios_finalization_delete_guard','portfolio_legacy_finalization_disabled') ORDER BY name",'SELECT * FROM portfolios WHERE id BETWEEN 5 AND 10 ORDER BY id','SELECT * FROM portfolio_deletion_runtime_policy WHERE id=1','SELECT minimum_protocol_version FROM portfolio_storage_writer_policy WHERE id=1','SELECT * FROM portfolio_storage_authorization_state WHERE id=1']
const result=await get(`/accounts/${account}/d1/database/${database}/query`,{batch:queries.map(sql=>({sql}))})
assert.equal(result.length,queries.length);assert.ok(result.every(row=>row.success&&row.meta.rows_written===0))
const names=result[0].results.map(row=>row.name),triggers=result[1].results
const six=result[2].results.map(row=>({id:row.id,slug:row.slug,status:row.status,recordSha256:createHash('sha256').update(JSON.stringify(row)).digest('hex')}))
const unchanged=JSON.stringify(six)===JSON.stringify(before.six)
const recorded=names.includes('0016_disable_legacy_finalization_bridge.sql')
const fenced=triggers.some(row=>row.name==='portfolio_legacy_finalization_disabled')&&triggers.some(row=>row.name==='portfolios_finalization_delete_guard'&&!row.sql.includes('portfolio_legacy_deletion_finalizations'))
const output={observedAt:new Date().toISOString(),databaseId:database,readOnly:true,migrations:names,migration16Recorded:recorded,legacyFencePresent:fenced,
  six,sixRecordsUnchanged:unchanged,sixPublished:six.length===6&&six.every(row=>row.status==='published'),runtime:result[3].results,writerPolicy:result[4].results,authorization:result[5].results,
  result:recorded&&fenced&&unchanged?'MIGRATION_COMMITTED_VERIFIED':!recorded&&!fenced&&unchanged?'MIGRATION_NOT_COMMITTED':'BLOCKED_UNEXPECTED_STATE',writeRetryPerformed:false,r2Operations:0,workerOperations:0}
const file=await open(root+'/readonly-reconciliation.json','wx');try{await file.writeFile(JSON.stringify(output,null,2)+'\n');await file.sync()}finally{await file.close()}
console.log(JSON.stringify(output,null,2))
