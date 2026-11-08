import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import worker from '../worker/index.js'
import { contactDatabase } from './helpers/contact-d1.js'

const migration = readFileSync(new URL('../migrations/0021_store_product_permanent_deletion.sql', import.meta.url), 'utf8')
function fixture(t, migrate = true) {
  const f = contactDatabase(); t.after(() => f.close()); f.sqlite.exec('PRAGMA foreign_keys=ON')
  for (const name of ['0019_add_store_catalogue.sql', '0020_add_store_order_requests.sql']) f.sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'))
  const category = crypto.randomUUID(), image = `store-catalogue/${crypto.randomUUID()}.png`, id = crypto.randomUUID(), requestId = crypto.randomUUID()
  f.sqlite.prepare("INSERT INTO store_categories(id,creation_hash,title,slug,status) VALUES(?,?,'Fixture category','fixture','published')").run(category, 'a'.repeat(64))
  function product(productId = crypto.randomUUID(), key = image) {
    f.sqlite.prepare("INSERT INTO store_products(id,creation_hash,category_id,sku,slug,title,description,image_key,status) VALUES(?,?,?, ?,?,'Fixture product','Synthetic only',?,'published')").run(productId, 'a'.repeat(64), category, 'FIXTURE-' + productId, 'fixture-' + productId, key)
    return productId
  }
  product(id)
  f.sqlite.prepare("INSERT INTO store_order_requests(id,request_id,request_hash,name,email,manual_review_ack,line_count,total_quantity) VALUES(?,?,?,'Synthetic contact','fixture@example.com',1,1,2)").run(requestId, crypto.randomUUID(), 'a'.repeat(64))
  f.sqlite.prepare("INSERT INTO store_order_request_items(id,request_ref,product_id,slug,sku,title,category_title,quantity,listed_price_minor,listed_currency,listed_price_note,listed_availability) VALUES(?,?,?,'snapshot-slug','SNAPSHOT','Snapshot title','Snapshot category',2,1234,'USD','Synthetic only','unknown')").run(crypto.randomUUID(), requestId, id)
  f.sqlite.prepare('UPDATE store_order_requests SET committed=1 WHERE id=?').run(requestId)
  const before = { headers: JSON.stringify(f.sqlite.prepare('SELECT * FROM store_order_requests').all()), items: JSON.stringify(f.sqlite.prepare('SELECT * FROM store_order_request_items').all()) }
  function apply() { f.sqlite.exec('BEGIN;\n' + migration + '\nCOMMIT;') }
  if (migrate) apply()
  const objects = new Map([[image, new Uint8Array([1, 2, 3])]]), state = { deleteFails: false, headFails: false, afterDelete: null, deletes: [] }
  const env = { bitreca_db: f.db, bitreca_media: { head: async key => { if (state.headFails) throw Error('private failure'); return objects.has(key) ? {} : null }, delete: async key => { state.deletes.push(key); if (state.deleteFails) throw Error('private failure'); objects.delete(key); await state.afterDelete?.() } }, ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-password', SESSION_SECRET: 'synthetic-session', ADMIN_AUTH_VERSION: '1' }
  const confirmation = productId => { const p = f.sqlite.prepare('SELECT title,sku,version FROM store_products WHERE id=?').get(productId); return { ...p, confirmed: true } }
  async function call(path, method = 'GET', body, cookie, headers = {}) { return worker.fetch(new Request('https://store.test' + path, { method, headers: { Origin: 'https://store.test', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(!['GET', 'HEAD'].includes(method) ? { body: JSON.stringify(body) } : {}) }), env) }
  async function login() { const r = await call('/api/admin/login', 'POST', { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }); assert.equal(r.status, 200); return r.headers.get('Set-Cookie').split(';')[0] }
  return { ...f, id, image, requestId, before, apply, objects, cleanup: state, env, product, confirmation, call, login, remove: (body, cookie, productId = id, headers) => call('/api/admin/store/products/' + productId, 'DELETE', body, cookie, headers) }
}

test('migration preserves populated requests/snapshots; deleting a referenced product detaches only its live link', async t => {
  const f = fixture(t, false); f.apply()
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM store_order_requests').all()), f.before.headers)
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM store_order_request_items').all()), f.before.items)
  assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0)
  const cookie = await f.login(), response = await f.remove(f.confirmation(f.id), cookie)
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.status, 'deleted'); assert.equal(body.cleanup_complete, true)
  assert.equal(f.sqlite.prepare('SELECT * FROM store_products WHERE id=?').get(f.id), undefined)
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM store_order_requests').all()), f.before.headers)
  const after = f.sqlite.prepare('SELECT * FROM store_order_request_items').all(), prior = JSON.parse(f.before.items); assert.equal(after[0].product_id, null); prior[0].product_id = null; assert.deepEqual(JSON.parse(JSON.stringify(after)), prior)
  assert.equal(f.objects.has(f.image), false); assert.equal((await f.call('/api/admin/store/products/' + f.id, 'GET', undefined, cookie)).status, 404)
  assert.equal(f.sqlite.prepare('SELECT marker FROM projects').get().marker, 'keep-project'); assert.equal(f.sqlite.prepare('SELECT marker FROM portfolios').get().marker, 'keep-portfolio')
  for (const sql of ["UPDATE store_order_request_items SET title='changed'", 'DELETE FROM store_order_request_items', 'DELETE FROM store_order_requests', "UPDATE store_order_requests SET name='changed'"]) assert.throws(() => f.sqlite.exec(sql), /STORE_REQUEST_IMMUTABLE/)
})

