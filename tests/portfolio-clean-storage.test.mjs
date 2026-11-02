import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanPortfolioStorageEnabled,portfolioStorageBinding,newPortfolioStorage,
  getPortfolioReadStorage,requirePortfolioWriteStorage } from '../shared/portfolio-storage.js'

const database='8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
const oldScope=`portfolioforest/production/bitreca-media/${database}`
const epoch='11111111-1111-4111-8111-111111111111'
const birth='a'.repeat(32)
const isBlocked=error=>error?.code==='CONFIGURATION_BLOCKED'
function fixture(row={}) {
  const calls=[]
  const bucket=name=>({
    async get(key){calls.push([name,'get',key]);return name+'-body'},
    async head(key){calls.push([name,'head',key]);return {key}},
    async list(options){calls.push([name,'list',options]);return {objects:[],truncated:false}},
    async put(){calls.push([name,'put'])},async delete(){calls.push([name,'delete'])},
  })
  const old=bucket('old'),fresh=bucket('new'),hostingOld=bucket('hosting-old')
  const env={PORTFOLIO_CLEAN_STORAGE_ENABLED:'true',PORTFOLIO_ENVIRONMENT:'production',PORTFOLIO_DATABASE_ID:database,
    PORTFOLIO_BUCKET_NAME:'bitreca-portfolios-clean-test',PORTFOLIO_STORAGE_SCOPE:`portfolioforest/production/bitreca-portfolios-clean-test/${database}`,
    PORTFOLIO_LEGACY_STORAGE_SCOPE:oldScope,bitreca_media:old,PORTFOLIO_FILES:hostingOld,PORTFOLIO_STORAGE:fresh}
  const state={row:{id:11,origin_portfolio_id:11,storage_prefix:'portfolio-initial/test/',storage_birth_token:birth,birth_token:birth,
    minimum_at_birth:1,epoch_id:epoch,retained_epoch_id:epoch,authorized_epoch_id:epoch,storage_scope:env.PORTFOLIO_STORAGE_SCOPE,
    deletion_requested_at:null,source_owned:1,...row},queries:[]}
  const db={prepare(sql){return {bind(...args){state.queries.push({sql,args});return this},async first(){return state.row}}}}
  return {env,db,state,calls,old,fresh,hostingOld}
}

