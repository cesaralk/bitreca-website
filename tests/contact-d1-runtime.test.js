import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { handleContactRequest } from '../worker/contact-enquiry.js'
import worker from '../worker/index.js'

test('isolated workerd D1 stores once and the existing owner session can read/update it', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("isolated") } }', compatibilityDate: '2026-09-23', d1Databases: ['bitreca_db'], d1Persist: false }))
  t.after(() => mf.dispose())
  const db = await mf.getD1Database('bitreca_db')
  const sql = readFileSync(new URL('../migrations/0018_add_contact_enquiries.sql', import.meta.url), 'utf8').replace(/--[^\n]*/g, '')
  for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run()
  // Existing-compatible synthetic auth schema; the separate SQLite tests use
  // the complete unchanged 0004 migration and its protection triggers.
  await db.prepare('CREATE TABLE admin_auth_state (admin_id TEXT PRIMARY KEY, auth_version INTEGER NOT NULL)').run()
  await db.prepare("INSERT INTO admin_auth_state VALUES ('primary-admin', 1)").run()
  await db.prepare('CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY, admin_id TEXT, auth_version INTEGER, config_fingerprint TEXT, created_at INTEGER, expires_at INTEGER)').run()
  const origin = 'https://bitreca.runtime.test'
  const env = { bitreca_db: db, CONTACT_INBOX_ENABLED: 'true', CONTACT_ALLOWED_ORIGINS: origin, CONTACT_RATE_LIMIT_SECRET: 'synthetic-runtime-rate-key-more-than-32-characters', CONTACT_TURNSTILE_SECRET: 'synthetic-runtime-secret', CONTACT_TURNSTILE_SITE_KEY: 'synthetic-runtime-key', ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-password', SESSION_SECRET: 'synthetic-session-secret', ADMIN_AUTH_VERSION: '1' }
  const input = { name: 'Runtime fixture', email: 'qa@example.com', service: 'Applications', message: 'An isolated workerd D1 integration fixture.', requestId: crypto.randomUUID(), turnstileToken: 'synthetic-token' }
  const request = () => new Request(origin + '/api/enquiries', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(input) })
  const verify = async () => Response.json({ success: true, hostname: 'bitreca.runtime.test', action: 'contact_enquiry' })
  const first = await handleContactRequest(request(), env, verify)
  assert.equal(first.status, 201)
  const receipt = await first.json()
  assert.equal((await handleContactRequest(request(), env, verify)).status, 200)
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM contact_enquiries').first()).n, 1)
  const login = await worker.fetch(new Request(origin + '/api/admin/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }) }), env)
  assert.equal(login.status, 200)
  const cookie = login.headers.get('Set-Cookie').split(';')[0]
  const list = await worker.fetch(new Request(origin + '/api/admin/enquiries', { headers: { Cookie: cookie } }), env)
  assert.equal((await list.json()).enquiries.length, 1)
  const updated = await worker.fetch(new Request(origin + '/api/admin/enquiries/' + receipt.reference, { method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress', version: 1 }) }), env)
  assert.equal(updated.status, 200)
  assert.equal((await updated.json()).enquiry.version, 2)
})
