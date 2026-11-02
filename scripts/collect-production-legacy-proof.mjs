// Exact IDs5-10, registered prefixes only. GET/SELECT, no customer modifications.
import assert from 'node:assert/strict'
import { readFile, open, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { sandboxReadCredential } from './verify-sandbox-deployment.mjs'
const account='4ec868eac2a3b9127531ad39d2501f15', database='8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
const output='C:/Users/cezar/Desktop/bitreca-deletion-review/production-legacy-object-proof-20261030.json'
if (process.argv[2] !== '--read-only') { console.log('PLAN ONLY: fixed production IDs5-10, immutable registry/source checks and metadata listing of their registered prefixes only. No writes or deletion.'); process.exit(0) }
await assert.rejects(access(output), error=>error.code==='ENOENT')
const beforeRelease=JSON.parse(await readFile('C:/Users/cezar/Desktop/bitreca-deletion-review/production-release-preflight-20261030.json','utf8'))
const credential=await sandboxReadCredential('C:/Users/cezar/Desktop/bitreca-deletion-review/deletion-production-candidate-20261029/main.wrangler.jsonc')
const base='/accounts/'+account
const get=async(path,sql)=>{
  assert.ok(path.startsWith(base+'/'))
  assert.ok(!sql || sql.startsWith('SELECT '))
  const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method:sql?'POST':'GET',redirect:'error',
    headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},...(sql?{body:JSON.stringify({sql})}:{}),signal:AbortSignal.timeout(30000)})
  assert.ok(response.ok,`Read-only HTTP ${response.status}; stop without retry`)
  const data=await response.json();assert.equal(data.success,true);return data
}
const identity=(await get(base+'/d1/database/'+database)).result
assert.equal(identity.uuid,database);assert.equal(identity.name,'bitreca-db')
assert.equal((await get(base+'/r2/buckets/bitreca-media')).result.name,'bitreca-media')
const select=async sql=>{const result=(await get(base+'/d1/database/'+database+'/query',sql)).result;assert.ok(result.length===1&&result[0].success&&result[0].meta.rows_written===0);return result[0].results}
const portfolioSQL=`SELECT p.id,p.slug,p.status,p.storage_prefix,p.publication_revision,p.deletion_requested_at,o.minimum_at_birth,o.epoch_id,o.initial_prefix,
 (p.storage_birth_token=o.birth_token) AS birth_identity_matches,
 EXISTS(SELECT 1 FROM portfolio_storage_birth_seals s WHERE s.portfolio_id=p.id AND s.initial_prefix=o.initial_prefix AND s.writer_token=o.birth_token) AS initial_seal_matches
 FROM portfolios p LEFT JOIN portfolio_storage_origins o ON o.portfolio_id=p.id WHERE p.id BETWEEN 5 AND 10 ORDER BY p.id`
const allocationSQL=`SELECT a.prefix,a.portfolio_id,a.allocation_kind,a.source_prefix,a.writer_protocol_version,a.writer_state,a.writer_closed_at,e.sequence,
 (e.writer_token=a.writer_token AND e.writer_protocol_version=a.writer_protocol_version AND e.allocation_kind=a.allocation_kind AND e.source_prefix IS a.source_prefix) AS immutable_event_matches,
 (SELECT count(*) FROM portfolio_storage_allocations foreign_owner WHERE foreign_owner.portfolio_id<>a.portfolio_id AND (substr(a.prefix,1,length(foreign_owner.prefix))=foreign_owner.prefix OR substr(foreign_owner.prefix,1,length(a.prefix))=a.prefix)) AS overlapping_foreign_allocations,
 (SELECT count(*) FROM portfolios other WHERE other.id<>a.portfolio_id AND (substr(a.prefix,1,length(other.storage_prefix))=other.storage_prefix OR substr(other.storage_prefix,1,length(a.prefix))=a.prefix)) AS overlapping_foreign_current_prefixes
 FROM portfolio_storage_allocations a LEFT JOIN portfolio_storage_allocation_events e ON e.portfolio_id=a.portfolio_id AND e.prefix=a.prefix
 WHERE a.portfolio_id BETWEEN 5 AND 10 ORDER BY a.portfolio_id,e.sequence,a.prefix`
