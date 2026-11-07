import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { build } from 'esbuild'
import { emptyCategory, emptyProduct } from '../shared/store-catalogue.js'

test('actual workerd routes, D1 triggers, private R2 and existing session support catalogue lifecycle', async t => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../worker/index.js', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-23', d1Databases: ['bitreca_db'], r2Buckets: ['bitreca_media'], bindings: { ADMIN_USERNAME: 'synthetic-runtime-owner', ADMIN_PASSWORD: 'synthetic-runtime-password', SESSION_SECRET: 'synthetic-runtime-session', ADMIN_AUTH_VERSION: '1' } }))
  t.after(() => mf.dispose())
  const db = await mf.getD1Database('bitreca_db')
  for (const file of ['0004_create_admin_sessions.sql', '0019_add_store_catalogue.sql']) {
    const sql = readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8')
    for (const statement of sql.match(/CREATE TRIGGER[\s\S]*?END;|CREATE (?:TABLE|INDEX)[\s\S]*?;|INSERT INTO admin_auth_state[\s\S]*?;/g)) await db.prepare(statement).run()
  }
  const call = (path, method = 'GET', data, cookie, type = 'application/json') => mf.dispatchFetch('https://store.test' + path, { method, headers: { Origin: 'https://store.test', 'Content-Type': type, ...(cookie ? { Cookie: cookie } : {}) }, ...(!['GET', 'HEAD'].includes(method) ? { body: type === 'application/json' ? JSON.stringify(data) : data } : {}) })
  assert.equal((await call('/api/admin/store/products')).status, 401)
  const login = await call('/api/admin/login', 'POST', { username: 'synthetic-runtime-owner', password: 'synthetic-runtime-password' })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('Set-Cookie').split(';')[0]
  const categoryId = crypto.randomUUID(), productId = crypto.randomUUID(), category = { ...emptyCategory(), title: 'Runtime fixture', slug: 'runtime-fixture', status: 'published' }
  assert.equal((await call('/api/admin/store/categories', 'POST', { id: categoryId, data: category }, cookie)).status, 201)
  const upload = await call('/api/admin/store/media', 'POST', Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), cookie, 'image/png')
  assert.equal(upload.status, 201)
  const key = (await upload.json()).image_key
  const product = { ...emptyProduct(), title: 'Runtime product', sku: 'RUNTIME', slug: 'runtime-product', category_id: categoryId, description: 'Synthetic runtime fixture', image_key: key, status: 'published' }
  assert.equal((await call('/api/admin/store/products', 'POST', { id: productId, data: product }, cookie)).status, 201)
  assert.equal((await call('/api/admin/store/products', 'POST', { id: productId, data: product }, cookie)).status, 200)
  assert.equal((await call('/api/admin/store/categories/' + categoryId, 'PUT', { id: categoryId, version: 1, data: { ...category, status: 'draft' } }, cookie)).status, 409)
  assert.equal((await call('/api/admin/store/products/' + productId, 'PUT', { id: productId, version: 1, data: { ...product, status: 'archived' } }, cookie)).status, 200)
  assert.equal((await call('/api/admin/store/media/' + key.split('/')[1], 'GET', null, cookie)).status, 200)
  assert.equal((await call('/api/media/' + key)).status, 404)
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM store_products').first()).n, 1)
})
