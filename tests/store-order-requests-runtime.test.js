import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { emptyOrderContact } from '../shared/store-order-request.js'

test('actual workerd verifies provider action and D1 commits or rolls back complete request/snapshot sets', async t => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../worker/index.js', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'esm' })
  let db, withdraw = false, calls = 0
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-23', d1Databases: ['bitreca_db'], bindings: { STORE_ORDER_REQUESTS_ENABLED: 'true', CONTACT_ALLOWED_ORIGINS: 'https://store.test', CONTACT_TURNSTILE_SITE_KEY: 'synthetic-site-key', CONTACT_TURNSTILE_SECRET: 'synthetic-secret', CONTACT_RATE_LIMIT_SECRET: 'synthetic-runtime-hmac-secret-at-least-32-characters', ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-password', SESSION_SECRET: 'synthetic-session', ADMIN_AUTH_VERSION: '1' }, outboundService: async request => { assert.equal(request.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify'); calls++; if (withdraw) await db.prepare("UPDATE store_products SET status='draft' WHERE slug='runtime-product'").run(); return Response.json({ success: true, hostname: 'store.test', action: 'store_order_request' }) } }))
  t.after(() => mf.dispose()); db = await mf.getD1Database('bitreca_db')
  for (const file of ['0004_create_admin_sessions.sql', '0019_add_store_catalogue.sql', '0020_add_store_order_requests.sql']) {
    const sql = readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8')
    for (const statement of sql.match(/CREATE TRIGGER[\s\S]*?END;|CREATE (?:TABLE|INDEX)[\s\S]*?;|INSERT INTO admin_auth_state[\s\S]*?;/g)) await db.prepare(statement).run()
  }
  const category = crypto.randomUUID(), product = crypto.randomUUID()
  await db.prepare("INSERT INTO store_categories(id,creation_hash,title,slug,status) VALUES(?,?,?,?,'published')").bind(category, 'a'.repeat(64), 'Runtime fixture', 'runtime').run()
  await db.prepare("INSERT INTO store_products(id,creation_hash,category_id,title,sku,slug,status) VALUES(?,?,?,?,?,?,'published')").bind(product, 'b'.repeat(64), category, 'Runtime product', 'RUNTIME', 'runtime-product').run()
  const input = { ...emptyOrderContact(), name: 'Runtime fixture', email: 'qa@example.com', manualReviewAck: true, items: [{ slug: 'runtime-product', quantity: 2 }], requestId: crypto.randomUUID(), turnstileToken: 'synthetic-token' }
  const send = data => mf.dispatchFetch('https://store.test/api/store/order-requests', { method: 'POST', headers: { Origin: 'https://store.test', 'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  const first = await send(input); assert.equal(first.status, 201); assert.equal((await first.json()).status, 'stored_for_review')
  assert.equal((await send(input)).status, 200); assert.equal(calls, 1)
  withdraw = true; assert.equal((await send({ ...input, requestId: crypto.randomUUID() })).status, 409)
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM store_order_requests').first()).n, 1)
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM store_order_request_items').first()).n, 1)
  const login = await mf.dispatchFetch('https://store.test/api/admin/login', { method: 'POST', headers: { Origin: 'https://store.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'synthetic-owner', password: 'synthetic-password' }) })
  assert.equal(login.status, 200)
  const list = await mf.dispatchFetch('https://store.test/api/admin/store/requests', { headers: { Cookie: login.headers.get('Set-Cookie').split(';')[0] } })
  assert.equal(list.status, 200); assert.equal((await list.json()).records.length, 1)
})