const portfolios=await select(portfolioSQL),allocations=await select(allocationSQL)
assert.equal(portfolios.length,6)
for(const p of portfolios){const old=beforeRelease.portfolios.find(row=>row.id===p.id);assert.ok(old&&old.slug===p.slug&&old.storage_prefix===p.storage_prefix&&p.status==='published'&&p.deletion_requested_at===null)}
const inventories=[]
for(const allocation of allocations){
  assert.ok(/^portfolio-(?:initial|versions)\/[0-9a-f/-]+\/$/.test(allocation.prefix),'Only registered UUID namespaces permitted')
  assert.ok(allocation.portfolio_id>=5&&allocation.portfolio_id<=10)
  let cursor=null,complete=false
  const objects=[],pages=[]
  for(let page=0;page<20;page++){
    const params=new URLSearchParams({prefix:allocation.prefix,limit:'1000',include:'customMetadata'})
    if(cursor)params.set('cursor',cursor)
    const data=await get(base+'/r2/buckets/bitreca-media/objects?'+params)
    assert.ok(Array.isArray(data.result))
    for(const row of data.result){assert.ok(row.key.startsWith(allocation.prefix));objects.push({key:row.key,size:row.size,etag:row.etag,last_modified:row.last_modified})}
    pages.push({count:data.result.length})
    const next=data.result_info?.cursor
    if(!next){assert.ok(data.result.length<1000,'Pagination completeness unknown');complete=true;break}
    assert.notEqual(next,cursor);cursor=next
  }
  assert.ok(complete,'Prefix listing incomplete; no eligibility inferred')
  inventories.push({portfolio_id:allocation.portfolio_id,prefix:allocation.prefix,completeListing:true,pages,objects,objectOwnershipCertified:false})
}
assert.deepEqual(await select(portfolioSQL),portfolios,'Portfolio changed during read-only collection')
assert.deepEqual(await select(allocationSQL),allocations,'Allocation/writer history changed during collection')
const known=allocations.every(a=>a.immutable_event_matches===1&&a.writer_protocol_version===1&&a.writer_state==='closed'&&a.writer_closed_at!==null&&a.overlapping_foreign_allocations===0&&a.overlapping_foreign_current_prefixes===0&&
 (a.source_prefix===null||allocations.some(source=>source.portfolio_id===a.portfolio_id&&source.prefix===a.source_prefix&&source.sequence<a.sequence)))
const result={observedAt:new Date().toISOString(),target:{account,database,bucket:'bitreca-media'},readOnly:true,portfolios,allocations,inventories,
 registeredSourceChainAndNoKnownForeignOverlap:known,allHaveOriginalBirthAndSeal:portfolios.every(row=>row.birth_identity_matches===1&&row.initial_seal_matches===1),
 minimumAtBirthZero:portfolios.every(row=>row.minimum_at_birth===0),signedEpochMissing:portfolios.every(row=>row.epoch_id===null),
 externallyUntrackedWritersExcluded:false,objectContentHashesVerified:false,completeUnregisteredHistoricalPrefixesExcluded:false,
 eligible:false,reason:'Current registered lineage and object identities are evidence inputs, not replacement birth epochs or per-object ownership/settlement authorization',remoteMutations:false}
const bytes=JSON.stringify(result,null,2)+'\n',file=await open(output,'wx')
try{await file.writeFile(bytes);await file.sync()}finally{await file.close()}
console.log(JSON.stringify({output,sha256:createHash('sha256').update(bytes).digest('hex'),portfolios:portfolios.map(p=>({id:p.id,slug:p.slug,status:p.status,prefixes:inventories.filter(i=>i.portfolio_id===p.id).length,objects:inventories.filter(i=>i.portfolio_id===p.id).reduce((n,i)=>n+i.objects.length,0)})),
 registeredSourceChainAndNoKnownForeignOverlap:known,originalBirthsAndSealsMatch:result.allHaveOriginalBirthAndSeal,eligible:false,remoteMutations:false},null,2))
