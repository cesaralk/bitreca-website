import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import worker from '../worker/index.js'
import { handleContactRequest } from '../worker/contact-enquiry.js'
import { enquiryReplyLinks } from '../shared/contact-enquiry.js'
import { contactDatabase } from './helpers/contact-d1.js'

const origin = 'https://bitreca.test'
const sample = { name: ' QA Visitor ', email: ' qa@example.com ', service: 'Applications', message: 'A synthetic project enquiry for endpoint testing.', phone: '+961 70 123 456', whatsappConsent: true, website: '', turnstileToken: 'synthetic-token' }
function fixture(t, options) {
  const database = contactDatabase(options)
  t.after(() => database.close())
  const env = { bitreca_db: database.db, CONTACT_INBOX_ENABLED: 'true', CONTACT_ALLOWED_ORIGINS: origin,
    CONTACT_RATE_LIMIT_SECRET: 'synthetic-contact-private-key-32-characters-minimum', CONTACT_TURNSTILE_SECRET: 'synthetic-turnstile-secret', CONTACT_TURNSTILE_SITE_KEY: 'synthetic-site-key',
    ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-password', SESSION_SECRET: 'synthetic-admin-session-secret', ADMIN_AUTH_VERSION: '1' }
  const calls = []
  const fetcher = async (url, options) => { assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify'); calls.push(JSON.parse(options.body)); return Response.json({ success: true, hostname: 'bitreca.test', action: 'contact_enquiry' }) }
  return { ...database, env, calls, fetcher }
}
const publicRequest = (body, headers = {}, method = 'POST') => new Request(`${origin}/api/enquiries`, { method, headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'application/json', ...headers }, ...(!['GET','HEAD'].includes(method) && { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
const enquiry = (changes = {}) => ({ ...sample, requestId: crypto.randomUUID(), ...changes })
const count = f => f.sqlite.prepare('SELECT COUNT(*) AS n FROM contact_enquiries').get().n
async function submit(f, input = enquiry(), headers = {}) { return handleContactRequest(publicRequest(input, headers), f.env, f.fetcher) }
async function login(f) {
  const response = await worker.fetch(new Request(`${origin}/api/admin/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: f.env.ADMIN_USERNAME, password: f.env.ADMIN_PASSWORD }) }), f.env)
  assert.equal(response.status, 200)
  return response.headers.get('Set-Cookie').split(';')[0]
}
function adminRequest(path = '', { cookie = '', method = 'GET', body, requestOrigin = origin } = {}) {
  return new Request(`${origin}/api/admin/enquiries${path}`, { method, headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) })
}
function seed(f, { status = 'new', createdAt = f.state.now, ...fields } = {}) {
  const data = { ...sample, ...fields }; const id = crypto.randomUUID()
  f.sqlite.prepare('INSERT INTO contact_enquiries (id, request_id, request_hash, name, email, service, message, phone, whatsapp_consent, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, crypto.randomUUID(), '0'.repeat(64), data.name.trim(), data.email.trim(), data.service, data.message, null, 0, status, createdAt, createdAt)
  return id
}

test('migration is additive, constrained and preserves existing data/auth state', t => {
  const f = fixture(t)
  assert.equal(f.sqlite.prepare('SELECT marker FROM projects').get().marker, 'keep-project')
  assert.equal(f.sqlite.prepare('SELECT marker FROM portfolios').get().marker, 'keep-portfolio')
  assert.equal(f.sqlite.prepare('SELECT auth_version FROM admin_auth_state').get().auth_version, 1)
  const id = seed(f)
  assert.throws(() => f.sqlite.prepare("UPDATE contact_enquiries SET status='unsupported' WHERE id=?").run(id))
  assert.throws(() => f.sqlite.prepare('UPDATE contact_enquiries SET whatsapp_consent=1 WHERE id=?').run(id))
  const existingRequestId = f.sqlite.prepare('SELECT request_id FROM contact_enquiries WHERE id=?').get(id).request_id
  assert.throws(() => f.sqlite.prepare('UPDATE contact_enquiries SET request_id=? WHERE id=?').run(existingRequestId, seed(f)))
})

test('public config requires migration, flag, origin, private rate key and free Turnstile; no Resend dependency', async t => {
  const f = fixture(t)
  const config = () => handleContactRequest(new Request(`${origin}/api/contact/config`), f.env)
  assert.deepEqual(await (await config()).json(), { enabled: true, mode: 'inbox', siteKey: 'synthetic-site-key' })
  for (const key of ['CONTACT_INBOX_ENABLED','CONTACT_ALLOWED_ORIGINS','CONTACT_RATE_LIMIT_SECRET','CONTACT_TURNSTILE_SECRET','CONTACT_TURNSTILE_SITE_KEY']) {
    const value=f.env[key]; delete f.env[key]
    assert.equal((await (await config()).json()).enabled, false)
    assert.equal((await submit(f)).status, 503); f.env[key]=value
  }
  const absent = fixture(t, { migrate: false })
  assert.equal((await (await handleContactRequest(new Request(`${origin}/api/contact/config`), absent.env)).json()).enabled, false)
  assert.equal((await submit(absent)).status, 503)
  assert.equal(f.calls.length, 0)
})

test('public method/origin/size/content type/shape/validation reject without saving', async t => {
  const f=fixture(t)
  const requests=[
    [publicRequest(undefined,{},'GET'),405], [publicRequest(enquiry(),{Origin:'https://evil.test'}),403],
    [publicRequest(enquiry(),{'CF-Connecting-IP':''}),503], [publicRequest(enquiry(),{'Content-Type':'text/plain'}),415],
    [publicRequest('x'.repeat(24577)),413], [publicRequest('{'),400], [publicRequest('null'),400], [publicRequest([]),400],
    [publicRequest(enquiry({ extra:true })),400], [publicRequest(enquiry({ website:'filled honeypot' })),400],
    [publicRequest(enquiry({ requestId:'bad-id' })),400], [publicRequest(enquiry({ name:'A\r\nBcc:a@evil.test' })),422],
    [publicRequest(enquiry({ email:'qa@example.com\r\nBcc:a@evil.test' })),422], [publicRequest(enquiry({ message:'short' })),422],
    [publicRequest(enquiry({ message:'x'.repeat(5001) })),422], [publicRequest(enquiry({ message:'x'.repeat(30)+'\u0000' })),422],
    [publicRequest(enquiry({ name:'x'.repeat(101) })),422], [publicRequest(enquiry({ service:'Unknown' })),422],
    [publicRequest(enquiry({ phone:42 })),422], [publicRequest(enquiry({ phone:'+961 70 123 456',whatsappConsent:false })),422],
    [publicRequest(enquiry({ phone:'',whatsappConsent:true })),422], [publicRequest(enquiry({ phone:'+123&text=bad' })),422],
  ]
  for(const [request,status] of requests){assert.equal((await handleContactRequest(request,f.env,f.fetcher)).status,status);assert.equal(count(f),0)}
  assert.equal(f.calls.length,0)
})

test('Turnstile success, exact hostname/action and non-reused tokens are required for new storage',async t=>{
  const f=fixture(t)
  for(const value of [{success:false,'error-codes':['timeout-or-duplicate']},{success:true,hostname:'evil.test',action:'contact_enquiry'},{success:true,hostname:'bitreca.test',action:'login'}]){
    const result=await handleContactRequest(publicRequest(enquiry()),f.env,async()=>Response.json(value));assert.equal(result.status,400)
  }
  assert.equal((await handleContactRequest(publicRequest(enquiry()),f.env,async()=>{throw new DOMException('timeout','TimeoutError')})).status,503)
  assert.equal(count(f),0)
})

test('stored acknowledgement follows actual D1 insert, with normalized optional WhatsApp permission',async t=>{
  const f=fixture(t),input=enquiry();const response=await submit(f,input);const receipt=await response.json()
  assert.equal(response.status,201);assert.deepEqual(Object.keys(receipt).sort(),['reference','status']);assert.equal(receipt.status,'stored')
  const row=f.sqlite.prepare('SELECT * FROM contact_enquiries WHERE id=?').get(receipt.reference)
  assert.equal(row.name,'QA Visitor');assert.equal(row.email,'qa@example.com');assert.equal(row.phone,'+96170123456');assert.equal(row.whatsapp_consent,1);assert.equal(row.status,'new');assert.equal(row.version,1);assert.equal(row.request_hash.length,64)
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].secret,'synthetic-turnstile-secret')
  const without=await submit(f,enquiry({phone:'',whatsappConsent:false}));assert.equal(without.status,201)
  assert.equal(f.sqlite.prepare('SELECT phone FROM contact_enquiries WHERE id=?').get((await without.json()).reference).phone,null)
})

test('same request ID/body is idempotent; changed body conflicts without exposing or duplicating content',async t=>{
  const f=fixture(t),input=enquiry();const first=await submit(f,input);const receipt=await first.json()
  const duplicate=await submit(f,{...input,requestId:input.requestId.toUpperCase()});assert.equal(duplicate.status,200);assert.deepEqual(await duplicate.json(),receipt)
  const conflict=await submit(f,{...input,message:'Changed synthetic project details using the same request ID.'});assert.equal(conflict.status,409);assert.ok(!(await conflict.text()).includes('QA Visitor'))
  assert.equal(count(f),1);assert.equal(f.calls.length,1)
})

test('concurrent duplicate requests store only one row and concurrent IP attempts cannot exceed five slots',async t=>{
  const f=fixture(t),input=enquiry();const responses=await Promise.all([submit(f,input),submit(f,input)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);assert.equal(count(f),1)
  const g=fixture(t);const results=await Promise.all(Array.from({length:6},()=>submit(g)));assert.equal(results.filter(r=>r.status===201).length,5);assert.equal(results.filter(r=>r.status===429).length,1);assert.equal(count(g),5)
})

test('lost write acknowledgement can be retried without a duplicate or false success',async t=>{
  const f=fixture(t),input=enquiry();let once=true
  f.state.failure=({sql,phase})=>{if(once&&phase==='after'&&sql.includes('INSERT INTO contact_enquiries')){once=false;throw new Error('Synthetic lost acknowledgement')}}
  const failed=await submit(f,input);assert.equal(failed.status,503);assert.equal((await failed.json()).status,'unconfirmed');assert.equal(count(f),1)
  f.state.failure=null;const retry=await submit(f,input);assert.equal(retry.status,200);assert.equal((await retry.json()).status,'stored');assert.equal(count(f),1)
})

test('per-IP/shared budgets are persistent atomic D1 counters; missing/failing infrastructure never saves',async t=>{
  const f=fixture(t);for(let i=0;i<5;i++)assert.equal((await submit(f)).status,201)
  const limit=await submit(f);assert.equal(limit.status,429);assert.equal(limit.headers.get('Retry-After'),'600');assert.equal(count(f),5)
  const keys=f.sqlite.prepare('SELECT key FROM contact_enquiry_limits').all().map(row=>row.key);assert.ok(keys.every(key=>!key.includes('192.0.2.1')))
  const g=fixture(t);for(let i=0;i<20;i++)assert.equal((await submit(g,enquiry(),{'CF-Connecting-IP':`198.51.100.${i+1}`})).status,201)
  assert.equal((await submit(g,enquiry(),{'CF-Connecting-IP':'198.51.100.99'})).status,429)
  const h=fixture(t);await submit(h);h.sqlite.prepare("UPDATE contact_enquiry_limits SET hits=200 WHERE key LIKE 'day:%'").run();const daily=await submit(h,enquiry(),{'CF-Connecting-IP':'198.51.100.50'});assert.equal(daily.status,429);assert.equal(daily.headers.get('Retry-After'),'86400');assert.equal(count(h),1)
  const broken=fixture(t);broken.state.failure=({sql})=>{if(sql.includes('INSERT INTO contact_enquiry_limits'))throw new Error('Counter unavailable')};assert.equal((await submit(broken)).status,503);assert.equal(count(broken),0)
})

test('counter cleanup is bounded and never touches existing data or enquiry records',async t=>{
  const f=fixture(t);for(let i=0;i<150;i++)f.sqlite.prepare('INSERT INTO contact_enquiry_limits VALUES (?,1,?)').run('expired:'+i,f.state.now-1)
  assert.equal((await submit(f)).status,201);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM contact_enquiry_limits WHERE key LIKE 'expired:%'").get().n,50)
  assert.equal(f.sqlite.prepare('SELECT marker FROM projects').get().marker,'keep-project');assert.equal(count(f),1)
})

test('anonymous/forged sessions cannot list, read or manage the inbox; public GET never lists messages',async t=>{
  const f=fixture(t),id=seed(f)
  for(const cookie of ['', '__Host-bitreca_admin_session=v2.'+'a'.repeat(64)])for(const [path,method,body] of [['','GET'],['/'+id,'GET'],['/'+id,'PATCH',{status:'archived',version:1}]]){
    f.state.queries=[];const response=await worker.fetch(adminRequest(path,{cookie,method,body}),f.env);assert.equal(response.status,401);assert.ok(!(await response.text()).includes('QA Visitor'));assert.ok(f.state.queries.every(sql=>!sql.includes('contact_enquiries')))
  }
  assert.equal((await handleContactRequest(publicRequest(undefined,{},'GET'),f.env,f.fetcher)).status,405)
  const absent={...f.env,SESSION_SECRET:''};assert.equal((await worker.fetch(adminRequest(),absent)).status,503)
})

test('existing owner auth reads minimal paginated lists and full details with no-store; disabling public form does not hide inbox',async t=>{
  const f=fixture(t),cookie=await login(f);const ids=[]
  for(let i=0;i<25;i++)ids.push(seed(f,{createdAt:f.state.now+i,status:i===0?'archived':'new'}))
  f.env.CONTACT_INBOX_ENABLED='false'
  const response=await worker.fetch(adminRequest('',{cookie}),f.env);assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/)
  const page=await response.json();assert.equal(page.enquiries.length,20);assert.ok(page.nextCursor);assert.equal(page.enquiries[0].message,undefined);assert.equal(page.enquiries[0].phone,undefined);assert.equal(page.enquiries[0].request_hash,undefined)
  const next=await (await worker.fetch(adminRequest('?cursor='+encodeURIComponent(page.nextCursor),{cookie}),f.env)).json();assert.equal(next.enquiries.length,5);assert.equal(new Set([...page.enquiries,...next.enquiries].map(row=>row.id)).size,25)
  const filtered=await (await worker.fetch(adminRequest('?status=archived',{cookie}),f.env)).json();assert.equal(filtered.enquiries.length,1)
  const detail=await worker.fetch(adminRequest('/'+ids[0],{cookie}),f.env);assert.equal(detail.status,200);assert.match(detail.headers.get('Cache-Control'),/no-store/);assert.equal((await detail.json()).enquiry.message,sample.message)
  for(const path of ['?status=invalid','?cursor=not-json','?status=new&status=archived','?search=private'])assert.equal((await worker.fetch(adminRequest(path,{cookie}),f.env)).status,400)
})

test('owner status changes are origin-protected and versioned; stale updates and invalid operations are rejected',async t=>{
  const f=fixture(t),id=seed(f),cookie=await login(f)
  const patch=(body,requestOrigin=origin)=>worker.fetch(adminRequest('/'+id,{cookie,method:'PATCH',body,requestOrigin}),f.env)
  assert.equal((await patch({status:'replied',version:1},'https://evil.test')).status,403)
  let version=1;for(const status of ['in_progress','replied','archived','new']){const response=await patch({status,version});assert.equal(response.status,200);assert.equal((await response.json()).enquiry.version,++version)}
  assert.equal((await patch({status:'archived',version:1})).status,409);assert.equal((await patch({status:'unsupported',version})).status,400)
  assert.equal((await worker.fetch(adminRequest('/'+crypto.randomUUID(),{cookie}),f.env)).status,404)
  assert.equal((await worker.fetch(adminRequest('/'+id,{cookie,method:'DELETE'}),f.env)).status,405)
  assert.equal(f.sqlite.prepare('SELECT version FROM contact_enquiries WHERE id=?').get(id).version,version)
  assert.equal(f.calls.length,0)
})

test('expired/revoked/rotated owner sessions cannot access messages',async t=>{
  const f=fixture(t),cookie=await login(f);seed(f)
  f.state.now+=8*60*60+1;assert.equal((await worker.fetch(adminRequest('',{cookie}),f.env)).status,401)
  f.state.now-=8*60*60+1
  const rotated={...f.env,SESSION_SECRET:'different-synthetic-session-secret'};assert.equal((await worker.fetch(adminRequest('',{cookie}),rotated)).status,401)
  const logout=await worker.fetch(new Request(`${origin}/api/admin/logout`,{method:'POST',headers:{Origin:origin,Cookie:cookie}}),f.env);assert.equal(logout.status,200);assert.equal((await worker.fetch(adminRequest('',{cookie}),f.env)).status,401)
})

test('manual reply links require safe email and explicit valid WhatsApp permission; no action sends or marks Replied',()=>{
  const links=enquiryReplyLinks({email:'qa+reply@example.com',phone:'+961 70 123 456',whatsapp_consent:1});assert.ok(links.email.startsWith('mailto:qa%2Breply%40example.com?subject='));assert.ok(links.whatsapp.startsWith('https://wa.me/96170123456?text='))
  assert.equal(enquiryReplyLinks({email:'qa@example.com',phone:'+96170123456',whatsapp_consent:0}).whatsapp,'')
  assert.equal(enquiryReplyLinks({email:'bad\r\nBcc:a@evil.test',phone:'javascript:alert(1)',whatsapp_consent:1}).email,'')
  assert.equal(enquiryReplyLinks({email:'qa@example.com',phone:'not-a-number',whatsapp_consent:1}).whatsapp,'')
})

test('new route is behind the unchanged admin gate and obsolete outbound provider code is absent',()=>{
  const source=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');assert.ok(source.indexOf('return handleAdminEnquiries(request, env)')>source.indexOf('const authenticated = await isAdminAuthenticated'))
  assert.doesNotMatch(readFileSync(new URL('../worker/contact-enquiry.js',import.meta.url),'utf8'),/api\.resend\.com|RESEND_API_KEY|CONTACT_EMAIL_ENABLED/)
})
