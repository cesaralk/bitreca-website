import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import worker, { validateSoloEnvironment } from '../integration/solo-deletion/worker.js'
import { stagingFixtureFiles } from '../scripts/prepare-portfolio-fixture.mjs'
import { validateSoloConfig } from '../scripts/prepare-solo-deletion-integration.mjs'

const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
async function fixture(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close())
  db.exec(await readFile(new URL('../integration/solo-deletion/schema.sql', import.meta.url), 'utf8'))
  const objects = new Map(), calls = { db: 0, storage: 0, deletes: [], loseDelete: false, failPut: false }
  const prepare = (sql, args = []) => ({ bind: (...values) => prepare(sql, values),
    first: async () => { calls.db++; return db.prepare(sql).get(...args) || null },
    all: async () => { calls.db++; return { success: true, results: db.prepare(sql).all(...args) } },
    run: async () => { calls.db++; return { success: true, meta: { changes: db.prepare(sql).run(...args).changes } } } })
  const env = { SOLO_IT_MODE: 'isolated-integration-only', SOLO_RUN_ID: runId, SOLO_RUN_TOKEN: '1'.repeat(64),
    SOLO_DATABASE_NAME: 'bitreca-solo-delete-it-aaaaaaaaaaaa-db', SOLO_BUCKET_NAME: 'bitreca-solo-delete-it-aaaaaaaaaaaa-r2',
    SOLO_DATABASE_ID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', SOLO_FIXTURES: JSON.stringify(stagingFixtureFiles()),
    SOLO_DB: { prepare, batch: async statements => {
      db.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results }
      catch (error) { db.exec('ROLLBACK'); throw error }
    } },
    SOLO_R2: {
      list: async ({ prefix, limit }) => { calls.storage++; assert.ok(prefix.startsWith(`solo-deletion-it/${runId}/`)); const keys = [...objects.keys()].filter(key => key.startsWith(prefix)); return { objects: keys.slice(0, limit).map(key => ({ key })), truncated: keys.length > limit } },
      put: async (key, data, options) => { calls.storage++; if (calls.failPut) throw new Error('Ambiguous PUT'); const object = { data: new Uint8Array(data), size: data.length, etag: 'etag-' + key, customMetadata: options.customMetadata }; objects.set(key, object); return object },
      head: async key => { calls.storage++; return objects.get(key) || null },
      get: async key => { calls.storage++; const object = objects.get(key); return object ? { ...object, arrayBuffer: async () => object.data.buffer } : null },
      delete: async key => { calls.storage++; calls.deletes.push(key); objects.delete(key); if (calls.loseDelete) { calls.loseDelete = false; throw new Error('Lost DELETE response') } },
    } }
  const request = (path, options = {}) => new Request('http://127.0.0.1:8793' + path, { method: path === '/status' ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${env.SOLO_RUN_TOKEN}`, 'X-Solo-Confirm': runId, ...options } })
  const call = async path => {
    const before = calls.db + calls.storage
    const response = await worker.fetch(request(path), env), body = await response.json()
    assert.ok(calls.db + calls.storage - before <= 50, 'Bound each fixture step below 50 modeled provider calls')
    return { status: response.status, ...body }
  }
  return { db, env, objects, calls, request, call }
}
test('solo fixture lifecycle uses real SQL, preserves B, and safely reconciles a lost DELETE response', async t => {
  const f = await fixture(t)
  assert.equal((await f.call('/prepare')).phase, 'created')
  assert.equal((await f.call('/upload-folder')).phase, 'folder_uploaded')
  assert.equal((await f.call('/replace-html')).phase, 'ready')
  const retained = new Map([...f.objects].filter(([key]) => key.includes('/b/')))
  assert.equal(f.objects.size, 13)
  assert.equal((await f.call('/mark')).phase, 'marked')
  assert.equal((await f.call('/upload-folder')).status, 409)
  f.calls.loseDelete = true
  assert.equal((await f.call('/cleanup')).status, 409)
  for (let step = 0; step < 11; step++) { if ((await f.call('/cleanup')).phase === 'storage_verified') break }
  assert.equal((await f.call('/finalize')).phase, 'finalized')
  assert.deepEqual(f.objects, retained)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM solo_it_objects').get().n, 13)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM solo_it_portfolios').get().n, 1)
  assert.ok(f.calls.deletes.every(key => key.startsWith(`solo-deletion-it/${runId}/a/`)))
  assert.equal(f.calls.deletes.length, 9)
})
test('solo harness refuses remote hosts, wrong capability, application DB and application schema before storage calls', async t => {
  const f = await fixture(t)
  assert.equal((await worker.fetch(new Request('https://example.invalid/prepare'), f.env)).status, 403)
  assert.equal((await worker.fetch(f.request('/prepare', { Authorization: 'wrong' }), f.env)).status, 403)
  assert.throws(() => validateSoloEnvironment({ ...f.env, SOLO_DATABASE_ID: '9c236935-b942-4cd7-9360-fed24db999fa' }))
  f.db.exec('CREATE TABLE portfolios(id INTEGER)')
  assert.equal((await f.call('/prepare')).status, 409)
  assert.equal(f.calls.storage, 0)
})
test('solo cleanup refuses changed object identity and never deletes unregistered keys', async t => {
  const f = await fixture(t)
  for (const path of ['/prepare','/upload-folder','/replace-html','/mark']) assert.equal((await f.call(path)).status, 200)
  const item = f.db.prepare("SELECT key FROM solo_it_objects WHERE role='a' ORDER BY key LIMIT 1").get()
  f.objects.get(item.key).etag = 'changed'
  assert.equal((await f.call('/cleanup')).status, 409)
  assert.equal(f.calls.deletes.length, 0)
})
test('solo uncertain PUT cannot be marked or cleaned', async t => {
  const f = await fixture(t); f.calls.failPut = true
  assert.equal((await f.call('/prepare')).status, 409)
  assert.equal((await f.call('/mark')).status, 409)
  assert.equal((await f.call('/cleanup')).status, 409)
  assert.equal(f.calls.deletes.length, 0)
  assert.equal(f.db.prepare('SELECT writer_state FROM solo_it_objects').get().writer_state, 'uncertain')
})
test('solo unknown prefix objects block storage verification and are never deleted', async t => {
  const f = await fixture(t)
  for (const path of ['/prepare','/upload-folder','/replace-html','/mark']) await f.call(path)
  const unknown = `solo-deletion-it/${runId}/a/not-in-manifest.txt`
  f.objects.set(unknown, { data: new Uint8Array([1]), size: 1, etag: 'foreign' })
  for (let step = 0; step < 9; step++) assert.equal((await f.call('/cleanup')).status, 200)
  assert.equal((await f.call('/cleanup')).status, 409)
  assert.equal((await f.call('/finalize')).status, 409)
  assert.ok(f.objects.has(unknown)); assert.ok(!f.calls.deletes.includes(unknown))
})
test('solo config forbids existing sandbox resources, extra bindings, public exposure and non-loopback listening', () => {
  const config = { account_id: '4ec868eac2a3b9127531ad39d2501f15', name: 'bitreca-solo-delete-it-aaaaaaaaaaaa-local',
    main: './harness.mjs', compatibility_date: '2026-09-30', workers_dev: false, preview_urls: false, find_additional_modules: false,
    dev: { ip: '127.0.0.1', port: 8793, local_protocol: 'http' },
    d1_databases: [{ binding: 'SOLO_DB', database_name: 'bitreca-solo-delete-it-aaaaaaaaaaaa-db', database_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', remote: true }],
    r2_buckets: [{ binding: 'SOLO_R2', bucket_name: 'bitreca-solo-delete-it-aaaaaaaaaaaa-r2', remote: true }],
    vars: { SOLO_IT_MODE: 'isolated-integration-only', SOLO_RUN_ID: runId, SOLO_DATABASE_NAME: 'bitreca-solo-delete-it-aaaaaaaaaaaa-db',
      SOLO_DATABASE_ID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', SOLO_BUCKET_NAME: 'bitreca-solo-delete-it-aaaaaaaaaaaa-r2', SOLO_FIXTURES: '{}' } }
  validateSoloConfig(config)
  for (const mutate of [
    c => { c.r2_buckets[0].bucket_name = 'bitreca-delete-sandbox-r2-20261025' },
    c => { c.d1_databases[0].database_id = c.vars.SOLO_DATABASE_ID = '9c236935-b942-4cd7-9360-fed24db999fa' },
    c => { c.dev.ip = '0.0.0.0' }, c => { c.workers_dev = true },
    c => { c.routes = ['example.invalid/*'] }, c => { c.r2_buckets.push(c.r2_buckets[0]) },
  ]) { const changed = structuredClone(config); mutate(changed); assert.throws(() => validateSoloConfig(changed)) }
})
