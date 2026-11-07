import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import worker from '../worker/index.js'
import { contactDatabase } from './helpers/contact-d1.js'
import { emptyCategory, emptyProduct, validateStoreRecord } from '../shared/store-catalogue.js'

const origin = 'https://store.test', sql = readFileSync(new URL('../migrations/0019_add_store_catalogue.sql', import.meta.url), 'utf8')
const category = (changes = {}) => ({ ...emptyCategory(), title: 'Synthetic fixture category', slug: 'fixture-category', ...changes })
const product = (categoryId, changes = {}) => ({ ...emptyProduct(), title: 'Synthetic fixture product', slug: 'fixture-product', sku: 'QA-1', category_id: categoryId, ...changes })
function fixture(t) {
  const f = contactDatabase(); t.after(() => f.close()); f.sqlite.exec(sql)
  const objects = new Map()
  const env = { bitreca_db: f.db, ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-pass', SESSION_SECRET: 'synthetic-store-test-secret', ADMIN_AUTH_VERSION: '1', bitreca_media: {
    put: async (key, bytes, options) => { objects.set(key, { bytes, options }) },
    head: async key => objects.has(key) ? {} : null,
    get: async key => objects.has(key) ? { body: objects.get(key).bytes } : null,
  } }
  async function call(path, { method = 'GET', data, cookie, headers = {}, raw } = {}) {
    return worker.fetch(new Request(origin + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(!['GET', 'HEAD'].includes(method) ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...headers }, ...(!['GET', 'HEAD'].includes(method) ? { body: raw ?? JSON.stringify(data) } : {}) }), env)
  }
  async function login() { const r = await call('/api/admin/login', { method: 'POST', data: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD } }); assert.equal(r.status, 200); return r.headers.get('Set-Cookie').split(';')[0] }
  return { ...f, env, objects, call, login }
}
async function create(f, cookie, kind, data, id = crypto.randomUUID()) {
  const response = await f.call(`/api/admin/store/${kind}`, { method: 'POST', cookie, data: { id, data } })
  return { response, body: await response.json(), id }
}
async function edit(f, cookie, kind, id, data, version = 1) {
  return f.call(`/api/admin/store/${kind}/${id}`, { method: 'PUT', cookie, data: { id, version, data } })
}
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

test('0019 adds only empty Store schema and preserves existing records/auth; uniqueness and FK enforced', t => {
  const f = fixture(t)
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM store_categories').get().n, 0)
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM store_products').get().n, 0)
  assert.equal(f.sqlite.prepare('SELECT marker FROM projects').get().marker, 'keep-project')
  assert.equal(f.sqlite.prepare('SELECT marker FROM portfolios').get().marker, 'keep-portfolio')
  assert.equal(f.sqlite.prepare('SELECT auth_version FROM admin_auth_state').get().auth_version, 1)
  assert(!/^\s*(?:DROP|ALTER|DELETE|INSERT)\s/im.test(sql.replace(/--[^\n]*/g, '')))
  f.sqlite.exec('PRAGMA foreign_keys=ON')
  assert.throws(() => f.sqlite.prepare("INSERT INTO store_products(id,creation_hash,category_id,sku,slug,title) VALUES (?,?,?,?,?,?)").run(crypto.randomUUID(), 'a'.repeat(64), crypto.randomUUID(), 'Q', 'q', 'Q'))
})

test('strict validation bounds, safe slugs/SKUs/dates, explicit optional currency and owner publish requirements', () => {
  const id = crypto.randomUUID()
  assert.deepEqual(validateStoreRecord('products', product(id)).errors, {})
  for (const changes of [{ title: '' }, { sku: 'a\r\nheader' }, { slug: '../private' }, { description: 'a'.repeat(5001) }, { specifications: 'a'.repeat(12001) }, { status: 'paid' }, { category_id: 'no' }, { image_key: 'projects/anything.png' }, { price_minor: 10 }, { price_minor: 1.5, currency: 'USD' }, { price_minor: -1, currency: 'USD' }, { availability: 'available' }, { availability_checked_at: '2026-02-30' }, { availability_checked_at: '2999-01-01' }, { supplier_password: 'unknown field' }, { status: 'published' }]) {
    assert(Object.keys(validateStoreRecord('products', product(id, changes)).errors).length, JSON.stringify(changes))
  }
  assert.equal(validateStoreRecord('products', product(id, { sku: 'lower-case' })).data.sku, 'LOWER-CASE')
  assert.deepEqual(validateStoreRecord('categories', category({ title: '<script>literal</script>' })).errors, {})
})

