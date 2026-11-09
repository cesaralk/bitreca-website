import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { fulfilmentDraft } from '../shared/store-fulfilment.js'

const statements = name => readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8').replace(/--[^\n]*/g, '').match(/CREATE TRIGGER[\s\S]*?END;|(?:CREATE|DROP|ALTER|INSERT|PRAGMA)[\s\S]*?;/g)

test('actual workerd/D1: additive fulfilment migration, fixed-price agreement, manual payment and detached historical snapshots', async t => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../worker/index.js', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'esm' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-23', d1Databases: ['bitreca_db'], bindings: { ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-password', SESSION_SECRET: 'synthetic-session', ADMIN_AUTH_VERSION: '1' } }))
  t.after(() => mf.dispose())
  const db = await mf.getD1Database('bitreca_db')
  for (const name of ['0004_create_admin_sessions.sql', '0019_add_store_catalogue.sql', '0020_add_store_order_requests.sql', '0021_store_product_permanent_deletion.sql']) await db.batch(statements(name).map(sql => db.prepare(sql)))
  const category = crypto.randomUUID(), product = crypto.randomUUID(), id = crypto.randomUUID()
  await db.prepare("INSERT INTO store_categories(id,creation_hash,title,slug,status) VALUES(?,?,'Runtime fixture','runtime','published')").bind(category, 'a'.repeat(64)).run()
  await db.prepare("INSERT INTO store_products(id,creation_hash,category_id,title,sku,slug,status,price_minor,currency) VALUES(?,?,?,'Runtime product','RUNTIME','runtime-product','published',1500,'USD')").bind(product, 'a'.repeat(64), category).run()
  await db.prepare("INSERT INTO store_order_requests(id,request_id,request_hash,name,email,manual_review_ack,line_count,total_quantity,status) VALUES(?,?,?,'Synthetic fixture','qa@example.com',1,1,2,'archived')").bind(id, crypto.randomUUID(), 'b'.repeat(64)).run()
  await db.prepare("INSERT INTO store_order_request_items(id,request_ref,product_id,slug,sku,title,category_title,quantity,listed_price_minor,listed_currency,listed_price_note,listed_availability) VALUES(?,?,?,'runtime-product','RUNTIME','Captured title','Runtime',2,1500,'USD','','unknown')").bind(crypto.randomUUID(), id, product).run()
  await db.prepare('UPDATE store_order_requests SET committed=1 WHERE id=?').bind(id).run()
  const before = (await db.prepare('SELECT * FROM store_order_request_items').all()).results
  await db.batch(statements('0022_store_request_fulfilment.sql').map(sql => db.prepare(sql)))
  assert.deepEqual((await db.prepare('SELECT * FROM store_order_request_items').all()).results, before)
  const call = (path, method = 'GET', data, cookie) => mf.dispatchFetch('https://store.test' + path, { method, headers: { Origin: 'https://store.test', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(!['GET', 'HEAD'].includes(method) ? { body: JSON.stringify(data) } : {}) })
  const endpoint = '/api/admin/store/requests/' + id
  assert.equal((await call(endpoint + '/fulfilment', 'PATCH', {})).status, 401)
  const login = await call('/api/admin/login', 'POST', { username: 'synthetic-owner', password: 'synthetic-password' }); assert.equal(login.status, 200)
  const cookie = login.headers.get('Set-Cookie').split(';')[0]
  let record = (await (await call(endpoint, 'GET', undefined, cookie)).json()).record
  assert.equal(record.status, 'archived'); assert.equal(record.fulfilment_stage, 'new')
  async function update(changes) {
    const response = await call(endpoint + '/fulfilment', 'PATCH', { ...fulfilmentDraft(record), version: record.version, customerConfirmation: false, paymentReceiptConfirmed: false, ...changes }, cookie)
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()))
    record = { ...record, ...(await response.json()).record }
  }
  await update({ fulfilment_stage: 'supplier_check' })
  await update({ fulfilment_stage: 'customer_confirmed', delivery_charge_minor: 250, delivery_currency: 'USD', payment_method: 'wish_money', customerConfirmation: true })
  await db.prepare('UPDATE store_products SET price_minor=9000 WHERE id=?').bind(product).run()
  for (const stage of ['sourcing', 'ready_for_delivery', 'out_for_delivery', 'completed']) await update({ fulfilment_stage: stage, delivery_method: 'third_party', delivery_company: 'Synthetic delivery only', tracking_reference: 'FIXTURE', delivery_status: stage === 'completed' ? 'delivered' : 'preparing' })
  assert.equal(record.payment_status, 'pending')
  await update({ payment_status: 'confirmed', paymentReceiptConfirmed: true })
  assert.equal(record.payment_status, 'confirmed')
  await assert.rejects(db.prepare('UPDATE store_order_requests SET delivery_charge_minor=0 WHERE id=?').bind(id).run(), /STORE_CONFIRMED_TERMS_LOCKED/)
  await db.prepare('DELETE FROM store_products WHERE id=?').bind(product).run()
  assert.deepEqual((await db.prepare('SELECT * FROM store_order_request_items').all()).results, before.map(row => ({ ...row, product_id: null })))
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM store_order_requests').first()).n, 1)
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
})
