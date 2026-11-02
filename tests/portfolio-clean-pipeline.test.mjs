import test,{beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import worker from '../worker/index.js'
import hosting from '../portfolio-hosting/index.js'
import {registerStorageProtocolVerification} from '../worker/portfolio-inventory.js'
import {inventoryTrustFromEnvironment,authorizePortfolioWriter,getDeletionAuthorization,PORTFOLIO_STORAGE_SENTINEL} from '../worker/portfolio-deletion-config.js'
import {runPortfolioDeletionJob} from '../worker/portfolio-deletion-workflow.js'
const database='8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a',bucket='bitreca-portfolios-prod-20261031'
const scope=`portfolioforest/production/${bucket}/${database}`,oldScope=`portfolioforest/production/bitreca-media/${database}`
const uuid=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000000'
const token=n=>n.toString(16).padStart(32,'0')
const sha=b=>createHash('sha256').update(b).digest('hex')
beforeEach(t=>{t.mock.method(globalThis,'fetch',()=>{throw new Error('Network forbidden in focused clean-storage tests')});t.mock.method(console,'error',()=>{})})
function storage(){
 const objects=new Map(),calls=[]
 const metadata=o=>({key:o.key,size:o.bytes.length,etag:sha(o.bytes),httpMetadata:o.httpMetadata,customMetadata:o.customMetadata})
 return {objects,calls,
  async list({prefix,limit=100}){calls.push(['list',prefix]);const rows=[...objects.values()].filter(o=>o.key.startsWith(prefix)).sort((a,b)=>a.key.localeCompare(b.key));return{objects:rows.slice(0,limit).map(metadata),truncated:rows.length>limit,...(rows.length>limit?{cursor:'synthetic'}:{})}},
  async head(key){calls.push(['head',key]);const o=objects.get(key);return o?metadata(o):null},
  async get(key){calls.push(['get',key]);const o=objects.get(key);return o?{...metadata(o),body:new Blob([o.bytes]).stream()}:null},
  async put(key,body,options={}){calls.push(['put',key]);const bytes=new Uint8Array(await new Response(body).arrayBuffer());objects.set(key,{key,bytes,...options})},
  async delete(keys){calls.push(['delete',keys]);for(const key of keys)objects.delete(key)},
 }
}
async function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON')
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort())sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'))
 let clock=Math.floor(Date.now()/1000);sql.function('unixepoch',()=>clock)
 const old=storage(),fresh=storage()
 for(let id=5;id<=10;id++){
  const prefix=`portfolio-initial/${uuid(id)}/`
  sql.prepare("INSERT INTO portfolios(id,name,slug,storage_prefix,status,storage_birth_token) VALUES(?,?,?,?, 'published',?)").run(id,'Synthetic legacy '+id,'legacy-'+id,prefix,token(id))
  sql.prepare("INSERT INTO portfolio_storage_allocations(prefix,portfolio_id,allocation_kind,upload_state,writer_protocol_version,writer_token,writer_state,writer_closed_at) VALUES(?,?,'initial','completed',1,?,'closed',unixepoch())").run(prefix,id,token(id))
  await old.put(prefix+'index.html','LEGACY-'+id)
 }
 const legacyRows=JSON.stringify(sql.prepare('SELECT * FROM portfolios ORDER BY id').all())
 sql.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
 const publicKey=new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey)),signer=sha(publicKey)
 const enroll=(generation,policyScope,artifact)=>{
  sql.prepare("INSERT INTO portfolio_storage_authorization_policies(id,generation,policy,operator_id,operator_key_id,storage_scope,deployment_sha256,enrolled_at) VALUES(?,?,'solo-operator-v1','synthetic-owner',?,?,?,unixepoch())").run(uuid(100+generation),generation,signer,policyScope,artifact)
  sql.prepare("UPDATE portfolio_storage_authorization_state SET policy='solo-operator-v1',generation=?,policy_id=? WHERE id=1").run(generation,uuid(100+generation))
 }
 enroll(1,oldScope,'1'.repeat(64));enroll(2,scope,'2'.repeat(64))
 assert.equal(sql.prepare('SELECT count(DISTINCT operator_key_id) AS n FROM portfolio_storage_authorization_policies').get().n,1)
 function prepare(query,values=[]){return{query,values,bind(...args){return prepare(query,args)},async first(){return sql.prepare(query).get(...values)??null},async all(){return{success:true,results:sql.prepare(query).all(...values)}},async run(){const n=sql.prepare('SELECT total_changes() AS n').get().n;const result=sql.prepare(query).run(...values);return{success:true,meta:{changes:sql.prepare('SELECT total_changes() AS n').get().n-n,last_row_id:Number(result.lastInsertRowid)}}}}}
 const db={prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}}
 const env={bitreca_db:db,bitreca_media:old,PORTFOLIO_STORAGE:fresh,ADMIN_USERNAME:'synthetic-admin',ADMIN_PASSWORD:'synthetic-password-only',SESSION_SECRET:'synthetic-test-session-secret-that-is-long-enough',ADMIN_AUTH_VERSION:'1',PORTFOLIO_ENVIRONMENT:'production',PORTFOLIO_DATABASE_ID:database,PORTFOLIO_BUCKET_NAME:bucket,PORTFOLIO_STORAGE_SCOPE:scope,PORTFOLIO_LEGACY_STORAGE_SCOPE:oldScope,PORTFOLIO_CLEAN_STORAGE_ENABLED:'true',PORTFOLIO_MUTATIONS_FROZEN:'true',PORTFOLIO_AUTHORIZATION_POLICY:'solo-operator-v1',PORTFOLIO_AUTHORIZATION_POLICY_ID:uuid(102),PORTFOLIO_AUTHORIZATION_GENERATION:'2',PORTFOLIO_OPERATOR_ID:'synthetic-owner',PORTFOLIO_OPERATOR_KEY_ID:signer,PORTFOLIO_DEPLOYMENT_SHA256:'2'.repeat(64),PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI:Buffer.from(publicKey).toString('base64'),PORTFOLIO_CLEANUP_ENABLED:'false',PORTFOLIO_FINALIZATION_ENABLED:'false',PORTFOLIO_SCHEDULE_ENABLED:'false',PORTFOLIO_DELETE_REQUESTS_ENABLED:'false',PORTFOLIO_EVIDENCE_IMPORT_ENABLED:'false'}
 const trust=await inventoryTrustFromEnvironment(env)
 const report={version:2,id:uuid(200),authorization_policy:'solo-operator-v1',policy_id:uuid(102),policy_generation:2,operator_id:'synthetic-owner',operator_key_id:signer,deployment_verified_at:clock,writers_fenced_at:clock,writers_settled_at:clock,storage_scope:scope,writer_protocol:1,deployment_sha256:env.PORTFOLIO_DEPLOYMENT_SHA256,evidence_sha256:'3'.repeat(64),legacy_writers_settled:true,verified_at:clock}
 const sign=async r=>{const payload=JSON.stringify(r);return{payload,signature:new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(payload)))}}
 const login=await worker.fetch(new Request('https://bitreca.com/api/admin/login',{method:'POST',headers:{Origin:'https://bitreca.com','Content-Type':'application/json'},body:JSON.stringify({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env)
 assert.equal(login.status,200,await login.clone().text());const cookie=login.headers.get('Set-Cookie').split(';')[0]
 const request=(method,path,body,headers={})=>new Request('https://bitreca.com'+path,{method,headers:{Origin:'https://bitreca.com',Cookie:cookie,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})})
 const api=(method,path,body,headers)=>worker.fetch(request(method,path,body,headers),env)
 const epoch=async()=>{const evidence=await sign(report);assert.equal((await registerStorageProtocolVerification(db,trust,evidence)).state,'recorded')}
 const sentinel=()=>fresh.put(PORTFOLIO_STORAGE_SENTINEL,'synthetic sentinel',{customMetadata:{environment:'production',storage_scope:scope,bucket_name:bucket,database_id:database}})
 const enableRuntime=finalization=>sql.prepare("UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,environment='production',storage_scope=?,bucket_name=?,database_id=?,signer_sha256=?,cleanup_enabled=1,finalization_enabled=? WHERE id=1").run(scope,bucket,database,signer,finalization?1:0)
 return{sql,db,env,trust,old,fresh,sign,report,api,epoch,sentinel,legacyRows,enableRuntime,advance(){clock+=4000}}
}
test('clean creation fails closed while frozen, without a new epoch, and with absent or wrong storage identity',async t=>{
 const f=await fixture(t)
 assert.equal((await f.api('POST','/api/admin/portfolios',{name:'Clean',slug:'clean'})).status,503)
 f.env.PORTFOLIO_MUTATIONS_FROZEN='false'
 await assert.rejects(authorizePortfolioWriter(f.env))
 assert.equal(f.fresh.calls.length,0)
 await f.epoch()
 await assert.rejects(authorizePortfolioWriter(f.env,{verifyStorageIdentity:true}))
 await f.fresh.put(PORTFOLIO_STORAGE_SENTINEL,'wrong',{customMetadata:{environment:'production',storage_scope:oldScope,bucket_name:'bitreca-media',database_id:database}})
 await assert.rejects(authorizePortfolioWriter(f.env,{verifyStorageIdentity:true}))
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolios').get().n,6)
 assert.equal(f.fresh.calls.filter(([method])=>method==='put'&&method!=='head').length,1)
 for (const mode of [undefined,'false']) await assert.rejects(authorizePortfolioWriter({...f.env,PORTFOLIO_CLEAN_STORAGE_ENABLED:mode}))
 const independent={...f.env,PORTFOLIO_AUTHORIZATION_POLICY:'independent-v1'}
 await assert.rejects(authorizePortfolioWriter(independent))
})
test('same-key policy advance needs a genuine new-scope envelope; restricted import can keep data frozen',async t=>{
 const f=await fixture(t)
 assert.equal((await registerStorageProtocolVerification(f.db,f.trust,await f.sign({...f.report,storage_scope:oldScope}))).state,'blocked')
 assert.equal((await registerStorageProtocolVerification(f.db,f.trust,await f.sign({...f.report,legacy_writers_settled:false}))).state,'blocked')
 const evidence=await f.sign(f.report),body={payload:evidence.payload,signature_base64:Buffer.from(evidence.signature).toString('base64')}
 assert.equal((await f.api('POST','/api/admin/portfolio-protocol-evidence',body)).status,503)
 f.env.PORTFOLIO_EVIDENCE_IMPORT_ENABLED='true'
 assert.equal((await f.api('POST','/api/admin/portfolio-protocol-evidence',body,{Origin:'https://foreign.invalid'})).status,403)
 assert.equal((await f.api('POST','/api/admin/portfolio-protocol-evidence',body)).status,200)
 assert.equal((await f.api('POST','/api/admin/portfolios',{name:'Clean',slug:'clean'})).status,503)
 assert.equal(await getDeletionAuthorization({...f.env,PORTFOLIO_CLEANUP_ENABLED:'true'}),null)
 assert.equal(f.sql.prepare('SELECT minimum_protocol_version FROM portfolio_storage_writer_policy').get().minimum_protocol_version,1)
 assert.equal(f.sql.prepare('SELECT cleanup_enabled+finalization_enabled AS n FROM portfolio_deletion_runtime_policy').get().n,0)
})
test('future creation, folder/HTML uploads, serving and protected cleanup use only the clean bucket; legacy/media survive',async t=>{
 const f=await fixture(t);await f.epoch();await f.sentinel();f.env.PORTFOLIO_MUTATIONS_FROZEN='false'
 const created=await f.api('POST','/api/admin/portfolios',{name:'Clean',slug:'clean-new'});assert.equal(created.status,201,await created.clone().text());const id=(await created.json()).portfolioId
 assert.equal(id,11)
 const origin=f.sql.prepare('SELECT minimum_at_birth,epoch_id FROM portfolio_storage_origins WHERE portfolio_id=?').get(id)
 assert.equal(origin.minimum_at_birth,1);assert.equal(origin.epoch_id,f.report.id)
 const folder=new FormData();folder.append('files',new File(['<html>CLEAN</html>'],'index.html'));folder.append('paths','index.html');folder.append('files',new File(['body{}'],'style.css'));folder.append('paths','style.css')
 const uploaded=await f.api('POST',`/api/admin/portfolios/${id}/upload-folder`,folder);assert.equal(uploaded.status,200,await uploaded.clone().text())
 const html=new FormData();html.append('file',new File(['<html>UPDATED</html>'],'index.html'))
 const replaced=await f.api('POST',`/api/admin/portfolios/${id}/upload`,html);assert.equal(replaced.status,200,await replaced.clone().text())
 assert.equal((await f.api('PATCH',`/api/admin/portfolios/${id}/status`,{status:'published'})).status,200)
 const hostEnv={...f.env,PORTFOLIO_DB:f.db,PORTFOLIO_FILES:f.old}
 assert.match(await (await hosting.fetch(new Request('https://clean-new.bitreca.com/'),hostEnv)).text(),/UPDATED/)
 for(let legacy=5;legacy<=10;legacy++)assert.equal(await (await hosting.fetch(new Request(`https://legacy-${legacy}.bitreca.com/`),hostEnv)).text(),'LEGACY-'+legacy)
 const oldWrites=f.old.calls.filter(([method])=>method==='put'||method==='delete').length
 const legacyHtml=new FormData();legacyHtml.append('file',new File(['replacement'],'index.html'))
 const rejected=await f.api('POST','/api/admin/portfolios/5/upload',legacyHtml);assert.notEqual(rejected.status,200)
 assert.equal(f.old.calls.filter(([method])=>method==='put'||method==='delete').length,oldWrites)
 const media=new FormData();media.append('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')],'image.png',{type:'image/png'}))
 const mediaResult=await f.api('POST','/api/admin/media/upload',media);assert.equal(mediaResult.status,200,await mediaResult.clone().text())
 assert.equal(f.old.calls.filter(([method])=>method==='put').length,7)
 f.env.PORTFOLIO_CLEANUP_ENABLED='true';f.env.PORTFOLIO_PRODUCTION_CLEANUP_APPROVED='true';f.env.PORTFOLIO_DELETE_REQUESTS_ENABLED='true';f.enableRuntime(false)
 const deletion=await f.api('DELETE',`/api/admin/portfolios/${id}`,undefined,{'X-Portfolio-Delete-Confirm':String(id)});assert.equal(deletion.status,202,await deletion.clone().text());const jobId=(await deletion.json()).job.id
 let state
 for(let step=0;step<20;step++){state=await runPortfolioDeletionJob(f.env,jobId);if(state.state==='storage_verified')break;assert.equal(state.state,'queued',JSON.stringify(state));f.advance()}
 assert.equal(state.state,'storage_verified');assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_finalizations').get().n,0)
 f.env.PORTFOLIO_FINALIZATION_ENABLED='true';f.enableRuntime(true);f.advance()
 assert.equal((await runPortfolioDeletionJob(f.env,jobId)).state,'finalized')
 assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM portfolios ORDER BY id').all()),f.legacyRows)
 assert.equal(f.old.calls.filter(([method])=>method==='delete').length,0)
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM portfolio_deletion_finalizations WHERE portfolio_id=11').get().n,1)
 assert.equal([...f.fresh.objects.keys()].filter(key=>key!==PORTFOLIO_STORAGE_SENTINEL).length,0)
})