test('authentication, origin, exact saved confirmation/version and bounded payload protect permanent deletion', async t => {
  const f = fixture(t), body = f.confirmation(f.id)
  assert.equal((await f.remove(body)).status, 401)
  assert.equal((await f.call('/api/admin/store/product-deletions')).status, 401)
  const cookie = await f.login()
  assert.equal((await f.remove(body, cookie, f.id, { Origin: 'https://evil.test' })).status, 403)
  for (const changes of [{ confirmed: false }, { unexpected: true }, { version: 0 }]) assert.equal((await f.remove({ ...body, ...changes }, cookie)).status, 400)
  for (const changes of [{ title: 'Other title' }, { sku: body.sku.toLowerCase() }, { version: 2 }]) assert.equal((await f.remove({ ...body, ...changes }, cookie)).status, 409)
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM store_products').get().n, 1); assert.deepEqual(f.cleanup.deletes, [])
  assert.throws(() => f.sqlite.exec('UPDATE store_order_request_items SET product_id=NULL'), /STORE_REQUEST_IMMUTABLE/)
})

test('shared images survive until the final owner is deleted; arbitrary namespaces are never removed', async t => {
  const f = fixture(t), other = f.product(), cookie = await f.login()
  const first = await (await f.remove(f.confirmation(f.id), cookie)).json(); assert.equal(first.receipt.state, 'retained_shared'); assert(f.objects.has(f.image)); assert.equal(f.cleanup.deletes.length, 0)
  assert.equal((await f.remove(f.confirmation(other), cookie, other)).status, 200); assert(!f.objects.has(f.image))
  const external = f.product(undefined, 'projects/unrelated.png'); f.objects.set('projects/unrelated.png', new Uint8Array([9]))
  const blocked = await f.remove(f.confirmation(external), cookie, external); assert.equal(blocked.status, 202); assert.equal((await blocked.json()).cleanup_complete, false); assert(f.objects.has('projects/unrelated.png')); assert(!f.cleanup.deletes.includes('projects/unrelated.png'))
})

test('R2 failure leaves a durable pending task after physical deletion; retry confirms cleanup without false success', async t => {
  const f = fixture(t), body = f.confirmation(f.id), cookie = await f.login(); f.cleanup.deleteFails = true
  const response = await f.remove(body, cookie); assert.equal(response.status, 202); const partial = await response.json(); assert.equal(partial.success, false); assert.equal(partial.product_deleted, true); assert.equal(partial.cleanup_complete, false); assert(!JSON.stringify(partial).includes('private failure'))
  assert.equal(f.sqlite.prepare('SELECT id FROM store_products WHERE id=?').get(f.id), undefined); assert(f.objects.has(f.image))
  const pending = await (await f.call('/api/admin/store/product-deletions', 'GET', undefined, cookie)).json(); assert.equal(pending.records[0].id, f.id)
  f.cleanup.deleteFails = false; assert.equal((await f.remove(body, cookie)).status, 200)
  assert.equal((await (await f.call('/api/admin/store/product-deletions', 'GET', undefined, cookie)).json()).records.length, 0)
  assert.equal((await f.remove(body, cookie)).status, 200); assert.equal(f.cleanup.deletes.length, 2)
})

test('D1 failure and lost acknowledgement are honest and recoverable; cleanup fences late image references and ID resurrection', async t => {
  const f = fixture(t), body = f.confirmation(f.id), cookie = await f.login()
  f.state.failure = ({ sql, phase }) => { if (sql.startsWith('DELETE FROM store_products') && phase === 'before') throw Error('private D1 failure') }
  assert.equal((await f.remove(body, cookie)).status, 503); assert(f.objects.has(f.image)); assert(f.sqlite.prepare('SELECT id FROM store_products WHERE id=?').get(f.id))
  f.state.failure = ({ sql, phase }) => { if (sql.startsWith('DELETE FROM store_products') && phase === 'after') throw Error('private ack loss') }
  assert.equal((await f.remove(body, cookie)).status, 503); assert.equal(f.sqlite.prepare('SELECT id FROM store_products WHERE id=?').get(f.id), undefined); assert(f.objects.has(f.image))
  f.state.failure = null
  f.cleanup.afterDelete = () => { assert.throws(() => f.product(), /STORE_IMAGE_DELETING/) }
  assert.equal((await f.remove(body, cookie)).status, 200)
  assert.throws(() => f.product(f.id, null), /STORE_PRODUCT_DELETED/)
  assert.throws(() => f.product(), /STORE_IMAGE_DELETING/)
  assert.equal((await f.remove({ ...body, sku: 'changed' }, cookie)).status, 409)
})

test('concurrent confirmed deletions are idempotent; head failure cannot report complete cleanup', async t => {
  const f = fixture(t), body = f.confirmation(f.id), cookie = await f.login(); f.cleanup.headFails = true
  const responses = await Promise.all([f.remove(body, cookie), f.remove(body, cookie)])
  assert(responses.every(r => r.status === 202)); assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM store_product_deletions').get().n, 1)
  f.cleanup.headFails = false; assert.equal((await f.remove(body, cookie)).status, 200)
  assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0)
})