test('actual Worker gate rejects anonymous/forged/expired/revoked sessions and cross-origin mutations', async t => {
  const f = fixture(t), id = crypto.randomUUID()
  for (const path of ['/api/admin/store/categories', '/api/admin/store/products', `/api/admin/store/products/${id}`, '/api/admin/store/media/' + id + '.png']) {
    assert.equal((await f.call(path)).status, 401)
    assert.equal((await f.call(path, { cookie: '__Host-bitreca_admin_session=v2.' + 'a'.repeat(64) })).status, 401)
  }
  const cookie = await f.login()
  assert.equal((await f.call('/api/admin/store/categories', { cookie, method: 'POST', headers: { Origin: 'https://evil.test' }, data: {} })).status, 403)
  f.state.now += 9 * 3600
  assert.equal((await f.call('/api/admin/store/categories', { cookie })).status, 401)
  f.state.now -= 9 * 3600
  f.sqlite.exec('DELETE FROM admin_sessions')
  assert.equal((await f.call('/api/admin/store/products', { cookie })).status, 401)
})

test('category create/retry/conflict/unique identifiers and private literal details; archive instead of delete', async t => {
  const f = fixture(t), cookie = await f.login(), data = category({ title: '<script>literal only</script>' }), id = crypto.randomUUID()
  assert.equal((await create(f, cookie, 'categories', data, id)).response.status, 201)
  assert.equal((await create(f, cookie, 'categories', data, id)).response.status, 200)
  assert.equal((await create(f, cookie, 'categories', category({ title: 'Changed' }), id)).response.status, 409)
  assert.equal((await create(f, cookie, 'categories', data)).response.status, 409)
  const detail = await f.call('/api/admin/store/categories/' + id, { cookie })
  assert.equal(detail.headers.get('Cache-Control'), 'private, no-store')
  const row = (await detail.json()).record
  assert.equal(row.title, data.title); assert(!Object.hasOwn(row, 'creation_hash'))
  assert.equal((await edit(f, cookie, 'categories', id, { ...data, status: 'archived' })).status, 200)
  assert.equal((await f.call('/api/admin/store/categories/' + id, { method: 'DELETE', cookie })).status, 405)
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM store_categories').get().n, 1)
})

test('product lifecycle, category guards, private source/notes and optimistic edit conflicts', async t => {
  const f = fixture(t), cookie = await f.login(), c = await create(f, cookie, 'categories', category()), p = product(c.id, { source_reference: 'private-supplier', internal_notes: 'private-note' })
  const created = await create(f, cookie, 'products', p)
  assert.equal(created.response.status, 201)
  const lists = (await (await f.call('/api/admin/store/products', { cookie })).json()).records
  assert(!JSON.stringify(lists).includes('private-supplier')); assert(!Object.hasOwn(lists[0], 'internal_notes'))
  const detail = (await (await f.call('/api/admin/store/products/' + created.id, { cookie })).json()).record
  assert.equal(detail.source_reference, 'private-supplier'); assert.equal(detail.internal_notes, 'private-note')
  const key = `store-catalogue/${crypto.randomUUID()}.png`; f.objects.set(key, { bytes: png })
  const published = { ...p, status: 'published', description: 'Owner-approved fixture description', image_key: key }
  assert.equal((await edit(f, cookie, 'products', created.id, published)).status, 409)
  assert.equal((await edit(f, cookie, 'categories', c.id, category({ status: 'published' }))).status, 200)
  assert.equal((await edit(f, cookie, 'products', created.id, published)).status, 200)
  assert.equal((await edit(f, cookie, 'categories', c.id, category(), 2)).status, 409)
  const updates = await Promise.all([edit(f, cookie, 'products', created.id, { ...p, title: 'Change one' }, 2), edit(f, cookie, 'products', created.id, { ...p, title: 'Change two' }, 2)])
  assert.deepEqual(updates.map(r => r.status).sort(), [200, 409])
  assert.equal((await edit(f, cookie, 'categories', c.id, category({ status: 'archived' }), 2)).status, 409)
  assert.equal((await edit(f, cookie, 'products', created.id, { ...p, status: 'archived' }, 3)).status, 200)
  assert.equal((await edit(f, cookie, 'categories', c.id, category({ status: 'archived' }), 2)).status, 200)
  assert.equal((await edit(f, cookie, 'products', created.id, p, 4)).status, 409)
})

test('published records and private Store images have no public API or legacy media escape', async t => {
  const f = fixture(t), cookie = await f.login(), c = await create(f, cookie, 'categories', category({ status: 'published' }))
  assert.equal(c.response.status, 201)
  for (const path of ['/api/store/categories', '/api/store/products', '/api/products', '/api/store/products/' + c.id, '/api/media/store-catalogue/' + c.id + '.png', '/api/media/store-catalogue%2f' + c.id + '.png']) assert.equal((await f.call(path)).status, 404)
  assert.equal((await f.call('/api/admin/store/categories/' + c.id)).status, 401)
})

