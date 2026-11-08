import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

function statements(name) {
  return readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8').replace(/--[^\n]*/g, '').match(/CREATE TRIGGER[\s\S]*?END;|(?:CREATE|DROP|ALTER|INSERT|PRAGMA)[\s\S]*?;/g)
}
test('actual workerd/D1/R2 migration preserves populated history and confirms physical product/image deletion with detached snapshots', async t => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../worker/index.js', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'esm' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-23', d1Databases: ['bitreca_db'], r2Buckets: ['bitreca_media'], bindings: { ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-password', SESSION_SECRET: 'synthetic-session', ADMIN_AUTH_VERSION: '1' } })); t.after(() => mf.dispose())
  const db = await mf.getD1Database('bitreca_db'), media = await mf.getR2Bucket('bitreca_media')
  for (const name of ['0004_create_admin_sessions.sql', '0019_add_store_catalogue.sql', '0020_add_store_order_requests.sql']) await db.batch(statements(name).map(sql => db.prepare(sql)))
  const category = crypto.randomUUID(), product = crypto.randomUUID(), kept = crypto.randomUUID(), request = crypto.randomUUID(), image = `store-catalogue/${crypto.randomUUID()}.png`
  await db.prepare("INSERT INTO store_categories(id,creation_hash,title,slug,status) VALUES(?,?,'Runtime fixture','runtime','published')").bind(category, 'a'.repeat(64)).run()
  for (const id of [product, kept]) await db.prepare("INSERT INTO store_products(id,creation_hash,category_id,sku,slug,title,image_key,status) VALUES(?,?,?,?,?,'Runtime product',?,'published')").bind(id, 'a'.repeat(64), category, 'RUNTIME-' + id, 'runtime-' + id, id === product ? image : null).run()
  await media.put(image, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { httpMetadata: { contentType: 'image/png' } })
  await db.prepare("INSERT INTO store_order_requests(id,request_id,request_hash,name,email,manual_review_ack,line_count,total_quantity) VALUES(?,?,?,'Synthetic owner','runtime@example.com',1,2,2)").bind(request, crypto.randomUUID(), 'a'.repeat(64)).run()
  for (const id of [product, kept]) await db.prepare("INSERT INTO store_order_request_items(id,request_ref,product_id,slug,sku,title,category_title,quantity,listed_price_note,listed_availability) VALUES(?,?,?,?,?,'Historical title','Historical category',1,'Synthetic only','unknown')").bind(crypto.randomUUID(), request, id, 'runtime-' + id, 'RUNTIME-' + id).run()
  await db.prepare('UPDATE store_order_requests SET committed=1 WHERE id=?').bind(request).run()
  const headers = (await db.prepare('SELECT * FROM store_order_requests').all()).results, before = (await db.prepare('SELECT * FROM store_order_request_items ORDER BY id').all()).results
  await db.batch(statements('0021_store_product_permanent_deletion.sql').map(sql => db.prepare(sql)))
  assert.deepEqual((await db.prepare('SELECT * FROM store_order_requests').all()).results, headers); assert.deepEqual((await db.prepare('SELECT * FROM store_order_request_items ORDER BY id').all()).results, before)
  const call = (path, method = 'GET', data, cookie) => mf.dispatchFetch('https://store.test' + path, { method, headers: { Origin: 'https://store.test', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(!['GET', 'HEAD'].includes(method) ? { body: JSON.stringify(data) } : {}) })
  const confirmation = { title: 'Runtime product', sku: 'RUNTIME-' + product, version: 1, confirmed: true }
  assert.equal((await call('/api/admin/store/products/' + product, 'DELETE', confirmation)).status, 401)
  const login = await call('/api/admin/login', 'POST', { username: 'synthetic-owner', password: 'synthetic-password' }); assert.equal(login.status, 200); const cookie = login.headers.get('Set-Cookie').split(';')[0]
  const removed = await call('/api/admin/store/products/' + product, 'DELETE', confirmation, cookie); assert.equal(removed.status, 200); assert.equal((await removed.json()).cleanup_complete, true)
  assert.equal(await db.prepare('SELECT id FROM store_products WHERE id=?').bind(product).first(), null); assert.equal(await media.head(image), null)
  assert(await db.prepare('SELECT id FROM store_products WHERE id=?').bind(kept).first())
  const expected = before.map(row => ({ ...row, product_id: row.product_id === product ? null : row.product_id })); assert.deepEqual((await db.prepare('SELECT * FROM store_order_request_items ORDER BY id').all()).results, expected)
  assert.deepEqual((await db.prepare('SELECT * FROM store_order_requests').all()).results, headers); assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length, 0)
  assert.equal((await call('/api/admin/store/products/' + product, 'DELETE', confirmation, cookie)).status, 200)
  assert.equal((await call('/api/store/products/runtime-' + product)).status, 404); assert.equal((await call('/api/store/products/runtime-' + product + '/image')).status, 404)
  assert.equal((await call('/api/admin/store/media/' + image.split('/')[1], 'GET', undefined, cookie)).status, 404)
  const detail = await call('/api/admin/store/requests/' + request, 'GET', undefined, cookie); assert.equal(detail.status, 200); assert.equal((await detail.json()).items.length, 2)
})
