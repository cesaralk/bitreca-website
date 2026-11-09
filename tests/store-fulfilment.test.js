import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import worker from '../worker/index.js'
import { contactDatabase } from './helpers/contact-d1.js'
import { fulfilmentDraft } from '../shared/store-fulfilment.js'

const origin = 'https://store.test', migration = readFileSync(new URL('../migrations/0022_store_request_fulfilment.sql', import.meta.url), 'utf8')
function fixture(t, { price = 1500, currency = 'USD' } = {}) {
  const f = contactDatabase(); t.after(() => f.close())
  for (const name of ['0019_add_store_catalogue.sql', '0020_add_store_order_requests.sql', '0021_store_product_permanent_deletion.sql']) f.sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'))
  const category = crypto.randomUUID(), product = crypto.randomUUID(), id = crypto.randomUUID()
  f.sqlite.prepare("INSERT INTO store_categories(id,creation_hash,title,slug,status) VALUES(?,?,'Fixture','fixture','published')").run(category, 'a'.repeat(64))
  f.sqlite.prepare("INSERT INTO store_products(id,creation_hash,category_id,title,sku,slug,status,price_minor,currency) VALUES(?,?,?,'Fixture','FIXTURE','fixture','published',?,?)").run(product, 'a'.repeat(64), category, price, currency)
  f.sqlite.prepare("INSERT INTO store_order_requests(id,request_id,request_hash,name,email,note,manual_review_ack,line_count,total_quantity,status) VALUES(?,?,?,'Synthetic fixture','qa@example.com','Preserve history',1,1,2,'archived')").run(id, crypto.randomUUID(), 'b'.repeat(64))
  f.sqlite.prepare("INSERT INTO store_order_request_items(id,request_ref,product_id,slug,sku,title,category_title,quantity,listed_price_minor,listed_currency,listed_price_note,listed_availability) VALUES(?,?,?,'fixture','FIXTURE','Original title','Original category',2,?,?,'Fixed fixture price','unknown')").run(crypto.randomUUID(), id, product, price, currency)
  f.sqlite.prepare('UPDATE store_order_requests SET committed=1 WHERE id=?').run(id)
  const before = { request: { ...f.sqlite.prepare('SELECT * FROM store_order_requests').get() }, items: f.sqlite.prepare('SELECT * FROM store_order_request_items').all().map(row => ({ ...row })) }
  f.sqlite.exec(migration)
  const env = { bitreca_db: f.db, ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-password', SESSION_SECRET: 'synthetic-session', ADMIN_AUTH_VERSION: '1', STORE_ORDER_REQUESTS_ENABLED: 'true' }
  const call = (path = '/' + id + '/fulfilment', cookie, method = 'PATCH', body, headers = {}) => worker.fetch(new Request(origin + '/api/admin/store/requests' + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(!['GET', 'HEAD'].includes(method) ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }), env)
  async function login() { const response = await worker.fetch(new Request(origin + '/api/admin/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }) }), env); assert.equal(response.status, 200); return response.headers.get('Set-Cookie').split(';')[0] }
  const record = () => ({ ...f.sqlite.prepare('SELECT * FROM store_order_requests WHERE id=?').get(id) })
  const payload = changes => ({ ...fulfilmentDraft(record()), version: record().version, customerConfirmation: false, paymentReceiptConfirmed: false, ...changes })
  const update = (cookie, changes) => call(undefined, cookie, 'PATCH', payload(changes))
  async function confirm(cookie, method = 'cod') {
    assert.equal((await update(cookie, { fulfilment_stage: 'supplier_check' })).status, 200)
    const response = await update(cookie, { fulfilment_stage: 'customer_confirmed', payment_method: method, delivery_charge_minor: 0, delivery_currency: 'USD', customerConfirmation: true })
    assert.equal(response.status, 200, JSON.stringify(await response.json()))
  }
  return { ...f, env, id, product, before, call, login, record, payload, update, confirm }
}

test('0022 adds only operational columns/index/guards; original records, snapshots, review statuses and protected tables survive', t => {
  const f = fixture(t), current = f.record()
  assert.deepEqual(Object.fromEntries(Object.keys(f.before.request).map(key => [key, current[key]])), f.before.request)
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM store_order_request_items').all().map(row => ({ ...row })), f.before.items)
  assert.equal(current.fulfilment_stage, 'new'); assert.equal(current.payment_status, 'pending'); assert.equal(current.customer_confirmed_at, null)
  assert.equal(f.sqlite.prepare('SELECT marker FROM portfolios').get().marker, 'keep-portfolio')
  assert.equal(f.sqlite.prepare('SELECT marker FROM projects').get().marker, 'keep-project')
  assert(!/^\s*(?:DROP|DELETE|UPDATE|INSERT)\s/im.test(migration.replace(/--[^\n]*/g, '')))
  assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(), [])
})

test('fulfilment inherits real session, origin and mutation protections; private routes have no public listing', async t => {
  const f = fixture(t), cookie = await f.login()
  assert.equal((await f.call(undefined, null, 'PATCH', f.payload())).status, 401)
  assert.equal((await f.call(undefined, '__Host-bitreca_admin_session=forged', 'PATCH', f.payload())).status, 401)
  assert.equal((await f.call(undefined, cookie, 'PATCH', f.payload(), { Origin: 'https://evil.test' })).status, 403)
  assert.equal((await f.call(undefined, cookie, 'DELETE')).status, 405)
  assert.equal((await f.call(undefined, cookie, 'GET')).status, 405)
  assert.equal((await worker.fetch(new Request(origin + '/api/store/order-requests/' + f.id + '/fulfilment'), f.env)).status, 404)
  assert.equal(f.record().version, 1)
})

test('supplier check -> confirmation -> sourcing -> completion preserves fixed snapshots and leaves payment pending', async t => {
  const f = fixture(t), cookie = await f.login()
  await f.confirm(cookie)
  const agreedAt = f.record().customer_confirmed_at
  f.sqlite.prepare('UPDATE store_products SET price_minor=9999 WHERE id=?').run(f.product)
  for (const stage of ['sourcing', 'ready_for_delivery', 'out_for_delivery', 'completed']) assert.equal((await f.update(cookie, { fulfilment_stage: stage, delivery_method: 'personal', delivery_status: stage === 'completed' ? 'delivered' : 'preparing' })).status, 200)
  assert.equal(f.record().payment_status, 'pending'); assert.equal(f.record().status, 'archived'); assert.equal(f.record().customer_confirmed_at, agreedAt)
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM store_order_request_items').all().map(row => ({ ...row })), f.before.items)
  const paid = await f.update(cookie, { payment_status: 'confirmed', paymentReceiptConfirmed: true }); assert.equal(paid.status, 200)
  assert.equal(f.record().payment_status, 'confirmed')
  assert.equal((await f.update(cookie, { payment_status: 'pending' })).status, 200, 'explicit correction remains possible')
})

test('confirmation requires agreed delivery charge/currency, payment method, fixed captured prices and explicit acknowledgement', async t => {
  const f = fixture(t), cookie = await f.login()
  assert.equal((await f.update(cookie, { fulfilment_stage: 'completed' })).status, 422)
  assert.equal((await f.update(cookie, { fulfilment_stage: 'supplier_check' })).status, 200)
  const terms = { fulfilment_stage: 'customer_confirmed', payment_method: 'wish_money', delivery_charge_minor: 250, delivery_currency: 'USD', customerConfirmation: true }
  for (const change of [{ customerConfirmation: false }, { delivery_charge_minor: null, delivery_currency: null }, { payment_method: null }, { delivery_currency: 'EUR' }]) assert.equal((await f.update(cookie, { ...terms, ...change })).status, 422)
  assert.equal(f.record().customer_confirmed_at, null)
  assert.equal((await f.update(cookie, terms)).status, 200)
  assert.equal(f.record().delivery_charge_minor, 250)
  for (const change of [{ delivery_charge_minor: 500 }, { payment_method: 'cod' }, { delivery_currency: 'EUR' }]) assert.equal((await f.update(cookie, change)).status, 422)
  assert.throws(() => f.sqlite.exec('UPDATE store_order_requests SET delivery_charge_minor=500'), /STORE_CONFIRMED_TERMS_LOCKED/)
})

test('unpriced historical request stays readable/manageable and cannot be falsely confirmed', async t => {
  const f = fixture(t, { price: null, currency: null }), cookie = await f.login()
  assert.equal((await f.call('/' + f.id, cookie, 'GET')).status, 200)
  await f.update(cookie, { fulfilment_stage: 'supplier_check' })
  const response = await f.update(cookie, { fulfilment_stage: 'customer_confirmed', payment_method: 'cod', delivery_charge_minor: 0, delivery_currency: 'USD', customerConfirmation: true })
  assert.equal(response.status, 422); assert((await response.json()).errors.customerConfirmation.includes('fixed captured price'))
  assert.equal((await f.update(cookie, { fulfilment_stage: 'unavailable', delivery_notes: 'Unable to source. Historical snapshots preserved.' })).status, 200)
})

test('payment receipt is independent and never inferred from stages or delivery; Wish Money is a manual choice only', async t => {
  const f = fixture(t), cookie = await f.login()
  assert.equal((await f.update(cookie, { payment_method: 'wish_money', payment_status: 'confirmed', paymentReceiptConfirmed: true })).status, 422)
  await f.confirm(cookie, 'wish_money')
  assert.equal((await f.update(cookie, { payment_status: 'confirmed' })).status, 422)
  assert.equal((await f.update(cookie, { payment_status: 'confirmed', paymentReceiptConfirmed: true })).status, 200)
  assert.equal((await f.update(cookie, { fulfilment_stage: 'cancelled', delivery_notes: 'Customer cancelled; handle any refund manually.' })).status, 200)
  assert.equal(f.record().payment_status, 'confirmed', 'cancellation must not silently erase received-payment record')
})

test('strict input limits/enums, extra price fields, unsupported delivery/payment methods and unsafe controls fail closed', async t => {
  const f = fixture(t), cookie = await f.login()
  for (const change of [{ total: 1 }, { supplier_cost: 10 }, { payment_method: ['cod'] }, { delivery_method: ['personal'] }, { payment_status: ['pending'] }, { payment_method: 'stripe' }, { delivery_method: 'external_api' }, { delivery_status: 'paid' }, { fulfilment_stage: 'accepted' }, { delivery_charge_minor: 1.5, delivery_currency: 'USD' }, { delivery_charge_minor: -1, delivery_currency: 'USD' }, { delivery_notes: 'x'.repeat(2001) }, { delivery_notes: 'bad\u0000' }, { delivery_company: 'Company\nInjected' }, { delivery_method: null, delivery_status: 'delivered' }, { delivery_company: 'Company' }, { delivery_currency: 'usd', delivery_charge_minor: 0 }]) assert.equal((await f.update(cookie, change)).status, 422, JSON.stringify(change))
  assert.equal((await f.call(undefined, cookie, 'PATCH', '{')).status, 400)
  assert.equal((await f.call(undefined, cookie, 'PATCH', 'x'.repeat(8193))).status, 400)
  assert.equal(f.record().version, 1)
})

test('optional third-party metadata stores safely and legacy review updates share optimistic version protection', async t => {
  const f = fixture(t), cookie = await f.login(), original = f.payload({ fulfilment_stage: 'supplier_check' })
  const response = await f.call('/' + f.id, cookie, 'PATCH', { status: 'reviewing', version: 1 }); assert.equal(response.status, 200)
  assert.equal((await f.call(undefined, cookie, 'PATCH', original)).status, 409)
  const update = { delivery_method: 'third_party', delivery_company: '<script>Safe text only</script>', tracking_reference: 'REF-1', delivery_notes: 'Private fixture address\r\nNo external messages.', delivery_status: 'preparing' }
  assert.equal((await f.update(cookie, update)).status, 200)
  assert.equal(f.record().delivery_company, update.delivery_company); assert(f.record().delivery_notes.includes('\n'))
  const detail = await (await f.call('/' + f.id, cookie, 'GET')).json(); assert.equal(detail.record.delivery_company, update.delivery_company)
  assert(!Object.hasOwn(detail.record, 'request_hash')); assert(!Object.hasOwn(detail.record, 'request_id'))
  const filtered = await (await f.call('?stage=new&status=reviewing', cookie, 'GET')).json(); assert.equal(filtered.records.length, 1)
  assert(!Object.hasOwn(filtered.records[0], 'delivery_notes'))
  assert.equal((await f.call('?stage=unknown', cookie, 'GET')).status, 400)
  assert.equal((await f.call('?stage=new&stage=completed', cookie, 'GET')).status, 400)
})

test('concurrent updates commit once, database failures are honest and immutable history guards stay active', async t => {
  const f = fixture(t), cookie = await f.login(), body = f.payload({ fulfilment_stage: 'supplier_check' })
  const responses = await Promise.all([f.call(undefined, cookie, 'PATCH', body), f.call(undefined, cookie, 'PATCH', body)])
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409])
  f.state.failure = ({ sql }) => { if (sql.startsWith('UPDATE store_order_requests SET fulfilment_stage')) throw Error('synthetic failure') }
  assert.equal((await f.update(cookie, { delivery_notes: 'not saved' })).status, 503); f.state.failure = null
  assert.equal(f.record().delivery_notes, '')
  for (const sql of ["UPDATE store_order_request_items SET listed_price_minor=1", "UPDATE store_order_request_items SET quantity=1", 'DELETE FROM store_order_request_items', 'DELETE FROM store_order_requests', "UPDATE store_order_requests SET note='altered'"]) assert.throws(() => f.sqlite.exec(sql), /STORE_REQUEST_IMMUTABLE/)
})