test('private image upload enforces limits/signatures and reuses only Store R2 namespace', async t => {
  const f = fixture(t), cookie = await f.login()
  const upload = options => f.call('/api/admin/store/media', { method: 'POST', cookie, headers: { 'Content-Type': 'image/png', ...options?.headers }, raw: options?.bytes || png })
  assert.equal((await upload({ headers: { 'Content-Type': 'image/svg+xml' } })).status, 415)
  assert.equal((await upload({ bytes: new Uint8Array([1, 2]) })).status, 400)
  assert.equal((await upload({ headers: { 'Content-Length': String(2 * 1024 * 1024 + 1) } })).status, 413)
  const r = await upload(); assert.equal(r.status, 201)
  const key = (await r.json()).image_key; assert(key.startsWith('store-catalogue/')); assert.equal(f.objects.size, 1)
  const privateRead = await f.call('/api/admin/store/media/' + key.split('/')[1], { cookie })
  assert.equal(privateRead.status, 200); assert.equal(privateRead.headers.get('Cache-Control'), 'private, no-store')
  assert.equal((await f.call('/api/media/' + key)).status, 404)
  assert.equal((await f.call('/api/admin/store/media/' + key.split('/')[1])).status, 401)
})

test('bounded pagination/status/category filters and invalid query/body/method handling', async t => {
  const f = fixture(t), cookie = await f.login()
  for (let n = 0; n < 25; n++) assert.equal((await create(f, cookie, 'categories', category({ slug: `fixture-${n}` }))).response.status, 201)
  const first = await (await f.call('/api/admin/store/categories?status=draft', { cookie })).json()
  assert.equal(first.records.length, 20); assert(first.nextCursor)
  const second = await (await f.call('/api/admin/store/categories?cursor=' + first.nextCursor, { cookie })).json()
  assert.equal(second.records.length, 5); assert.equal(second.nextCursor, null)
  assert.equal(new Set([...first.records, ...second.records].map(row => row.id)).size, 25)
  for (const query of ['status=paid', 'status=draft&status=published', 'cursor=invalid', 'search=anything']) assert.equal((await f.call('/api/admin/store/categories?' + query, { cookie })).status, 400)
  assert.equal((await f.call('/api/admin/store/products?category_id=bad', { cookie })).status, 400)
  assert.equal((await f.call('/api/admin/store/products?category_id=' + first.records[0].id, { cookie })).status, 200)
  assert.equal((await f.call('/api/admin/store/products', { method: 'POST', cookie, raw: '{' })).status, 400)
  assert.equal((await f.call('/api/admin/store/products', { method: 'POST', cookie, headers: { 'Content-Length': '49153' }, data: {} })).status, 413)
  assert.equal((await f.call('/api/admin/store/products', { method: 'POST', cookie, headers: { 'Content-Type': 'text/plain' }, data: {} })).status, 415)
  assert.equal((await f.call('/api/admin/store/products', { method: 'POST', cookie, data: { id: crypto.randomUUID(), data: {} } })).status, 422)
  assert.equal((await f.call('/api/admin/store/products', { method: 'PATCH', cookie, data: {} })).status, 405)
})

test('concurrent creates, lost acknowledgements and D1 failure never duplicate or falsely confirm', async t => {
  const f = fixture(t), cookie = await f.login(), id = crypto.randomUUID(), data = category()
  const concurrent = await Promise.all([create(f, cookie, 'categories', data, id), create(f, cookie, 'categories', data, id)])
  assert.deepEqual(concurrent.map(r => r.response.status).sort(), [200, 201])
  const lostId = crypto.randomUUID(), lostData = category({ slug: 'lost-ack' })
  f.state.failure = ({ sql: query, phase }) => { if (query.startsWith('INSERT INTO store_categories') && phase === 'after') throw Error('synthetic ack loss') }
  assert.equal((await create(f, cookie, 'categories', lostData, lostId)).response.status, 503)
  f.state.failure = null
  assert.equal((await create(f, cookie, 'categories', lostData, lostId)).response.status, 200)
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM store_categories').get().n, 2)
  f.state.failure = ({ sql: query }) => { if (query.includes('FROM store_products')) throw Error('synthetic read failure') }
  const failed = await f.call('/api/admin/store/products', { cookie }); assert.equal(failed.status, 503); assert(!JSON.stringify(await failed.json()).includes('synthetic'))
})