test('clean storage defaults off and preserves existing binding selection without querying D1',async()=>{
  const f=fixture();delete f.env.PORTFOLIO_CLEAN_STORAGE_ENABLED
  f.env.PORTFOLIO_BUCKET_NAME='bitreca-media';f.env.PORTFOLIO_STORAGE_SCOPE=oldScope
  assert.equal(cleanPortfolioStorageEnabled(f.env),false)
  assert.equal(newPortfolioStorage(f.env),f.old)
  assert.equal(portfolioStorageBinding(f.env,'hosting'),f.hostingOld)
  assert.equal(await requirePortfolioWriteStorage(f.env,f.db,11),f.old)
  const read=await getPortfolioReadStorage(f.env,f.db,11);await read.get('old.html')
  assert.equal(f.state.queries.length,0);assert.deepEqual(f.calls,[['old','get','old.html']])
})
test('new portfolio storage is a separate binding and never issues storage calls while selecting',()=>{
  const f=fixture();assert.equal(newPortfolioStorage(f.env),f.fresh)
  assert.equal(portfolioStorageBinding(f.env,'hosting'),f.fresh)
  assert.equal(f.env.bitreca_media,f.old);assert.equal(f.calls.length,0)
})
test('malformed clean mode, production identity, scope and absent new binding fail closed',()=>{
  for(const patch of [{PORTFOLIO_CLEAN_STORAGE_ENABLED:true},{PORTFOLIO_CLEAN_STORAGE_ENABLED:'TRUE'},
    {PORTFOLIO_ENVIRONMENT:'staging'},{PORTFOLIO_DATABASE_ID:'sandbox'},
    {PORTFOLIO_BUCKET_NAME:'bitreca-media'},{PORTFOLIO_STORAGE_SCOPE:oldScope},
    {PORTFOLIO_LEGACY_STORAGE_SCOPE:'unreviewed'},{PORTFOLIO_STORAGE:undefined}]) {
    const f=fixture();Object.assign(f.env,patch);assert.throws(()=>newPortfolioStorage(f.env),isBlocked)
  }
})
test('legacy min-0 origin reads the old bucket through a read-only capability for both Workers',async()=>{
  const f=fixture({minimum_at_birth:0,epoch_id:null,retained_epoch_id:null,storage_scope:null})
  const main=await getPortfolioReadStorage(f.env,f.db,11),hosting=await getPortfolioReadStorage(f.env,f.db,11,'hosting')
  assert.equal(main.put,undefined);assert.equal(main.delete,undefined);assert.ok(Object.isFrozen(main))
  assert.equal(await main.get('legacy.html'),'old-body')
  assert.equal(await hosting.get('legacy.html'),'hosting-old-body')
  assert.equal(f.calls.some(([bucket])=>bucket==='new'),false)
})
test('untracked legacy read is allowed only for an absent birth token and absent origin',async()=>{
  const f=fixture({origin_portfolio_id:null,storage_birth_token:null})
  assert.equal(await (await getPortfolioReadStorage(f.env,f.db,11)).get('old.html'),'old-body')
  f.state.row.storage_birth_token=birth
  await assert.rejects(getPortfolioReadStorage(f.env,f.db,11),isBlocked)
})
test('new min-1 origin reads only the new binding; a missing object never triggers fallback',async()=>{
  const f=fixture();f.fresh.get=async key=>{f.calls.push(['new','get',key]);return null}
  const storage=await getPortfolioReadStorage(f.env,f.db,11)
  assert.equal(await storage.get('missing.html'),null)
  assert.deepEqual(f.calls,[['new','get','missing.html']])
  assert.equal(storage.put,undefined);assert.equal(storage.delete,undefined)
})
test('old retained epoch reads stay on old storage without depending on the active authorization view',async()=>{
  const f=fixture({storage_scope:oldScope})
  assert.equal(await (await getPortfolioReadStorage(f.env,f.db,11)).get('kept.html'),'old-body')
  assert.match(f.state.queries[0].sql,/portfolio_storage_protocol_verifications/)
  assert.doesNotMatch(f.state.queries[0].sql,/portfolio_storage_authorized_epochs/)
})
test('unknown scopes, missing epochs, corrupt birth identity and invalid origins never fallback',async()=>{
  for(const patch of [{storage_scope:'foreign'},{retained_epoch_id:null},{birth_token:'b'.repeat(32)},
    {origin_portfolio_id:12},{minimum_at_birth:2},{minimum_at_birth:0},
    {minimum_at_birth:1,epoch_id:null,retained_epoch_id:null}]) {
    const f=fixture(patch);await assert.rejects(getPortfolioReadStorage(f.env,f.db,11),isBlocked);assert.equal(f.calls.length,0)
  }
  const absent=fixture();absent.state.row=null;await assert.rejects(getPortfolioReadStorage(absent.env,absent.db,11),isBlocked)
})
test('write selection requires a current authorized min-1 origin in the clean scope',async()=>{
  const f=fixture();assert.equal(await requirePortfolioWriteStorage(f.env,f.db,11),f.fresh)
  assert.match(f.state.queries[0].sql,/portfolio_storage_authorized_epochs/)
  assert.equal(f.calls.length,0)
  for(const patch of [{minimum_at_birth:0},{storage_scope:oldScope},{authorized_epoch_id:null},
    {birth_token:'b'.repeat(32)},{deletion_requested_at:1}]) {
    const bad=fixture(patch);await assert.rejects(requirePortfolioWriteStorage(bad.env,bad.db,11),isBlocked);assert.equal(bad.calls.length,0)
  }
})
test('stale or foreign source allocation cannot cross into the new bucket',async()=>{
  const f=fixture();assert.equal(await requirePortfolioWriteStorage(f.env,f.db,11,{sourcePrefix:f.state.row.storage_prefix}),f.fresh)
  f.state.row.source_owned=0
  await assert.rejects(requirePortfolioWriteStorage(f.env,f.db,11,{sourcePrefix:f.state.row.storage_prefix}),isBlocked)
  f.state.row.source_owned=1
  await assert.rejects(requirePortfolioWriteStorage(f.env,f.db,11,{sourcePrefix:'foreign/'}),isBlocked)
  await assert.rejects(requirePortfolioWriteStorage(f.env,f.db,11,{sourcePrefix:''}),isBlocked)
})
test('invalid identifiers and role cannot select a bucket',async()=>{
  const f=fixture()
  await assert.rejects(getPortfolioReadStorage(f.env,f.db,0),isBlocked)
  await assert.rejects(requirePortfolioWriteStorage(f.env,f.db,NaN),isBlocked)
  assert.throws(()=>portfolioStorageBinding(f.env,'unknown'),isBlocked)
  assert.equal(f.calls.length,0)
})

test('omitted or disabled clean routing never sends a new production scope to legacy storage',async()=>{
  for(const mode of [undefined,'false']){
    const f=fixture();f.env.PORTFOLIO_CLEAN_STORAGE_ENABLED=mode
    assert.throws(()=>newPortfolioStorage(f.env),isBlocked)
    await assert.rejects(getPortfolioReadStorage(f.env,f.db,11),isBlocked)
    await assert.rejects(requirePortfolioWriteStorage(f.env,f.db,11),isBlocked)
    assert.equal(f.calls.length,0)
  }
})
