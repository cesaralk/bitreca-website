import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import worker from '../worker/index.js'
import { handleStoreOrderRequest } from '../worker/store-order-requests.js'
import { emptyOrderContact, orderReplyLinks, validateOrderRequest } from '../shared/store-order-request.js'
import { contactDatabase } from './helpers/contact-d1.js'

const origin = 'https://store.test', migration = readFileSync(new URL('../migrations/0020_add_store_order_requests.sql', import.meta.url), 'utf8')
function fixture(t) {
  const f = contactDatabase(); t.after(() => f.close()); f.sqlite.exec(readFileSync(new URL('../migrations/0019_add_store_catalogue.sql', import.meta.url), 'utf8')); f.sqlite.exec(migration)
  const category = crypto.randomUUID(), products = ['fixture-one', 'fixture-two']
  f.sqlite.prepare('INSERT INTO store_categories(id,creation_hash,title,slug,status) VALUES(?,?,?,?,?)').run(category, 'a'.repeat(64), 'Synthetic category', 'fixture', 'published')
  for (const slug of products) f.sqlite.prepare('INSERT INTO store_products(id,creation_hash,category_id,title,sku,slug,description,status,price_minor,currency,price_note) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), 'b'.repeat(64), category, '<script>synthetic</script> ' + slug, slug.toUpperCase(), slug, 'Synthetic only', 'published', slug === products[0] ? 1234 : null, slug === products[0] ? 'USD' : null, slug === products[0] ? 'Synthetic listed price reference only' : '')
  const env = { bitreca_db: f.db, STORE_ORDER_REQUESTS_ENABLED: 'true', CONTACT_ALLOWED_ORIGINS: origin, CONTACT_TURNSTILE_SITE_KEY: 'synthetic-site-key', CONTACT_TURNSTILE_SECRET: 'synthetic-site-secret', CONTACT_RATE_LIMIT_SECRET: 'synthetic-rate-secret-at-least-thirty-two-characters', ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-password', SESSION_SECRET: 'synthetic-session-secret', ADMIN_AUTH_VERSION: '1' }
  const calls = []
  const verify = async (url, options) => { assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify'); assert.equal(options.redirect, 'manual'); assert(options.signal); calls.push(JSON.parse(options.body)); return Response.json({ success: true, hostname: 'store.test', action: 'store_order_request' }) }
  const input = changes => ({ ...emptyOrderContact(), name: ' Synthetic visitor ', email: 'qa@example.com', note: 'Plain <script>note</script>', manualReviewAck: true, items: [{ slug: products[0], quantity: 2 }, { slug: products[1], quantity: 1 }], requestId: crypto.randomUUID(), turnstileToken: 'synthetic-token', ...changes })
  const publicRequest = (data, headers = {}) => new Request(origin + '/api/store/order-requests', { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'application/json', ...headers }, body: typeof data === 'string' ? data : JSON.stringify(data) })
  const submit = (data = input(), fetcher = verify, headers = {}) => handleStoreOrderRequest(publicRequest(data, headers), env, fetcher)
  const admin = (path, cookie, method = 'GET', data, headers = {}) => worker.fetch(new Request(origin + '/api/admin/store/requests' + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(!['GET', 'HEAD'].includes(method) ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...headers }, ...(!['GET', 'HEAD'].includes(method) ? { body: JSON.stringify(data) } : {}) }), env)
  const counts = () => ({ headers: f.sqlite.prepare('SELECT COUNT(*) n FROM store_order_requests').get().n, items: f.sqlite.prepare('SELECT COUNT(*) n FROM store_order_request_items').get().n })
  async function login() { const r = await worker.fetch(new Request(origin + '/api/admin/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }) }), env); assert.equal(r.status, 200); return r.headers.get('Set-Cookie').split(';')[0] }
  return { ...f, env, category, products, calls, verify, input, publicRequest, submit, admin, counts, login }
}

test('0020 is additive/empty, preserves previous records, and provides no invented financial totals or methods', t => {
  const f = fixture(t)
  assert.deepEqual(f.counts(), { headers: 0, items: 0 })
  assert.equal(f.sqlite.prepare('SELECT marker FROM projects').get().marker, 'keep-project')
  assert.equal(f.sqlite.prepare('SELECT marker FROM portfolios').get().marker, 'keep-portfolio')
  assert.equal(f.sqlite.prepare('SELECT auth_version FROM admin_auth_state').get().auth_version, 1)
  assert(!/^\s*(?:ALTER|DROP|INSERT|DELETE)\s/im.test(migration.replace(/--[^\n]*/g, '')))
  const columns = f.sqlite.prepare('PRAGMA table_info(store_order_requests)').all().map(row => row.name)
  assert(!columns.some(name => /price|currency|delivery|payment|fee/.test(name)))
})

test('disabled/missing gate cannot be bypassed: actual route rejects before database/body/provider; config hides keys', async t => {
  const f = fixture(t)
  for (const gate of [undefined, 'false', 'TRUE', true]) {
    f.env.STORE_ORDER_REQUESTS_ENABLED = gate; const before = f.state.queries.length
    const r = await worker.fetch(f.publicRequest('{malformed'), f.env)
    assert.equal(r.status, 503); assert.equal((await r.json()).status, 'intake_disabled'); assert.equal(f.state.queries.length, before)
    const config = await handleStoreOrderRequest(new Request(origin + '/api/store/order-requests/config'), f.env)
    const body = await config.json(); assert.equal(body.enabled, false); assert.equal(body.siteKey, null)
  }
  assert.equal(f.calls.length, 0); assert.deepEqual(f.counts(), { headers: 0, items: 0 })
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM store_order_request_limits').get().n, 0)
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  assert.equal(config.vars.STORE_ORDER_REQUESTS_ENABLED, 'false')
})

test('strict contact/acknowledgement/quantity validation rejects client prices, totals, duplicates and overflow', () => {
  const base = { ...emptyOrderContact(), name: 'Synthetic', email: 'qa@example.com', manualReviewAck: true, items: [{ slug: 'fixture', quantity: 1 }] }
  assert.deepEqual(validateOrderRequest(base).errors, {})
  for (const change of [{ name: '' }, { email: 'a\r\nb@example.com' }, { manualReviewAck: false }, { note: 'a'.repeat(2001) }, { phone: '+96170123456' }, { whatsappConsent: true }, { total: 1 }, { price: 0 }, { website: 'bot' }, { items: [] }, { items: [{ slug: '../secret', quantity: 1 }] }, { items: [{ slug: 'fixture', quantity: 0 }] }, { items: [{ slug: 'fixture', quantity: 11 }] }, { items: [{ slug: 'fixture', quantity: 1.5 }] }, { items: [{ slug: 'fixture', quantity: 1, price: 0 }] }, { items: [{ slug: 'fixture', quantity: 1 }, { slug: 'fixture', quantity: 2 }] }, { items: Array.from({ length: 11 }, (_, n) => ({ slug: 'item-' + n, quantity: 1 })) }, { items: Array.from({ length: 6 }, (_, n) => ({ slug: 'item-' + n, quantity: 10 })) }]) assert(Object.keys(validateOrderRequest({ ...base, ...change }).errors).length, JSON.stringify(change))
})

test('server origin/body/config/Turnstile hostname/action/timeout failures never persist', async t => {
  for (const scenario of ['origin', 'json', 'size', 'type', 'secret', 'hostname', 'action', 'redirect', 'exception']) {
    const f = fixture(t); let r
    if (scenario === 'origin') r = await f.submit(f.input(), f.verify, { Origin: 'https://evil.test' })
    else if (scenario === 'json') r = await f.submit('{')
    else if (scenario === 'size') r = await f.submit(f.input(), f.verify, { 'Content-Length': '16385' })
    else if (scenario === 'type') r = await f.submit(f.input(), f.verify, { 'Content-Type': 'text/plain' })
    else if (scenario === 'secret') { delete f.env.CONTACT_TURNSTILE_SECRET; r = await f.submit() }
    else r = await f.submit(f.input(), async () => { if (scenario === 'exception') throw new DOMException('timeout', 'TimeoutError'); return Response.json({ success: true, hostname: scenario === 'hostname' ? 'evil.test' : 'store.test', action: scenario === 'action' ? 'contact_enquiry' : 'store_order_request' }, { status: scenario === 'redirect' ? 302 : 200 }) })
    assert(r.status >= 400, scenario); assert.deepEqual(f.counts(), { headers: 0, items: 0 })
  }
})

test('atomic snapshots come only from eligible server catalogue; receipt promises review only', async t => {
  const f = fixture(t), r = await f.submit()
  assert.equal(r.status, 201); assert.equal(r.headers.get('Cache-Control'), 'private, no-store')
  const body = await r.json(); assert.equal(body.status, 'stored_for_review'); assert.deepEqual(Object.keys(body).sort(), ['reference', 'status'])
  assert.deepEqual(f.counts(), { headers: 1, items: 2 })
  const header = f.sqlite.prepare('SELECT * FROM store_order_requests').get(); assert.equal(header.committed, 1); assert.equal(header.name, 'Synthetic visitor'); assert.equal(header.status, 'new'); assert.equal(header.total_quantity, 3)
  const items = f.sqlite.prepare('SELECT * FROM store_order_request_items ORDER BY slug').all(); assert.equal(items[0].listed_price_minor, 1234); assert.equal(items[0].listed_currency, 'USD'); assert.equal(items[1].listed_price_minor, null); assert.equal(items[1].listed_currency, null); assert.equal(items[0].quantity, 2)
  assert(!JSON.stringify(body).includes('qa@example.com')); assert.equal(f.calls.length, 1)
})

test('publication/category/availability changes during verification roll back header and every snapshot', async t => {
  for (const change of ['draft', 'archived', 'category', 'availability', 'missing']) {
    const f = fixture(t), input = f.input()
    const r = await f.submit(input, async () => {
      if (change === 'category') { f.sqlite.prepare("UPDATE store_products SET status='draft' WHERE category_id=?").run(f.category); f.sqlite.prepare("UPDATE store_categories SET status='draft' WHERE id=?").run(f.category) }
      else if (change === 'availability') f.sqlite.prepare("UPDATE store_products SET availability='unavailable',availability_checked_at='2026-01-01' WHERE slug=?").run(f.products[1])
      else if (change === 'missing') input.items[1].slug = 'missing' // request already parsed: publication change still needed below
      else f.sqlite.prepare('UPDATE store_products SET status=? WHERE slug=?').run(change, f.products[1])
      if (change === 'missing') f.sqlite.prepare("UPDATE store_products SET slug='renamed-item' WHERE slug=?").run(f.products[1])
      return Response.json({ success: true, hostname: 'store.test', action: 'store_order_request' })
    })
    assert.equal(r.status, 409, change); assert.equal((await r.json()).status, 'catalogue_changed'); assert.deepEqual(f.counts(), { headers: 0, items: 0 })
  }
})

test('price changes capture current server values without inventing a total; immutable rows cannot be edited/deleted', async t => {
  const f = fixture(t), r = await f.submit(f.input(), async () => { f.sqlite.prepare("UPDATE store_products SET price_minor=9876 WHERE slug=?").run(f.products[0]); return Response.json({ success: true, hostname: 'store.test', action: 'store_order_request' }) })
  assert.equal(r.status, 201); assert.equal(f.sqlite.prepare('SELECT listed_price_minor FROM store_order_request_items WHERE slug=?').get(f.products[0]).listed_price_minor, 9876)
  for (const sql of ["UPDATE store_order_request_items SET quantity=9", 'DELETE FROM store_order_request_items', "UPDATE store_order_requests SET name='Changed'", 'DELETE FROM store_order_requests', 'UPDATE store_order_requests SET committed=0']) assert.throws(() => f.sqlite.exec(sql), /STORE_REQUEST_IMMUTABLE/)
})

test('launch gate closing during verification still prevents persistence', async t => {
  const f = fixture(t)
  const response = await f.submit(f.input(), async () => { f.env.STORE_ORDER_REQUESTS_ENABLED = 'false'; return Response.json({ success: true, hostname: 'store.test', action: 'store_order_request' }) })
  assert.equal(response.status, 503); assert.equal((await response.json()).status, 'intake_disabled'); assert.deepEqual(f.counts(), { headers: 0, items: 0 })
})

test('same canonical request replays, changed content conflicts and concurrent requests create one snapshot set', async t => {
  const f = fixture(t), input = f.input()
  const results = await Promise.all([f.submit(input), f.submit(input)]); assert.deepEqual(results.map(r => r.status).sort(), [200, 201])
  const id = (await results[0].json()).reference
  assert.equal((await f.submit({ ...input, items: [...input.items].reverse() })).status, 200)
  const changed = await f.submit({ ...input, note: 'Changed note' }); assert.equal(changed.status, 409)
  assert.deepEqual(f.counts(), { headers: 1, items: 2 }); assert.equal(f.sqlite.prepare('SELECT id FROM store_order_requests').get().id, id)
})

test('database failure rolls back atomically; lost commit acknowledgement recovers without another challenge or duplicate', async t => {
  const f = fixture(t), input = f.input()
  f.state.failure = ({ sql, phase }) => { if (sql.startsWith('INSERT INTO store_order_request_items') && phase === 'after') throw Error('synthetic failure') }
  assert.equal((await f.submit(input)).status, 503); assert.deepEqual(f.counts(), { headers: 0, items: 0 }); f.state.failure = null
  const batch = f.db.batch.bind(f.db); let lost = true
  f.db.batch = async statements => { const results = await batch(statements); if (lost && statements[0].sql.startsWith('INSERT INTO store_order_requests')) { lost = false; throw Error('synthetic lost ack') } return results }
  assert.equal((await f.submit(input)).status, 503); assert.deepEqual(f.counts(), { headers: 1, items: 2 })
  const calls = f.calls.length
  assert.equal((await f.submit(input, async () => { throw Error('must not need provider for exact receipt') })).status, 200); assert.equal(f.calls.length, calls); assert.deepEqual(f.counts(), { headers: 1, items: 2 })
})

test('purpose-separated persistent attempt limits stop abuse and never store raw IPs or touch Contact counters', async t => {
  const f = fixture(t)
  for (let n = 0; n < 5; n++) assert.equal((await f.submit()).status, 201)
  const denied = await f.submit(); assert.equal(denied.status, 429); assert.equal(denied.headers.get('Retry-After'), '600')
  assert.equal(f.counts().headers, 5); assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM contact_enquiry_limits').get().n, 0)
  assert(!JSON.stringify(f.sqlite.prepare('SELECT * FROM store_order_request_limits').all()).includes('192.0.2.1'))
  const g = fixture(t); g.sqlite.prepare("INSERT INTO store_order_request_limits(key,hits,expires_at) VALUES('day:' || CAST(unixepoch()/86400 AS INTEGER),200,unixepoch()+86400)").run()
  assert.equal((await g.submit()).status, 429); assert.equal(g.sqlite.prepare("SELECT COUNT(*) n FROM store_order_request_limits WHERE key LIKE 'ip:%'").get().n, 0)
})

test('new admin routes deny anonymous/forged/expired/revoked sessions and public UUID enumeration', async t => {
  const f = fixture(t), r = await f.submit(), id = (await r.json()).reference
  for (const path of ['', '/' + id]) { assert.equal((await f.admin(path)).status, 401); assert.equal((await f.admin(path, '__Host-bitreca_admin_session=v2.' + 'a'.repeat(64))).status, 401) }
  const cookie = await f.login(); f.state.now += 9 * 3600; assert.equal((await f.admin('', cookie)).status, 401); f.state.now -= 9 * 3600; f.sqlite.exec('DELETE FROM admin_sessions'); assert.equal((await f.admin('/' + id, cookie)).status, 401)
  assert.equal((await worker.fetch(new Request(origin + '/api/store/order-requests'), f.env)).status, 405)
  assert.equal((await worker.fetch(new Request(origin + '/api/store/order-requests/' + id), f.env)).status, 404)
})

test('authenticated details/manual replies and controlled status/version changes work with public gate disabled', async t => {
  const f = fixture(t), r = await f.submit(f.input({ phone: '+96170123456', whatsappConsent: true })), id = (await r.json()).reference, cookie = await f.login()
  f.env.STORE_ORDER_REQUESTS_ENABLED = 'false'
  const list = await f.admin('', cookie); assert.equal(list.headers.get('Cache-Control'), 'private, no-store'); const records = (await list.json()).records; assert.equal(records.length, 1); assert(!Object.hasOwn(records[0], 'email'))
  const detail = await (await f.admin('/' + id, cookie)).json(); assert.equal(detail.items.length, 2); assert(!Object.hasOwn(detail.record, 'request_hash')); assert(!Object.hasOwn(detail.record, 'request_id'))
  const links = orderReplyLinks(detail.record); assert(links.email.startsWith('mailto:qa%40example.com')); assert(links.whatsapp.startsWith('https://wa.me/96170123456')); assert.equal(orderReplyLinks({ ...detail.record, whatsapp_consent: 0 }).whatsapp, '')
  assert.equal((await f.admin('/' + id, cookie, 'PATCH', { status: 'closed', version: 1 })).status, 422)
  assert.equal((await f.admin('/' + id, cookie, 'PATCH', { status: 'reviewing', version: 1 }, { Origin: 'https://evil.test' })).status, 403)
  assert.equal((await f.admin('/' + id, cookie, 'PATCH', { status: 'reviewing', version: 1 })).status, 200)
  assert.equal((await f.admin('/' + id, cookie, 'PATCH', { status: 'awaiting_customer', version: 1 })).status, 409)
  assert.equal((await f.admin('/' + id, cookie, 'PATCH', { status: 'paid', version: 2 })).status, 400)
  assert.equal((await f.admin('/' + id, cookie, 'PATCH', { status: 'awaiting_customer', version: 2 })).status, 200)
  assert.equal((await f.admin('/' + id, cookie, 'DELETE')).status, 405)
})

test('admin list is bounded/paginated/filterable and malformed cursors/updates are rejected', async t => {
  const f = fixture(t), cookie = await f.login()
  for (let n = 0; n < 25; n++) {
    const id = crypto.randomUUID(); f.sqlite.prepare('INSERT INTO store_order_requests(id,request_id,request_hash,name,email,manual_review_ack,line_count,total_quantity) VALUES(?,?,?,?,?,1,1,1)').run(id, crypto.randomUUID(), 'a'.repeat(64), 'Synthetic fixture ' + n, 'qa@example.com')
    f.sqlite.prepare("INSERT INTO store_order_request_items(id,request_ref,product_id,slug,sku,title,category_title,quantity,listed_price_note,listed_availability) VALUES(?,?,?,?,?,?,?,1,'','unknown')").run(crypto.randomUUID(), id, crypto.randomUUID(), 'fixture', 'FIXTURE', 'Synthetic fixture', 'Fixture')
    f.sqlite.prepare('UPDATE store_order_requests SET committed=1 WHERE id=?').run(id)
  }
  const first = await (await f.admin('?status=new', cookie)).json(); assert.equal(first.records.length, 20)
  const second = await (await f.admin('?cursor=' + first.nextCursor, cookie)).json(); assert.equal(second.records.length, 5); assert.equal(second.nextCursor, null)
  assert.equal((await f.admin('?status=paid', cookie)).status, 400); assert.equal((await f.admin('?cursor=invalid', cookie)).status, 400); assert.equal((await f.admin('?status=new&status=closed', cookie)).status, 400)
})
