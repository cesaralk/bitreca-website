import { beforeEach, test as nodeTest } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import worker from '../worker/index.js'
import hosting from '../portfolio-hosting/index.js'
import {
  claimCleanupJob, renewCleanupLease, prepareCleanupItems, finishCleanupPreparation,
  recordCleanupRetry, planCleanupBatch, getPortfolioDeletionStatus,
} from '../worker/portfolio-cleanup-state.js'
import { executeCleanupStep } from '../worker/portfolio-cleanup-executor.js'
import { claimFinalizationLease, finalizePortfolioDeletion } from '../worker/portfolio-finalization.js'
import { registerStorageProtocolVerification, attestPortfolioInventory } from '../worker/portfolio-inventory.js'
import { runPortfolioDeletionJob, schedulePortfolioDeletions, retryPortfolioDeletion } from '../worker/portfolio-deletion-workflow.js'
import { PORTFOLIO_STORAGE_SENTINEL, deletionCapabilities, getDeletionAuthorization } from '../worker/portfolio-deletion-config.js'
import { sandboxResources } from '../scripts/check-portfolio-config.mjs'
import { requireCurrentAuthorization } from '../worker/portfolio-authorization.js'

// SQLite is exclusively :memory:. R2, network, credentials and faults are mocked.
beforeEach((t) => {
  t.mock.method(console, 'error', () => {})
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Network is forbidden in these tests') })
})
const migrations = readdirSync(new URL('../migrations/', import.meta.url))
  .filter(name => /^(?:000[1-9]|001[0-4])_.*\.sql$/.test(name)).sort()
const uuid = number => String(number).padStart(8, '0') + '-0000-4000-8000-000000000000'
const sourcePrefix = 'portfolios/fixture-one/'
const test = (name, fn) => nodeTest(name, { timeout: 10000 }, fn)
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const gate = () => ({ started: deferred(), resume: deferred() })
async function pause(point) {
  point.started.resolve()
  await point.resume.promise
}

function fixture(t, migrationLimit = migrations.length) {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY; PRAGMA journal_mode=MEMORY;')
  assert.equal(db.prepare('PRAGMA database_list').get().file, '')
  assert.equal(migrations.length, 14)
  for (const file of migrations.slice(0, 6)) db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'))
  const insert = db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix,status) VALUES(?,?,?,?,?)')
  insert.run(1, 'Fake one', 'fixture-one', sourcePrefix, 'published')
  insert.run(2, 'Fake two', 'fixture-two', 'portfolios/fixture-two/', 'published')
  db.prepare(`INSERT INTO portfolio_storage_allocations
    (prefix,portfolio_id,allocation_kind,upload_state) VALUES(?,2,'initial','completed')`)
    .run('portfolio-initial/' + uuid(200) + '/')
  const existing = db.prepare('SELECT * FROM portfolios ORDER BY id').all()
  const owned = db.prepare('SELECT * FROM portfolio_storage_allocations').all().map(row => Object.assign(Object.create(null), row, {
    writer_protocol_version: 0, writer_token: null, writer_state: null, writer_closed_at: null,
    ...(migrationLimit >= 14 ? { authorization_policy_id: null, authorization_generation: null, authorization_artifact: null } : {}),
  }))
  for (const file of migrations.slice(6, migrationLimit)) db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'))
  const state = {
    fail: null, puts: 0, reads: 0, lists: 0, heads: 0, queries: 0, triggerResults: [],
    beforeFirst: null, afterFirst: null, beforeRun: null, beforeBatch: null,
    putGate: null, getGate: null, listGate: null, writesAfterMark: 0,
    objects: new Map([[sourcePrefix + 'index.html', 'OLD'], [sourcePrefix + 'style.css', 'CSS'],
      ['portfolios/fixture-two/index.html', 'OTHER']]),
  }
  function run(sql, args) {
    state.queries++
    const query = sql.replace(/\s+/g, ' ').trim()
    const writerUpdate = query.startsWith('UPDATE portfolio_storage_allocations SET writer_state')
    if (state.fail === 'writer-update' && writerUpdate) throw new Error('Injected writer checkpoint failure')
    if (state.fail === 'writer-false-result' && writerUpdate) return { success: false, meta: { changes: 0 } }
    if (state.fail === 'job-insert' && query.startsWith('INSERT INTO portfolio_deletion_jobs')) throw new Error('Injected job failure')
    if (state.fail === 'activation' && query.startsWith('UPDATE portfolios SET storage_prefix')) throw new Error('Injected activation failure')
    if (state.fail === 'cleanup-checkpoint' && query.includes('SET allocation_cursor')) throw new Error('Injected cleanup checkpoint failure')
    if (state.fail === 'cleanup-confirm-failure' && query.startsWith('INSERT INTO portfolio_deletion_batch_receipts')) throw new Error('Injected confirmation failure')
    // Model Cloudflare's installed D1 emulator: meta.changes is the delta of
    // total_changes(), including immutable-history and initialization triggers.
    const beforeChanges = db.prepare('SELECT total_changes() AS n').get().n
    const result = db.prepare(sql).run(...args)
    const changes = db.prepare('SELECT total_changes() AS n').get().n - beforeChanges
    if (changes > Number(result.changes)) state.triggerResults.push({ operation: query.split(' ').slice(0, 3).join(' '), changes })
    if (state.fail === 'dispatch-claim-response-lost' && query.startsWith('UPDATE portfolio_deletion_dispatch SET lease_token')) {
      state.fail = null
      throw new Error('Injected committed dispatch claim response loss')
    }
    if (state.fail === 'dispatch-checkpoint-response-lost' && query.startsWith('UPDATE portfolio_deletion_dispatch SET phase')) {
      state.fail = null
      throw new Error('Injected committed dispatch checkpoint response loss')
    }
    if (state.fail === 'inventory-response-lost' && query.startsWith('INSERT INTO portfolio_inventory_verifications')) {
      state.fail = null
      throw new Error('Injected committed inventory verification response loss')
    }
    if (state.fail === 'finalization-response-lost' && query.startsWith('INSERT INTO portfolio_deletion_finalizations')) {
      state.fail = null
      throw new Error('Injected committed finalization response loss')
    }
    if (state.fail === 'cleanup-claim-response-lost' && query.startsWith('UPDATE portfolio_deletion_executions AS e')) {
      state.fail = null
      throw new Error('Injected committed cleanup claim response loss')
    }
    if (state.fail === 'cleanup-manifest-response-lost' && query.startsWith('INSERT INTO portfolio_deletion_batches')) {
      state.fail = null
      throw new Error('Injected committed cleanup manifest response loss')
    }
    if (state.fail === 'cleanup-confirm-response-lost' && query.startsWith('INSERT INTO portfolio_deletion_batch_receipts')) {
      state.fail = null
      throw new Error('Injected committed confirmation response loss')
    }
    if (state.fail === 'cleanup-empty-response-lost' && query.startsWith('INSERT INTO portfolio_deletion_prefix_receipts')) {
      state.fail = null
      throw new Error('Injected committed empty-prefix response loss')
    }
    if (state.fail === 'cleanup-storage-response-lost' && query.startsWith('INSERT INTO portfolio_deletion_storage_receipts')) {
      state.fail = null
      throw new Error('Injected committed storage verification response loss')
    }
    if (state.fail === 'writer-response-lost' && writerUpdate) {
      state.fail = null
      throw new Error('Injected committed writer checkpoint response loss')
    }
    if (state.fail === 'registration-response-lost' && query.startsWith('INSERT INTO portfolio_storage_allocations')) {
      throw new Error('Injected committed registration response loss')
    }
    return { success: true, meta: { changes, last_row_id: Number(result.lastInsertRowid) } }
  }
  function prepare(sql) {
    const query = sql.replace(/\s+/g, ' ').trim()
    const statement = (args) => ({
      sql, args,
      async first() {
        state.queries++
        if (state.fail === 'auth' && query.includes('FROM admin_auth_state AS state')) throw new Error('Injected auth failure')
        if (state.fail === 'job-lookup' && query.includes('FROM portfolio_deletion_jobs')) throw new Error('Injected lookup failure')
        if (state.fail === 'writer-read' && query.includes('FROM portfolio_storage_allocations AS allocation')) throw new Error('Injected writer verification failure')
        if (state.beforeFirst) await state.beforeFirst(query, args)
        const row = db.prepare(sql).get(...args) ?? null
        if (state.afterFirst) await state.afterFirst(query, args)
        return row
      },
      async all() { state.queries++; return { success: true, results: db.prepare(sql).all(...args) } },
      async run() {
        if (state.beforeRun) await state.beforeRun(query, args)
        return run(sql, args)
      },
    })
    return { ...statement([]), bind: (...args) => statement(args) }
  }
  const binding = {
    prepare,
    async batch(statements) {
      if (state.beforeBatch) await state.beforeBatch(statements)
      db.exec('BEGIN')
      let results
      try {
        results = statements.map(statement => run(statement.sql, statement.args))
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      if (state.fail === 'mark-response-lost' && statements[0].sql.includes('SET deletion_requested_at')) {
        throw new Error('Injected committed marking response loss')
      }
      if (state.fail === 'activation-response-lost' && /SET storage_prefix/.test(statements[0].sql)) {
        throw new Error('Injected committed activation response loss')
      }
      if (state.fail === 'cleanup-preparation-response-lost' && statements[0].sql.includes('INSERT INTO portfolio_deletion_items')) {
        state.fail = null
        throw new Error('Injected committed cleanup preparation response loss')
      }
      return results
    },
  }
  const bucket = {
    async list({ prefix, limit = 100 }) {
      state.lists++
      if (state.listGate && prefix.startsWith('portfolio-versions/')) await pause(state.listGate)
      const matching = [...state.objects].filter(([key]) => key.startsWith(prefix))
      return { objects: matching.slice(0, limit).map(([key, value]) => ({ key, size: new TextEncoder().encode(value).length, etag: key })), truncated: matching.length > limit }
    },
    async get(key) {
      state.reads++
      if (state.fail === 'source-read' || (state.fail === 'source-read-after-first' && state.puts > 0)) return null
      const value = state.objects.get(key)
      if (state.getGate && state.reads === 1) await pause(state.getGate)
      return value === undefined ? null : {
        body: new Blob([value]).stream(), size: new TextEncoder().encode(value).length, etag: key,
        httpMetadata: { contentType: 'text/css' }, customMetadata: { fixture: 'preserved' },
      }
    },
    async head(key) { state.heads++; return state.objects.has(key) ? { size: state.objects.get(key).length } : null },
    async put(key, stream) {
      const allocation = db.prepare('SELECT * FROM portfolio_storage_allocations').all().find(row => key.startsWith(row.prefix))
      assert.ok(allocation, 'Every PUT has durable ownership')
      assert.ok(db.prepare('SELECT id FROM portfolios WHERE id=?').get(allocation.portfolio_id))
      assert.equal(allocation.upload_state, 'uploading')
      assert.equal(allocation.writer_state, 'open')
      state.puts++
      if (state.putGate && state.puts === 1) await pause(state.putGate)
      if (state.fail === 'write' || (state.fail === 'write-after-first' && state.puts === 2)) throw new Error('Injected write failure')
      if (db.prepare('SELECT deletion_requested_at FROM portfolios WHERE id=?').get(allocation.portfolio_id).deletion_requested_at !== null) state.writesAfterMark++
      state.objects.set(key, await new Response(stream).text())
      if (state.fail === 'write-response-lost') throw new Error('Injected committed write response loss')
    },
  }
  return {
    db, state, existing, owned,
    env: { ADMIN_USERNAME: 'fixture-admin', ADMIN_PASSWORD: 'fixture-password', SESSION_SECRET: 'fixture-secret',
   ADMIN_AUTH_VERSION: '1',
PORTFOLIO_ENVIRONMENT: 'production',
PORTFOLIO_DELETE_REQUESTS_ENABLED: 'true',
bitreca_db: binding,
bitreca_media: bucket },
hostEnv: { PORTFOLIO_DB: binding, PORTFOLIO_FILES: bucket },
  }
}

function request(path, method = 'GET', body, cookie, origin = 'https://fixture.invalid') {
  return new Request('https://fixture.invalid' + path, {
    method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  })
}
async function login(f) {
  const result = await worker.fetch(request('/api/admin/login', 'POST', {
    username: f.env.ADMIN_USERNAME, password: f.env.ADMIN_PASSWORD,
  }), f.env)
  assert.equal(result.status, 200)
  return result.headers.get('Set-Cookie').split(';')[0]
}
const portfolio = f => f.db.prepare('SELECT * FROM portfolios WHERE id=1').get()
const jobs = f => f.db.prepare('SELECT * FROM portfolio_deletion_jobs').all()
const uploads = f => f.db.prepare("SELECT * FROM portfolio_storage_allocations WHERE allocation_kind <> 'initial'").all()
const trackedPrefix = number => 'portfolio-versions/1/' + uuid(number) + '/'
function registerTracked(f, number, token = number.toString(16).padStart(32, '0')) {
  f.db.prepare(`INSERT INTO portfolio_storage_allocations
    (prefix,portfolio_id,allocation_kind,upload_state,source_prefix,writer_protocol_version,writer_token,writer_state)
    VALUES(?,1,'folder','uploading',?,1,?,'open')`).run(trackedPrefix(number), sourcePrefix, token)
  return trackedPrefix(number)
}
const mark = (f, cookie, id = 1) => {
  const marking = request('/api/admin/portfolios/' + id, 'DELETE', undefined, cookie)
  marking.headers.set('X-Portfolio-Delete-Confirm', String(id))
  return worker.fetch(marking, f.env)
}
const status = (f, cookie, value) => worker.fetch(request('/api/admin/portfolios/1/status', 'PATCH', { status: value }, cookie), f.env)
const edit = (f, cookie) => worker.fetch(request('/api/admin/portfolios/1', 'PUT', { name: 'Fake edit', slug: 'fake-edit' }, cookie), f.env)
const serve = (f, slug = 'fixture-one') => hosting.fetch(new Request('https://' + slug + '.bitreca.com/'), f.hostEnv)
function upload(f, cookie, folder) {
  const form = new FormData()
  form.append(folder ? 'files' : 'file', new File(['NEW'], 'index.html'))
  if (folder) {
    form.append('paths', 'index.html')
    form.append('files', new File(['NEW CSS'], 'style.css'))
    form.append('paths', 'style.css')
  }
  return worker.fetch(request('/api/admin/portfolios/1/' + (folder ? 'upload-folder' : 'upload'), 'POST', form, cookie), f.env)
}

test('0001-0014 preserve existing rows and ownership; markers default to null and jobs are empty', t => {
  const f = fixture(t)
  const rows = f.db.prepare('SELECT * FROM portfolios ORDER BY id').all()
  assert.deepEqual(rows.map(({ deletion_requested_at, storage_birth_token, ...old }) => {
    assert.equal(deletion_requested_at, null)
    assert.equal(storage_birth_token, null)
    return old
  }), f.existing.map(row => ({ ...row })))
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_storage_allocations').all(), f.owned)
  assert.equal(jobs(f).length, 0)
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), [])
  assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
})

test('marking atomically unpublishes, increments revision and retains all content and ownership', async t => {
  const f = fixture(t), cookie = await login(f), objects = structuredClone(f.state.objects)
 const response = await mark(f, cookie)
assert.equal(response.status, 202)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const body = await response.json(), row = portfolio(f)
  assert.equal(body.job.id, jobs(f)[0].id)
  assert.equal(body.job.state, 'pending')
  assert.equal(jobs(f)[0].requested_by, 'primary-admin')
  assert.ok(Number.isInteger(row.deletion_requested_at))
  assert.equal(row.status, 'draft')
  assert.equal(row.publication_revision, 1)
  assert.equal(row.storage_prefix, sourcePrefix)
  assert.equal(f.state.reads + f.state.puts + f.state.lists + f.state.heads, 0)
  assert.deepEqual(f.state.objects, objects)
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_storage_allocations').all(), f.owned)
  assert.equal(f.db.prepare('SELECT count(*) n FROM portfolios').get().n, 2)
})

test('repeated and concurrent marking return one immutable job without further revision changes', async t => {
  const f = fixture(t), cookie = await login(f)
  const results = await Promise.all([mark(f, cookie), mark(f, cookie), mark(f, cookie)])
  assert.ok(results.every(response => response.status === 202))
  const bodies = await Promise.all(results.map(response => response.json()))
  assert.ok(bodies.every(body => body.job.id === bodies[0].job.id))
  const saved = { ...portfolio(f) }, receipt = { ...jobs(f)[0] }
  assert.equal((await mark(f, cookie)).status, 202)
  assert.equal(jobs(f).length, 1)
  assert.deepEqual({ ...portfolio(f) }, saved)
  assert.deepEqual({ ...jobs(f)[0] }, receipt)
})

test('job ID collision preserves idempotent retries and cannot transfer a job to another portfolio', async t => {
  const f = fixture(t), cookie = await login(f)
  await mark(f, cookie)
  const saved = jobs(f)[0].id
  t.mock.method(crypto, 'randomUUID', () => saved)
  assert.equal((await mark(f, cookie)).status, 202)
  assert.equal((await mark(f, cookie, 2)).status, 503)
  assert.equal(jobs(f).length, 1)
  assert.equal(jobs(f)[0].portfolio_id, 1)
  assert.equal(f.db.prepare('SELECT deletion_requested_at FROM portfolios WHERE id=2').get().deletion_requested_at, null)
})

test('unauthenticated, cross-origin and invalid-ID requests cannot mark; missing portfolio returns 404', async t => {
  const f = fixture(t)
  assert.equal((await mark(f, null)).status, 401)
  const cookie = await login(f)
  assert.equal((await worker.fetch(request('/api/admin/portfolios/1', 'DELETE', undefined, cookie, 'https://untrusted.invalid'), f.env)).status, 403)
  for (const id of [0, '999999999999999999999999999999']) assert.equal((await mark(f, cookie, id)).status, 400)
  assert.equal((await mark(f, cookie, 999)).status, 404)
  assert.equal(portfolio(f).deletion_requested_at, null)
  assert.equal(jobs(f).length, 0)
})

test('D1 authentication failure fails closed before marking', async t => {
  const f = fixture(t), cookie = await login(f)
  f.state.fail = 'auth'
  assert.equal((await mark(f, cookie)).status, 503)
  assert.equal(portfolio(f).deletion_requested_at, null)
  assert.equal(jobs(f).length, 0)
})

test('job insertion failure rolls back the marker, unpublish and revision together', async t => {
  const f = fixture(t), cookie = await login(f), before = { ...portfolio(f) }
  f.state.fail = 'job-insert'
  assert.equal((await mark(f, cookie)).status, 503)
  assert.deepEqual({ ...portfolio(f) }, before)
  assert.equal(jobs(f).length, 0)
  f.state.fail = null
  assert.equal((await serve(f)).status, 200)
})

for (const failure of ['mark-response-lost', 'job-lookup']) {
  test(`${failure}: retry retrieves the committed job without duplicating or resetting it`, async t => {
    const f = fixture(t), cookie = await login(f)
    f.state.fail = failure
    assert.equal((await mark(f, cookie)).status, 503)
    assert.equal(portfolio(f).status, 'draft')
    const saved = { ...jobs(f)[0] }
    f.state.fail = null
    const retry = await mark(f, cookie)
    assert.equal(retry.status, 202)
    assert.equal((await retry.json()).job.id, saved.id)
    assert.equal(jobs(f).length, 1)
    assert.equal(portfolio(f).publication_revision, 1)
  })
}

test('pending portfolios reject editing, both status operations, both uploads and file checks before R2 access', async t => {
  const f = fixture(t), cookie = await login(f)
  await mark(f, cookie)
  for (const operation of [edit(f, cookie), status(f, cookie, 'published'), status(f, cookie, 'draft'),
    upload(f, cookie, false), upload(f, cookie, true),
    worker.fetch(request('/api/admin/portfolios/1/file-check', 'GET', undefined, cookie), f.env),
    worker.fetch(request('/api/admin/portfolios/1/files-check', 'GET', undefined, cookie), f.env)]) {
    const response = await operation
    assert.equal(response.status, 409)
    assert.equal((await response.json()).code, 'PORTFOLIO_PENDING_DELETION')
  }
  assert.equal(f.state.reads + f.state.lists + f.state.puts + f.state.heads, 0)
  assert.equal(uploads(f).length, 0)
})

test('pending portfolios are not hosted; unrelated portfolios and health checks remain available', async t => {
  const f = fixture(t), cookie = await login(f)
  const initial = await serve(f)
  assert.equal(initial.status, 200)
  assert.equal(await initial.text(), 'OLD')
  await mark(f, cookie)
  const reads = f.state.reads
  assert.equal((await serve(f)).status, 404)
  assert.equal(f.state.reads, reads)
  assert.equal((await serve(f, 'fixture-two')).status, 200)
  assert.equal((await hosting.fetch(new Request('https://fixture.invalid/health'), f.hostEnv)).status, 200)
})

test('hosting rechecks deletion after an in-flight R2 GET and discards the body', async t => {
  const f = fixture(t), cookie = await login(f), point = gate()
  f.state.getGate = point
  const pending = serve(f)
  await point.started.promise
  try { assert.equal((await mark(f, cookie)).status, 202) }
  finally { point.resume.resolve() }
  const result = await pending
  assert.equal(result.status, 404)
  assert.equal(result.headers.get('Cache-Control'), 'no-store')
})

for (const afterGet of [false, true]) {
  test(`hosting D1 failure ${afterGet ? 'after' : 'before'} the R2 read never returns customer content`, async t => {
    const f = fixture(t)
    f.state.beforeFirst = async query => {
      if (afterGet ? query.startsWith('SELECT id FROM portfolios') : query.startsWith('SELECT id, storage_prefix')) {
        throw new Error('Injected hosting lookup failure')
      }
    }
    const result = await serve(f)
    assert.equal(result.status, 500)
    assert.equal(await result.text(), 'Could not load portfolio.')
    assert.equal(f.state.reads, afterGet ? 1 : 0)
  })
}

test('normal creation, editing, publishing, unpublishing and admin listing work with migrated SQL', async t => {
  const f = fixture(t), cookie = await login(f)
  assert.equal((await edit(f, cookie)).status, 200)
  assert.equal(portfolio(f).storage_prefix, sourcePrefix)
  assert.equal((await status(f, cookie, 'draft')).status, 200)
  assert.equal((await status(f, cookie, 'published')).status, 200)
  const created = await worker.fetch(request('/api/admin/portfolios', 'POST', {
    name: 'Fake new', slug: 'fake-new', storage_prefix: sourcePrefix,
  }, cookie), f.env)
  assert.equal(created.status, 201)
  const id = (await created.json()).portfolioId
  const row = f.db.prepare('SELECT * FROM portfolios WHERE id=?').get(id)
  assert.equal(row.deletion_requested_at, null)
  assert.notEqual(row.storage_prefix, sourcePrefix)
  assert.equal(f.db.prepare('SELECT portfolio_id FROM portfolio_storage_allocations WHERE prefix=?').get(row.storage_prefix).portfolio_id, id)
  await mark(f, cookie)
  const listed = await worker.fetch(request('/api/admin/portfolios', 'GET', undefined, cookie), f.env)
  assert.equal(listed.status, 200)
  const data = await listed.json()
  assert.equal(data.portfolios.length, 3)
  assert.notEqual(data.portfolios.find(p => p.id === 1).deletion_requested_at, null)
  assert.equal((await serve(f, 'fixture-two')).status, 200)
})

test('stale editing cannot change metadata after marking', async t => {
  const f = fixture(t), cookie = await login(f), point = gate()
  f.state.afterFirst = async query => {
    if (query.startsWith('SELECT id, slug, storage_prefix')) await pause(point)
  }
  const pending = edit(f, cookie)
  await point.started.promise
  try { await mark(f, cookie) }
  finally { point.resume.resolve() }
  assert.equal((await pending).status, 409)
  assert.equal(portfolio(f).slug, 'fixture-one')
})

test('stale publishing cannot republish after marking during HTML validation', async t => {
  const f = fixture(t), cookie = await login(f), point = gate()
  f.state.getGate = point
  const pending = status(f, cookie, 'published')
  await point.started.promise
  try { await mark(f, cookie) }
  finally { point.resume.resolve() }
  assert.equal((await pending).status, 409)
  assert.equal(portfolio(f).status, 'draft')
  assert.equal(portfolio(f).publication_revision, 1)
})

test('stale unpublishing cannot modify the frozen row or revision', async t => {
  const f = fixture(t), cookie = await login(f), point = gate()
  f.state.beforeRun = async query => {
    if (query.startsWith('UPDATE portfolios SET status')) await pause(point)
  }
  const pending = status(f, cookie, 'draft')
  await point.started.promise
  try { await mark(f, cookie) }
  finally { point.resume.resolve() }
  assert.equal((await pending).status, 409)
  assert.equal(portfolio(f).publication_revision, 1)
})

for (const folder of [false, true]) {
  const kind = folder ? 'folder' : 'HTML'
  test(`${kind}: deletion during destination validation prevents registration and every PUT`, async t => {
    const f = fixture(t), cookie = await login(f), point = gate()
    f.state.listGate = point
    const pending = upload(f, cookie, folder)
    await point.started.promise
    try { await mark(f, cookie) }
    finally { point.resume.resolve() }
    assert.equal((await pending).status, 409)
    assert.equal(uploads(f).length, 0)
    assert.equal(f.state.puts, 0)
  })

  test(`${kind}: in-flight writes may settle after marking but activation is fenced with 409`, async t => {
    const f = fixture(t), cookie = await login(f), point = gate()
    f.state.putGate = point
    const pending = upload(f, cookie, folder)
    await point.started.promise
    assert.equal(uploads(f)[0].upload_state, 'uploading')
    try { await mark(f, cookie) }
    finally { point.resume.resolve() }
    assert.equal((await pending).status, 409)
    assert.equal(portfolio(f).storage_prefix, sourcePrefix)
    assert.equal(portfolio(f).status, 'draft')
    assert.equal(uploads(f)[0].upload_state, 'uncertain')
    assert.equal(uploads(f)[0].writer_state, 'closed')
    assert.ok(f.state.writesAfterMark > 0, 'Marking is not proof of writer settlement')
    assert.equal(f.state.puts, 1, 'Only the already-issued PUT may finish after marking')
    assert.ok(f.state.objects.has(uploads(f)[0].prefix + (folder ? 'index.html' : 'style.css')))
    assert.equal(f.state.objects.get(sourcePrefix + 'index.html'), 'OLD')
  })

  test(`${kind}: marking wins immediately before the activation transaction`, async t => {
    const f = fixture(t), cookie = await login(f), point = gate()
    f.state.beforeBatch = async statements => {
      if (/UPDATE portfolios\s+SET storage_prefix/.test(statements[0].sql)) await pause(point)
    }
    const pending = upload(f, cookie, folder)
    await point.started.promise
    try { await mark(f, cookie) }
    finally { point.resume.resolve() }
    assert.equal((await pending).status, 409)
    assert.equal(uploads(f)[0].upload_state, 'conflicted')
    assert.equal(portfolio(f).storage_prefix, sourcePrefix)
  })

  test(`${kind}: activation winning first is preserved, then marking unpublishes it`, async t => {
    const f = fixture(t), cookie = await login(f)
    assert.equal((await upload(f, cookie, folder)).status, 200)
    const selected = portfolio(f).storage_prefix
    assert.equal(uploads(f)[0].upload_state, 'completed')
    assert.equal((await mark(f, cookie)).status, 202)
    assert.equal(portfolio(f).storage_prefix, selected)
    assert.equal(portfolio(f).status, 'draft')
    assert.equal(uploads(f)[0].upload_state, 'completed')
    assert.ok(f.state.objects.has(selected + 'index.html'))
  })
}

test('failed in-flight PUT after marking retains uncertain ownership without activation', async t => {
  const f = fixture(t), cookie = await login(f), point = gate()
  f.state.putGate = point
  const pending = upload(f, cookie, true)
  await point.started.promise
  try { await mark(f, cookie); f.state.fail = 'write' }
  finally { point.resume.resolve() }
  assert.equal((await pending).status, 500)
  assert.equal(uploads(f)[0].upload_state, 'uncertain')
  assert.equal(uploads(f)[0].writer_state, 'uncertain')
  assert.equal(uploads(f)[0].writer_closed_at, null)
  assert.equal(portfolio(f).storage_prefix, sourcePrefix)
  assert.equal(jobs(f).length, 1)
})

test('lost registration response leaves durable unresolved ownership discoverable after marking', async t => {
  const f = fixture(t), cookie = await login(f)
  f.state.fail = 'registration-response-lost'
  assert.equal((await upload(f, cookie, true)).status, 503)
  assert.equal(uploads(f)[0].upload_state, 'uploading')
  assert.equal(uploads(f)[0].writer_state, 'open')
  assert.equal(f.state.puts, 0)
  f.state.fail = null
  assert.equal((await mark(f, cookie)).status, 202)
  assert.equal(uploads(f)[0].portfolio_id, jobs(f)[0].portfolio_id)
  assert.equal(uploads(f)[0].upload_state, 'uploading')
})

test('database triggers fence stale queries, new allocations, replacement bypasses and premature deletion', async t => {
  const f = fixture(t), cookie = await login(f)
  await mark(f, cookie)
  for (const sql of [
    "UPDATE portfolios SET status='published' WHERE id=1",
    "UPDATE portfolios SET name='Fake replacement' WHERE id=1",
    'UPDATE portfolios SET deletion_requested_at=NULL WHERE id=1',
    "UPDATE portfolios SET storage_prefix='portfolio-initial/other/' WHERE id=1",
    "INSERT OR REPLACE INTO portfolios(id,name,slug,storage_prefix) VALUES(1,'Fake','new','new/')",
    "INSERT OR REPLACE INTO portfolios(name,slug,storage_prefix) VALUES('Fake','fixture-one','new/')",
    "INSERT OR REPLACE INTO portfolios(name,slug,storage_prefix) VALUES('Fake','new','portfolios/fixture-one/')",
  ]) assert.throws(() => f.db.exec(sql), /Portfolio is pending deletion/)
  assert.throws(() => f.db.exec('DELETE FROM portfolios WHERE id=1'), /cleanup is not enabled/)
  assert.throws(() => f.db.prepare(`INSERT INTO portfolio_storage_allocations
    (prefix,portfolio_id,allocation_kind,upload_state) VALUES(?,1,'folder','uploading')`)
    .run('portfolio-versions/1/' + uuid(400) + '/'), /Portfolio is pending deletion/)
  assert.equal(jobs(f).length, 1)
})

test('job records reject unmarked owners, mutation, replacement and removal', async t => {
  const f = fixture(t), cookie = await login(f)
  const insert = f.db.prepare('INSERT INTO portfolio_deletion_jobs(id,portfolio_id,requested_by) VALUES(?,?,?)')
  assert.throws(() => insert.run(uuid(500), 1, 'primary-admin'), /requires a pending portfolio/)
  assert.throws(() => insert.run(uuid(500), 999, 'primary-admin'), /requires a pending portfolio/)
  await mark(f, cookie)
  const saved = { ...jobs(f)[0] }
  assert.throws(() => f.db.exec("UPDATE portfolio_deletion_jobs SET requested_by='other'"), /receipt is immutable/)
  assert.throws(() => f.db.exec('DELETE FROM portfolio_deletion_jobs'), /receipt must be retained/)
  assert.throws(() => f.db.prepare('INSERT OR REPLACE INTO portfolio_deletion_jobs(id,portfolio_id,requested_by) VALUES(?,?,?)')
    .run(saved.id, 1, 'other'), /identity already exists/)
  assert.throws(() => f.db.prepare('INSERT OR REPLACE INTO portfolio_deletion_jobs(id,portfolio_id,requested_by) VALUES(?,?,?)')
    .run(uuid(600), 1, 'other'), /identity already exists/)
  assert.deepEqual({ ...jobs(f)[0] }, saved)
})

test('marker constraints reject invalid values and published marking outside the atomic endpoint', t => {
  const f = fixture(t)
  for (const value of [-1, 1.5, 'invalid']) assert.throws(() => f.db.prepare("UPDATE portfolios SET status='draft',deletion_requested_at=? WHERE id=1").run(value))
  assert.throws(() => f.db.exec('UPDATE portfolios SET deletion_requested_at=1 WHERE id=1'))
  assert.equal(portfolio(f).deletion_requested_at, null)
})

for (const folder of [false, true]) {
  const kind = folder ? 'folder' : 'HTML'
  test(`writer ${kind}: registration is atomic and closure precedes activation under protocol 1`, async t => {
    const f = fixture(t), cookie = await login(f)
    f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1 WHERE id=1')
    f.state.beforeBatch = async statements => {
      if (/SET storage_prefix/.test(statements[0].sql)) {
        const row = uploads(f)[0]
        assert.equal(row.writer_protocol_version, 1)
        assert.equal(row.writer_state, 'closed')
        assert.ok(Number.isInteger(row.writer_closed_at))
        assert.equal(f.state.puts, 2)
      }
    }
    assert.equal((await upload(f, cookie, folder)).status, 200)
    const row = uploads(f)[0]
    assert.equal(row.upload_state, 'completed')
    assert.equal(row.writer_state, 'closed')
    assert.equal(row.source_prefix, sourcePrefix)
    assert.equal(portfolio(f).storage_prefix, row.prefix)
    assert.equal(f.state.objects.get(sourcePrefix + 'index.html'), 'OLD')
  })

  for (const failure of ['write', 'write-after-first', 'write-response-lost']) {
    test(`writer ${kind}: ${failure} never records closure or activates`, async t => {
      const f = fixture(t), cookie = await login(f)
      f.state.fail = failure
      assert.equal((await upload(f, cookie, folder)).status, 500)
      const row = uploads(f)[0]
      assert.equal(row.writer_state, 'uncertain')
      assert.equal(row.writer_closed_at, null)
      assert.equal(row.upload_state, 'uncertain')
      assert.equal(portfolio(f).storage_prefix, sourcePrefix)
      const written = [...f.state.objects.keys()].filter(key => key.startsWith(row.prefix))
      assert.equal(written.length, failure === 'write' ? 0 : 1)
      // Empty or present objects are both compatible with an uncertain PUT.
      assert.equal((await mark(f, cookie)).status, 202)
      assert.equal(uploads(f)[0].writer_state, 'uncertain')
    })
  }

  test(`writer ${kind}: pending PUT remains open until acknowledgement, then stops at deletion`, async t => {
    const f = fixture(t), cookie = await login(f), point = gate()
    f.state.putGate = point
    const pending = upload(f, cookie, folder)
    await point.started.promise
    assert.equal(uploads(f)[0].writer_state, 'open')
    assert.equal(uploads(f)[0].writer_closed_at, null)
    try {
      await mark(f, cookie)
      assert.equal(uploads(f)[0].writer_state, 'open')
      // Other requests and the deletion marker do not settle this writer.
      assert.equal((await worker.fetch(request('/api/admin/portfolios', 'GET', undefined, cookie), f.env)).status, 200)
      assert.equal(uploads(f)[0].writer_state, 'open')
    } finally { point.resume.resolve() }
    assert.equal((await pending).status, 409)
    assert.equal(f.state.puts, 1)
    assert.equal(uploads(f)[0].writer_state, 'closed')
  })

  test(`writer ${kind}: deletion immediately before PUT prevents issuance and closes a zero-write allocation`, async t => {
    const f = fixture(t), cookie = await login(f), point = gate()
    f.state.beforeFirst = async query => {
      if (query.includes('FROM portfolio_storage_allocations AS allocation')) await pause(point)
    }
    const pending = upload(f, cookie, folder)
    await point.started.promise
    try { await mark(f, cookie) }
    finally { point.resume.resolve() }
    assert.equal((await pending).status, 409)
    assert.equal(f.state.puts, 0)
    assert.equal(uploads(f)[0].writer_state, 'closed')
  })

  for (const failure of ['writer-update', 'writer-false-result', 'writer-response-lost', 'writer-read']) {
    test(`writer ${kind}: ${failure} preserves the old active version and truthful settlement`, async t => {
      const f = fixture(t), cookie = await login(f)
      f.state.fail = failure
      assert.equal((await upload(f, cookie, folder)).status, failure === 'writer-false-result' ? 503 : 500)
      const row = uploads(f)[0]
      assert.equal(row.writer_state, ['writer-update', 'writer-false-result'].includes(failure) ? 'open' : 'closed')
      assert.equal(row.writer_closed_at === null, row.writer_state === 'open')
      assert.equal(portfolio(f).storage_prefix, sourcePrefix)
      assert.equal(f.state.puts, failure === 'writer-read' ? 0 : 2)
    })
  }

  for (const failure of ['activation', 'activation-response-lost']) {
    test(`writer ${kind}: ${failure} keeps confirmed writer closure separate from activation outcome`, async t => {
      const f = fixture(t), cookie = await login(f)
      f.state.fail = failure
      assert.equal((await upload(f, cookie, folder)).status, 500)
      const row = uploads(f)[0]
      assert.equal(row.writer_state, 'closed')
      assert.ok(Number.isInteger(row.writer_closed_at))
      assert.equal(row.upload_state, failure === 'activation' ? 'uncertain' : 'completed')
      assert.equal(portfolio(f).storage_prefix, failure === 'activation' ? sourcePrefix : row.prefix)
    })
  }
}

for (const failure of ['source-read', 'source-read-after-first']) {
  test(`writer HTML: ${failure} closes only the already-settled writes`, async t => {
    const f = fixture(t), cookie = await login(f)
    f.state.objects.set(sourcePrefix + 'next.css', 'NEXT')
    f.state.fail = failure
    assert.equal((await upload(f, cookie, false)).status, 500)
    assert.equal(uploads(f)[0].writer_state, 'closed')
    assert.equal(uploads(f)[0].upload_state, 'failed')
    assert.equal(f.state.puts, failure === 'source-read' ? 0 : 1)
    assert.equal(portfolio(f).storage_prefix, sourcePrefix)
  })
}

test('writer closure is safe when deletion commits before its D1 checkpoint', async t => {
  const f = fixture(t), cookie = await login(f), point = gate()
  f.state.beforeRun = async query => {
    if (query.startsWith('UPDATE portfolio_storage_allocations SET writer_state')) await pause(point)
  }
  const pending = upload(f, cookie, true)
  await point.started.promise
  assert.equal(f.state.puts, 2)
  assert.equal(uploads(f)[0].writer_state, 'open')
  try { await mark(f, cookie) }
  finally { point.resume.resolve() }
  assert.equal((await pending).status, 409)
  assert.equal(uploads(f)[0].writer_state, 'closed')
  assert.equal(portfolio(f).storage_prefix, sourcePrefix)
})

test('an interrupted writer remains unresolved across later requests; retries use a fresh prefix', async t => {
  const f = fixture(t), cookie = await login(f)
  const abandoned = registerTracked(f, 700)
  f.db.prepare('UPDATE portfolio_storage_allocations SET updated_at=0 WHERE prefix=?').run(abandoned)
  assert.equal((await upload(f, cookie, true)).status, 200)
  assert.notEqual(portfolio(f).storage_prefix, abandoned)
  const row = f.db.prepare('SELECT * FROM portfolio_storage_allocations WHERE prefix=?').get(abandoned)
  assert.equal(row.writer_state, 'open')
  assert.equal(row.writer_closed_at, null)
  assert.equal(row.updated_at, 0)
  await mark(f, cookie)
  assert.equal(f.db.prepare('SELECT writer_state FROM portfolio_storage_allocations WHERE prefix=?').get(abandoned).writer_state, 'open')
})

test('initial creation registers a closed zero-write writer even after protocol cutover', async t => {
  const f = fixture(t), cookie = await login(f)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1 WHERE id=1')
  const response = await worker.fetch(request('/api/admin/portfolios', 'POST', { name: 'Fake tracked', slug: 'fake-tracked' }, cookie), f.env)
  assert.equal(response.status, 201)
  const id = (await response.json()).portfolioId
  const row = f.db.prepare('SELECT * FROM portfolio_storage_allocations WHERE portfolio_id=?').get(id)
  assert.equal(row.writer_protocol_version, 1)
  assert.equal(row.writer_state, 'closed')
  assert.ok(Number.isInteger(row.writer_closed_at))
  assert.equal(f.state.puts, 0)
})

test('protocol gate starts compatible, fences legacy registration and activation after cutover, and cannot be reset', t => {
  const f = fixture(t)
  const policy = () => f.db.prepare('SELECT minimum_protocol_version n FROM portfolio_storage_writer_policy').get().n
  assert.equal(policy(), 0)
  const legacy = trackedPrefix(701)
  const insert = f.db.prepare(`INSERT INTO portfolio_storage_allocations
    (prefix,portfolio_id,allocation_kind,upload_state) VALUES(?,1,'folder','uploading')`)
  insert.run(legacy)
  assert.equal(f.db.prepare('SELECT writer_state FROM portfolio_storage_allocations WHERE prefix=?').get(legacy).writer_state, null)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1 WHERE id=1')
  assert.throws(() => insert.run(trackedPrefix(702)), /protocol upgrade required/)
  assert.throws(() => f.db.prepare('UPDATE portfolios SET storage_prefix=? WHERE id=1').run(legacy), /protocol upgrade required/)
  const current = registerTracked(f, 703)
  assert.throws(() => f.db.prepare('UPDATE portfolios SET storage_prefix=? WHERE id=1').run(current), /protocol upgrade required/)
  f.db.prepare("UPDATE portfolio_storage_allocations SET writer_state='closed',writer_closed_at=unixepoch() WHERE prefix=?").run(current)
  f.db.prepare('UPDATE portfolios SET storage_prefix=? WHERE id=1').run(current)
  for (const sql of [
    'UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=0 WHERE id=1',
    'UPDATE portfolio_storage_writer_policy SET id=2 WHERE id=1',
    'DELETE FROM portfolio_storage_writer_policy',
    'INSERT OR REPLACE INTO portfolio_storage_writer_policy VALUES(1,0)',
  ]) assert.throws(() => f.db.exec(sql))
  assert.equal(policy(), 1)
})

test('protocol cutover during an open writer prevents additional PUTs without inventing uncertainty', async t => {
  const f = fixture(t), cookie = await login(f), point = gate()
  f.state.putGate = point
  const pending = upload(f, cookie, true)
  await point.started.promise
  try { f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=2 WHERE id=1') }
  finally { point.resume.resolve() }
  assert.equal((await pending).status, 503)
  assert.equal(f.state.puts, 1)
  assert.equal(uploads(f)[0].writer_state, 'closed')
  assert.equal(portfolio(f).storage_prefix, sourcePrefix)
})

test('writer states and identity are retained; historical records cannot be silently enrolled or closed', t => {
  const f = fixture(t)
  const old = f.owned[0].prefix
  assert.throws(() => f.db.prepare("UPDATE portfolio_storage_allocations SET writer_protocol_version=1,writer_token=?,writer_state='open' WHERE prefix=?").run('a'.repeat(32), old), /identity is immutable|Invalid storage writer transition/)
  assert.throws(() => f.db.prepare("UPDATE portfolio_storage_allocations SET writer_state='closed',writer_closed_at=unixepoch() WHERE prefix=?").run(old))
  for (const [number, terminal] of [[710, 'closed'], [711, 'uncertain']]) {
    const p = registerTracked(f, number)
    f.db.prepare(`UPDATE portfolio_storage_allocations SET writer_state=?,
      writer_closed_at=CASE WHEN ?='closed' THEN unixepoch() ELSE NULL END WHERE prefix=?`).run(terminal, terminal, p)
    for (const next of ['open', terminal === 'closed' ? 'uncertain' : 'closed']) {
      assert.throws(() => f.db.prepare(`UPDATE portfolio_storage_allocations SET writer_state=?,
        writer_closed_at=CASE WHEN ?='closed' THEN unixepoch() ELSE NULL END WHERE prefix=?`).run(next, next, p), /Invalid storage writer transition/)
    }
    assert.throws(() => f.db.prepare('UPDATE portfolio_storage_allocations SET writer_token=? WHERE prefix=?').run('b'.repeat(32), p), /identity is immutable/)
    assert.throws(() => f.db.prepare('UPDATE portfolio_storage_allocations SET writer_protocol_version=0 WHERE prefix=?').run(p), /identity is immutable/)
    assert.throws(() => f.db.prepare('DELETE FROM portfolio_storage_allocations WHERE prefix=?').run(p), /ownership must be retained/)
  }
  const closed = trackedPrefix(710)
  assert.throws(() => f.db.prepare('UPDATE portfolio_storage_allocations SET writer_closed_at=writer_closed_at+1 WHERE prefix=?').run(closed), /Invalid storage writer transition/)
})

test('new tracked allocations reject missing, duplicate or invalid writer identity and incorrect initial states', t => {
  const f = fixture(t)
  const insert = f.db.prepare(`INSERT INTO portfolio_storage_allocations
    (prefix,portfolio_id,allocation_kind,upload_state,writer_protocol_version,writer_token,writer_state,writer_closed_at)
    VALUES(?,1,'folder','uploading',1,?,?,?)`)
  for (const [index, args] of [
    [null, 'open', null], ['bad', 'open', null], ['g'.repeat(32), 'open', null], ['a'.repeat(32) + '\0extra', 'open', null],
    ['a'.repeat(32), null, null], ['a'.repeat(32), 'closed', 1],
    ['a'.repeat(32), 'uncertain', null], ['a'.repeat(32), 'open', 1],
  ].entries()) assert.throws(() => insert.run(trackedPrefix(720 + index), ...args))
  registerTracked(f, 730, 'c'.repeat(32))
  assert.throws(() => insert.run(trackedPrefix(731), 'c'.repeat(32), 'open', null), /UNIQUE constraint failed/)
})

test('an ambiguous PUT plus failed settlement recording leaves an open writer, never a false closure', async t => {
  const f = fixture(t), cookie = await login(f)
  f.state.fail = 'write'
  f.state.beforeRun = async query => {
    if (query.startsWith('UPDATE portfolio_storage_allocations SET writer_state')) throw new Error('Injected unavailable settlement storage')
  }
  assert.equal((await upload(f, cookie, true)).status, 500)
  assert.equal(uploads(f)[0].writer_state, 'open')
  assert.equal(uploads(f)[0].writer_closed_at, null)
  assert.equal(uploads(f)[0].upload_state, 'uncertain')
  assert.equal(portfolio(f).storage_prefix, sourcePrefix)
})

test('cutover rejects old initial-allocation SQL atomically without creating an untracked portfolio', async t => {
  const f = fixture(t)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1 WHERE id=1')
  const initial = 'portfolio-initial/' + uuid(750) + '/'
  await assert.rejects(f.env.bitreca_db.batch([
    f.env.bitreca_db.prepare('INSERT INTO portfolios(name,slug,storage_prefix) VALUES(?,?,?)').bind('Fake old worker', 'fake-old-worker', initial),
    f.env.bitreca_db.prepare(`INSERT INTO portfolio_storage_allocations
      (prefix,portfolio_id,allocation_kind,upload_state)
      SELECT storage_prefix,id,'initial','completed' FROM portfolios WHERE storage_prefix=?`).bind(initial),
  ]), /protocol upgrade required/)
  assert.equal(f.db.prepare('SELECT count(*) n FROM portfolios').get().n, 2)
  assert.equal(f.db.prepare('SELECT count(*) n FROM portfolio_storage_allocations WHERE prefix=?').get(initial).n, 0)
})

test('a PUT permitted just before marking remains tracked open until it settles', async t => {
  const f = fixture(t), cookie = await login(f), permission = gate(), writing = gate()
  f.state.afterFirst = async query => {
    if (query.includes('FROM portfolio_storage_allocations AS allocation')) await pause(permission)
  }
  f.state.putGate = writing
  const pending = upload(f, cookie, true)
  await permission.started.promise
  try { await mark(f, cookie) }
  finally { permission.resume.resolve() }
  await writing.started.promise
  try {
    assert.equal(uploads(f)[0].writer_state, 'open')
    assert.equal(uploads(f)[0].writer_closed_at, null)
  } finally { writing.resume.resolve() }
  assert.equal((await pending).status, 409)
  assert.equal(f.state.puts, 1)
  assert.equal(f.state.writesAfterMark, 1)
  assert.equal(uploads(f)[0].writer_state, 'closed')
})

for (const folder of [false, true]) {
  test(`overlapping ${folder ? 'folder' : 'HTML'} uploads keep independent closed writers and one activation`, async t => {
    const f = fixture(t), cookie = await login(f), point = gate()
    f.state.putGate = point
    const pending = upload(f, cookie, folder)
    await point.started.promise
    let selected
    try {
      assert.equal((await upload(f, cookie, folder)).status, 200)
      selected = portfolio(f).storage_prefix
    } finally { point.resume.resolve() }
    assert.equal((await pending).status, 409)
    assert.equal(portfolio(f).storage_prefix, selected)
    assert.equal(uploads(f).length, 2)
    assert.ok(uploads(f).every(row => row.writer_state === 'closed'))
    assert.equal(new Set(uploads(f).map(row => row.writer_token)).size, 2)
    assert.deepEqual(uploads(f).map(row => row.upload_state).sort(), ['completed', 'conflicted'])
  })
}

// Phase 2B Step 2: real SQLite, fake portfolios, no storage operations.
const cleanupToken = number => number.toString(16).padStart(32, '0')
async function signedProtocolFixture(f, number = 2200, storageScope = 'fixture-isolated-bucket') {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  f.trust = { publicKeySpki: new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)), storageScope }
  const report = { version: 1, id: uuid(number), storage_scope: f.trust.storageScope, writer_protocol: 1,
    deployment_sha256: '1'.repeat(64), evidence_sha256: '2'.repeat(64), legacy_writers_settled: true,
    verified_at: f.db.prepare('SELECT unixepoch() AS now').get().now }
  f.signReport = async value => {
    const payload = JSON.stringify(value)
    return { payload, signature: new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(payload))) }
  }
  f.protocolEvidence = await f.signReport(report)
  assert.equal((await registerStorageProtocolVerification(f.env.bitreca_db, f.trust, f.protocolEvidence)).state, 'recorded')
  return report
}
async function cleanupFixture(t, states = [], sourceOverride = null, migrationLimit = migrations.length, storageScope) {
  const f = fixture(t, migrationLimit)
  let now = Math.floor(Date.now() / 1000)
  f.db.function('unixepoch', () => now)
  f.advance = seconds => { now += seconds }
  const prefix = 'portfolio-initial/' + uuid(900) + '/'
  if (migrationLimit >= 12) {
    // Test-only future cutover; no real policy or resource is touched.
    f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
    await signedProtocolFixture(f, 2200, storageScope)
    f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix,storage_birth_token) VALUES(3,?,?,?,?)')
      .run('Fake new portfolio', 'fixture-new', prefix, cleanupToken(900))
  } else {
    f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix) VALUES(3,?,?,?)')
      .run('Fake new portfolio', 'fixture-new', prefix)
  }
  f.db.prepare(`INSERT INTO portfolio_storage_allocations
    (prefix,portfolio_id,allocation_kind,upload_state,writer_protocol_version,writer_token,writer_state,writer_closed_at)
    VALUES(?,3,'initial','completed',1,?,'closed',unixepoch())`).run(prefix, cleanupToken(900))
  for (const [index, state] of states.entries()) {
    const destination = 'portfolio-versions/3/' + uuid(901 + index) + '/'
    f.db.prepare(`INSERT INTO portfolio_storage_allocations
      (prefix,portfolio_id,allocation_kind,upload_state,source_prefix,writer_protocol_version,writer_token,writer_state)
      VALUES(?,3,'folder','uploading',?,1,?,'open')`).run(destination, sourceOverride || prefix, cleanupToken(901 + index))
    const writerState = ['completed', 'failed', 'conflicted', 'upload-uncertain'].includes(state) ? 'closed' : state
    if (writerState !== 'open') f.db.prepare(`UPDATE portfolio_storage_allocations
      SET writer_state=?, writer_closed_at=CASE WHEN ?='closed' THEN unixepoch() ELSE NULL END WHERE prefix=?`)
      .run(writerState, writerState, destination)
    if (state === 'completed') {
      f.db.prepare('UPDATE portfolios SET storage_prefix=? WHERE id=3').run(destination)
      f.db.prepare("UPDATE portfolio_storage_allocations SET upload_state='completed' WHERE prefix=?").run(destination)
      f.db.prepare('UPDATE portfolios SET storage_prefix=? WHERE id=3').run(prefix)
    } else if (['failed', 'conflicted', 'upload-uncertain'].includes(state)) {
      f.db.prepare('UPDATE portfolio_storage_allocations SET upload_state=? WHERE prefix=?')
        .run(state === 'upload-uncertain' ? 'uncertain' : state, destination)
    }
  }
 f.cookie = await login(f)

const markResponse = await mark(f, f.cookie, 3)


assert.equal(markResponse.status, 202)
  f.jobId = jobs(f)[0].id
  f.prefix = prefix
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  f.certify = migrationLimit >= 12 ? () => attestPortfolioInventory(f.env.bitreca_db, f.trust, f.jobId) : async () => f.db.prepare(`INSERT INTO portfolio_deletion_inventory
    (job_id,storage_prefix,allocation_count,verified_by,evidence_reference)
    VALUES(?,?,?,'fixture-reviewer','fixture-independent-inventory')`)
    .run(f.jobId, prefix, 1 + states.length)
  f.claim = (number = 1) => claimCleanupJob(f.env.bitreca_db, f.jobId, cleanupToken(number))
  f.status = () => getPortfolioDeletionStatus(f.env.bitreca_db, f.jobId)
  return f
}

test('0009 initializes existing receipts without changing receipts, ownership, or settlement', t => {
  const f = fixture(t)
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  for (const file of migrations.slice(0, 8)) db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'))
  db.exec(`INSERT INTO portfolios(id,name,slug,storage_prefix,status,deletion_requested_at)
    VALUES(1,'Fake','fake','portfolios/fake/','draft',1);
    INSERT INTO portfolio_deletion_jobs(id,portfolio_id,requested_by)
    VALUES('${uuid(1000)}',1,'fixture-admin')`)
  const receipts = db.prepare('SELECT * FROM portfolio_deletion_jobs').all()
  db.exec(readFileSync(new URL('../migrations/' + migrations[8], import.meta.url), 'utf8'))
  assert.deepEqual(db.prepare('SELECT * FROM portfolio_deletion_jobs').all(), receipts)
  assert.equal(db.prepare('SELECT phase FROM portfolio_deletion_executions').get().phase, 'pending')
  assert.equal(db.prepare('SELECT count(*) AS n FROM portfolio_deletion_inventory').get().n, 0)
  assert.equal(f.state.puts + f.state.lists + f.state.reads, 0)
})

test('cleanup requires independent complete inventory even for exclusively tracked closed writers', async t => {
  const f = await cleanupFixture(t, ['closed'])
  assert.equal((await f.status()).error.code, 'INVENTORY_INCOMPLETE')
  assert.equal(await f.claim(), null)
  await f.certify()
  assert.equal((await f.status()).eligible_for_preparation, true)
  assert.ok(await f.claim())
  assert.equal(f.state.puts + f.state.lists + f.state.reads, 0)
})

for (const [writer, code] of [['open', 'WRITERS_OPEN'], ['uncertain', 'WRITER_UNCERTAIN']]) {
test('cleanup blocks ' + writer + ' writers and refuses attestation regardless of elapsed time', async t => {
    const f = await cleanupFixture(t, [writer])
    assert.equal((await f.certify()).state, 'blocked')
    f.advance(100000)
    assert.equal((await f.status()).error.code, code)
    assert.equal(await f.claim(), null)
  })
}

test('cleanup allows definitively closed writers with failed, conflicted, uncertain, or interrupted upload records', async t => {
  const f = await cleanupFixture(t, ['completed', 'failed', 'conflicted', 'upload-uncertain', 'closed'])
  await f.certify()
  const lease = await f.claim()
  assert.deepEqual(await prepareCleanupItems(f.env.bitreca_db, lease, 2), { inserted: 2 })
  assert.equal(await finishCleanupPreparation(f.env.bitreca_db, lease), false)
  assert.deepEqual(await prepareCleanupItems(f.env.bitreca_db, lease, 2), { inserted: 2 })
  assert.deepEqual(await prepareCleanupItems(f.env.bitreca_db, lease, 2), { inserted: 2 })
  assert.deepEqual(await prepareCleanupItems(f.env.bitreca_db, lease, 2), { inserted: 0 })
  assert.equal(await finishCleanupPreparation(f.env.bitreca_db, lease), true)
  const progress = await f.status()
  assert.equal(progress.phase, 'prepared')
  assert.equal(progress.progress.prepared_allocations, 6)
  assert.equal(progress.progress.deleted_objects, 0)
  assert.equal(progress.cleanup_enabled, false)
  assert.equal(f.state.puts + f.state.lists + f.state.reads, 0)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolios').get().n, 3)
})

test('legacy active and historical source prefixes cannot become cleanup ownership through an attestation', async t => {
  const f = fixture(t)
  registerTracked(f, 990)
  f.db.exec("UPDATE portfolio_storage_allocations SET writer_state='closed',writer_closed_at=unixepoch() WHERE portfolio_id=1")
  const cookie = await login(f)
  await mark(f, cookie)
  const jobId = jobs(f)[0].id
  assert.equal((await getPortfolioDeletionStatus(f.env.bitreca_db, jobId)).error.code, 'PROTOCOL_CUTOVER_REQUIRED')
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  assert.throws(() => f.db.prepare(`INSERT INTO portfolio_deletion_inventory(job_id,storage_prefix,allocation_count,verified_by,evidence_reference)
    VALUES(?,?,1,'fixture','not-ownership-proof')`).run(jobId, sourcePrefix), /trusted inventory/)
  assert.equal((await getPortfolioDeletionStatus(f.env.bitreca_db, jobId)).error.code, 'LEGACY_STORAGE_UNVERIFIED')
  assert.equal(await claimCleanupJob(f.env.bitreca_db, jobId, cleanupToken(1)), null)
})

test('historical untracked initial allocations block cleanup and remain unclaimed', async t => {
  const f = fixture(t)
  const oldPrefix = f.owned[0].prefix
  f.db.prepare('UPDATE portfolios SET storage_prefix=? WHERE id=2').run(oldPrefix)
  const cookie = await login(f)
  await mark(f, cookie, 2)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  const jobId = jobs(f)[0].id
  assert.equal((await getPortfolioDeletionStatus(f.env.bitreca_db, jobId)).error.code, 'UNTRACKED_ALLOCATION')
  assert.equal(await claimCleanupJob(f.env.bitreca_db, jobId, cleanupToken(1)), null)
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_storage_allocations').all(), f.owned)
})

test('claims are exclusive, response-loss retries reuse the lease, and takeover fences the old generation', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  f.state.fail = 'cleanup-claim-response-lost'
  await assert.rejects(f.claim(), /response loss/)
  const lease = await f.claim()
  assert.equal(lease.generation, 1)
  const results = await Promise.all([f.claim(), f.claim(2)])
  assert.deepEqual(results[0], lease)
  assert.equal(results[1], null)
  assert.equal((await f.status()).attempts, 1)
  f.advance(61)
  assert.equal(await f.claim(), null)
  const replacement = await f.claim(2)
  assert.equal(replacement.generation, 2)
  assert.equal(await renewCleanupLease(f.env.bitreca_db, lease), false)
  assert.equal(await prepareCleanupItems(f.env.bitreca_db, lease), null)
  assert.equal(await recordCleanupRetry(f.env.bitreca_db, lease, 'OUTCOME_UNKNOWN'), false)
  assert.equal(await finishCleanupPreparation(f.env.bitreca_db, lease), false)
  assert.equal(await renewCleanupLease(f.env.bitreca_db, replacement), true)
  assert.equal(await renewCleanupLease(f.env.bitreca_db, { ...replacement, generation: lease.generation }), false)
})

test('ownership conflicts revoke eligibility even during a lease and block all subsequent checkpoints', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const lease = await f.claim()
  // Simulate a conflicting foreign legacy record imported after the claim.
  f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix) VALUES(4,?,?,?)')
    .run('Fake conflict', 'fixture-conflict', f.prefix + 'nested/')
  assert.equal((await f.status()).error.code, 'OWNERSHIP_CONFLICT')
  assert.equal(await renewCleanupLease(f.env.bitreca_db, lease), false)
  assert.equal(await prepareCleanupItems(f.env.bitreca_db, lease), null)
  assert.equal(await f.claim(2), null)
})

test('retry checkpoints are fenced, sanitized, durable, and enforce backoff', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const lease = await f.claim()
  assert.equal(await recordCleanupRetry(f.env.bitreca_db, lease, 'PREPARATION_FAILED'), true)
  assert.equal(await recordCleanupRetry(f.env.bitreca_db, lease, 'PREPARATION_FAILED'), false)
  assert.equal((await f.status()).retries, 1)
  assert.equal((await f.status()).phase, 'retry_wait')
  assert.equal(await f.claim(2), null)
  f.advance(61)
  assert.ok(await f.claim(2))
  await assert.rejects(recordCleanupRetry(f.env.bitreca_db, lease, 'raw sensitive exception'), /Invalid cleanup error/)
})

test('manifests replay exact intent after interruption without implying object deletion', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const lease = await f.claim()
  await prepareCleanupItems(f.env.bitreca_db, lease)
  const id = uuid(1100)
  const keys = [f.prefix + 'index.html', f.prefix + 'a.css']
  const planned = await planCleanupBatch(f.env.bitreca_db, lease, id, f.prefix, keys)
  assert.deepEqual(await planCleanupBatch(f.env.bitreca_db, lease, id, f.prefix, [...keys].reverse()), planned)
  await assert.rejects(planCleanupBatch(f.env.bitreca_db, lease, id, f.prefix, [f.prefix + 'other']), /identity conflicts/)
  await assert.rejects(planCleanupBatch(f.env.bitreca_db, lease, uuid(1101), f.prefix, keys), /already planned/)
  f.advance(61)
  assert.equal(await planCleanupBatch(f.env.bitreca_db, lease, id, f.prefix, keys), null)
  const resumed = await f.claim(2)
  assert.deepEqual(await planCleanupBatch(f.env.bitreca_db, resumed, id, f.prefix, keys), planned)
  const progress = await f.status()
  assert.equal(progress.progress.planned_batches, 1)
  assert.equal(progress.progress.planned_objects, 2)
  assert.equal(progress.progress.deleted_objects, 0)
  assert.equal(f.state.puts + f.state.lists + f.state.reads, 0)
})

test('historical unverified sources block even when the current active prefix has verified ownership', async t => {
  const f = await cleanupFixture(t, ['closed'], 'portfolios/unverified-history/')
  await f.certify()
  assert.equal((await f.status()).error.code, 'LEGACY_STORAGE_UNVERIFIED')
  assert.equal(await f.claim(), null)
})

test('preparation rolls back failed checkpoints and resumes committed response loss without skipping items', async t => {
  const f = await cleanupFixture(t, ['closed', 'closed'])
  await f.certify()
  const lease = await f.claim()
  f.state.fail = 'cleanup-checkpoint'
  await assert.rejects(prepareCleanupItems(f.env.bitreca_db, lease, 1), /checkpoint failure/)
  assert.equal((await f.status()).progress.prepared_allocations, 0)
  f.state.fail = 'cleanup-preparation-response-lost'
  await assert.rejects(prepareCleanupItems(f.env.bitreca_db, lease, 1), /response loss/)
  assert.equal((await f.status()).progress.prepared_allocations, 1)
  assert.deepEqual(await prepareCleanupItems(f.env.bitreca_db, lease), { inserted: 2 })
  assert.equal((await f.status()).progress.prepared_allocations, 3)
  assert.equal(await finishCleanupPreparation(f.env.bitreca_db, lease), true)
})

test('a committed manifest with a lost response is recovered exactly once under the same batch ID', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const lease = await f.claim()
  await prepareCleanupItems(f.env.bitreca_db, lease)
  const args = [f.env.bitreca_db, lease, uuid(1300), f.prefix, [f.prefix + 'index.html']]
  f.state.fail = 'cleanup-manifest-response-lost'
  await assert.rejects(planCleanupBatch(...args), /response loss/)
  assert.deepEqual(await planCleanupBatch(...args), { id: uuid(1300), objectCount: 1, state: 'planned' })
  assert.equal((await f.status()).progress.planned_batches, 1)
  assert.equal(f.state.puts + f.state.lists + f.state.reads, 0)
})

test('SQLite independently rejects invalid manifests, foreign items, replacement, and evidence mutation', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const lease = await f.claim()
  await prepareCleanupItems(f.env.bitreca_db, lease)
  const insert = f.db.prepare(`INSERT INTO portfolio_deletion_batches(id,job_id,prefix,keys_json,generation,lease_token)
    VALUES(?,?,?,?,?,?)`)
  for (const json of ['{', '{}', '[]', '[1]', JSON.stringify(['other/file']),
    JSON.stringify([f.prefix + 'x', f.prefix + 'x']), JSON.stringify(Array.from({ length: 101 }, (_, i) => f.prefix + i)),
    JSON.stringify([f.prefix + 'x'.repeat(1025)]), JSON.stringify([f.prefix + '\0'])]) {
    assert.throws(() => insert.run(uuid(1200), f.jobId, f.prefix, json, lease.generation, lease.token))
  }
  assert.throws(() => f.db.prepare(`INSERT INTO portfolio_deletion_items(job_id,prefix,generation,lease_token)
    VALUES(?,?,?,?)`).run(f.jobId, f.owned[0].prefix, lease.generation, lease.token), /eligible ownership/)
  insert.run(uuid(1200), f.jobId, f.prefix, JSON.stringify([f.prefix + 'x']), lease.generation, lease.token)
  assert.throws(() => f.db.exec('UPDATE portfolio_deletion_batches SET keys_json=\'[]\''), /immutable/)
  assert.throws(() => f.db.exec('DELETE FROM portfolio_deletion_items'), /retained/)
  assert.throws(() => f.db.exec('UPDATE portfolio_deletion_inventory SET allocation_count=99'), /immutable/)
  assert.throws(() => f.db.prepare('INSERT OR REPLACE INTO portfolio_deletion_executions(job_id) VALUES(?)').run(f.jobId), /already exists/)
  assert.throws(() => f.db.exec('UPDATE portfolio_deletion_executions SET generation=0'), /revision/)
  assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), [])
})

test('admin job reporting is authenticated, sanitized, read-only, and fails closed on D1 errors', async t => {
  const f = await cleanupFixture(t)
  const path = '/api/admin/portfolio-deletion-jobs/' + f.jobId
  const before = f.db.prepare('SELECT * FROM portfolio_deletion_executions').all()
  assert.equal((await worker.fetch(request(path), f.env)).status, 401)
  const response = await worker.fetch(request(path, 'GET', undefined, f.cookie), f.env)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const body = await response.text()
  assert.ok(!body.includes(f.prefix))
  assert.ok(!/lease_token|keys_json|verified_by|evidence_reference|writer_token/.test(body))
  assert.equal(JSON.parse(body).job.error.code, 'INVENTORY_INCOMPLETE')
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_deletion_executions').all(), before)
  assert.equal((await worker.fetch(request('/api/admin/portfolio-deletion-jobs/' + uuid(9999), 'GET', undefined, f.cookie), f.env)).status, 404)
  f.state.fail = 'job-lookup'
  const failed = await worker.fetch(request(path, 'GET', undefined, f.cookie), f.env)
  assert.equal(failed.status, 503)
  assert.ok(!(await failed.text()).includes('Injected'))
  assert.equal(f.state.puts + f.state.lists + f.state.reads, 0)
})

// Step 3 never receives a Cloudflare binding. Every destructive call below
// operates on this Map and asserts durable exact-key authorization first.
function cleanupR2(f) {
  const mock = {
    objects: new Map(f.state.objects), lists: [], deletes: [], listOverride: null,
    listGate: null, deleteGate: null, partialOnce: false, lostDeleteOnce: false,
    async list(options) {
      mock.lists.push({ ...options })
      assert.ok(options.limit >= 1 && options.limit <= 100)
      assert.equal(f.db.prepare('SELECT portfolio_id FROM portfolio_storage_allocations WHERE prefix=?').get(options.prefix).portfolio_id, 3)
      if (mock.listGate && mock.lists.length === 1) await pause(mock.listGate)
      if (mock.listOverride) return mock.listOverride(options)
      const keys = [...mock.objects.keys()].filter(key => key.startsWith(options.prefix)).sort()
      return { objects: keys.slice(0, options.limit).map(key => ({ key })),
        truncated: keys.length > options.limit, ...(keys.length > options.limit ? { cursor: 'fixture-cursor' } : {}) }
    },
    async delete(keys) {
      mock.deletes.push([...keys])
      assert.ok(keys.length >= 1 && keys.length <= 100)
      const manifests = f.db.prepare('SELECT prefix,keys_json FROM portfolio_deletion_batches WHERE job_id=?').all(f.jobId)
      assert.ok(manifests.some(batch => JSON.stringify(JSON.parse(batch.keys_json)) === JSON.stringify([...keys].sort())), 'Delete intent must already be durable')
      for (const key of keys) {
        const allocation = f.db.prepare('SELECT * FROM portfolio_storage_allocations WHERE portfolio_id=3').all().find(row => key.startsWith(row.prefix))
        assert.ok(allocation, 'Every deletion key belongs exclusively to the fake owner')
        assert.equal(allocation.writer_state, 'closed')
      }
      if (mock.deleteGate && mock.deletes.length === 1) await pause(mock.deleteGate)
      for (const [index, key] of keys.entries()) {
        mock.objects.delete(key)
        if (mock.partialOnce && index === 0) { mock.partialOnce = false; throw new Error('Private partial deletion failure') }
      }
      if (mock.lostDeleteOnce) { mock.lostDeleteOnce = false; throw new Error('Private lost deletion response') }
    },
  }
  return mock
}
const execute = (f, r2, number = 1, options = {}) => executeCleanupStep({
  db: f.env.bitreca_db, r2, jobId: f.jobId, token: cleanupToken(number), ...options,
})
async function drainCleanup(f, r2, options = {}) {
  for (let invocation = 0; invocation < 300; invocation++) {
    const result = await execute(f, r2, 10000 + invocation, { maxOperations: 10, ...options })
    if (result.state === 'storage_verified') return result
    assert.equal(result.state, 'pending', JSON.stringify(result))
  }
  assert.fail('Bounded cleanup did not converge')
}

test('executor verifies truly empty owned prefixes without deleting portfolio or ownership records', async t => {
  const f = await cleanupFixture(t, ['closed'])
  await f.certify()
  const r2 = cleanupR2(f)
  const owners = f.db.prepare('SELECT * FROM portfolio_storage_allocations').all()
  const rows = f.db.prepare('SELECT * FROM portfolios').all()
  await drainCleanup(f, r2)
  assert.equal(r2.lists.length, 2)
  assert.equal(r2.deletes.length, 0)
  assert.equal((await f.status()).phase, 'storage_verified')
  assert.equal((await f.status()).progress.empty_prefixes, 2)
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_storage_allocations').all(), owners)
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolios').all(), rows)
  assert.equal((await execute(f, r2, 20000)).state, 'storage_verified')
  assert.equal(r2.lists.length, 2)
  assert.throws(() => f.db.exec('DELETE FROM portfolios WHERE id=3'), /cleanup is not enabled/)
})

test('executor cleans active, historical, failed and incomplete allocations while preserving all foreign keys', async t => {
  const f = await cleanupFixture(t, ['completed', 'failed', 'conflicted', 'upload-uncertain', 'closed'])
  await f.certify()
  const r2 = cleanupR2(f)
  const foreign = new Map(r2.objects)
  for (const { prefix } of f.db.prepare('SELECT prefix FROM portfolio_storage_allocations WHERE portfolio_id=3').all()) {
    r2.objects.set(prefix + 'index.html', 'fake HTML')
    r2.objects.set(prefix + 'assets/style.css', 'fake CSS')
  }
  await drainCleanup(f, r2)
  assert.deepEqual(r2.objects, foreign)
  assert.equal((await f.status()).progress.confirmed_objects, 12)
  assert.equal((await f.status()).progress.empty_prefixes, 6)
  assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), [])
})

test('large prefixes resume bounded first-page sweeps without cursor skips or double counting', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const r2 = cleanupR2(f)
  for (let index = 0; index < 1201; index++) r2.objects.set(f.prefix + 'file-' + index, 'fake')
  await drainCleanup(f, r2, { pageSize: 37, maxOperations: 3 })
  assert.equal((await f.status()).progress.confirmed_objects, 1201)
  assert.equal(r2.deletes.flat().length, 1201)
  assert.equal(new Set(r2.deletes.flat()).size, 1201)
  assert.ok(r2.deletes.every(keys => keys.length <= 37))
  assert.ok(r2.lists.every(options => options.cursor === undefined))
})

test('one-operation budgets persist manifests before deletion and resume them before listing again', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const r2 = cleanupR2(f)
  r2.objects.set(f.prefix + 'x', 'fake')
  assert.equal((await execute(f, r2, 1, { maxOperations: 1 })).state, 'pending')
  assert.equal(r2.deletes.length, 0)
  assert.equal((await f.status()).progress.planned_batches, 1)
  assert.equal((await execute(f, r2, 2, { maxOperations: 1 })).state, 'pending')
  assert.equal(r2.lists.length, 1)
  assert.equal(r2.deletes.length, 1)
  await drainCleanup(f, r2)
  assert.equal((await f.status()).progress.confirmed_objects, 1)
})

for (const failure of ['partialOnce', 'lostDeleteOnce']) {
  test('executor reconciles ' + failure + ' by replaying the exact durable manifest', async t => {
    const f = await cleanupFixture(t)
    await f.certify()
    const r2 = cleanupR2(f)
    for (const key of ['a', 'b', 'c']) r2.objects.set(f.prefix + key, 'fake')
    r2[failure] = true
    const result = await execute(f, r2)
    assert.equal(result.state, 'retry_wait')
    assert.equal(result.error.code, 'OUTCOME_UNKNOWN')
    assert.equal((await f.status()).progress.confirmed_objects, 0)
    assert.equal((await f.status()).progress.empty_prefixes, 0)
    assert.equal((await execute(f, r2, 2)).state, 'retry_wait')
    assert.equal(r2.deletes.length, 1)
    f.advance(3601)
    await drainCleanup(f, r2)
    assert.deepEqual(r2.deletes[0], r2.deletes[1])
    assert.equal((await f.status()).progress.confirmed_objects, 3)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_batch_receipts').get().n, 1)
  })
}

for (const failure of ['cleanup-manifest-response-lost', 'cleanup-confirm-failure', 'cleanup-confirm-response-lost',
  'cleanup-empty-response-lost', 'cleanup-storage-response-lost']) {
  test('executor resumes durable progress after ' + failure, async t => {
    const f = await cleanupFixture(t)
    await f.certify()
    const r2 = cleanupR2(f)
    r2.objects.set(f.prefix + 'index.html', 'fake')
    f.state.fail = failure
    const result = await execute(f, r2)
    assert.ok(['retry_wait', 'interrupted'].includes(result.state))
    if (failure === 'cleanup-manifest-response-lost') assert.equal(r2.deletes.length, 0)
    f.state.fail = null
    f.advance(3601)
    await drainCleanup(f, r2)
    assert.equal((await f.status()).progress.confirmed_objects, 1)
    assert.equal((await f.status()).progress.empty_prefixes, 1)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_storage_receipts').get().n, 1)
  })
}

test('competing cleanup workers cannot use another worker lease', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const r2 = cleanupR2(f), point = gate()
  r2.listGate = point
  const running = execute(f, r2)
  await point.started.promise
  try {
    assert.equal((await execute(f, r2, 2)).state, 'busy')
    assert.equal(r2.lists.length, 1)
    assert.equal(r2.deletes.length, 0)
  } finally { point.resume.resolve() }
  assert.equal((await running).state, 'storage_verified')
})

test('an already-issued stale DELETE can settle after takeover without corrupting receipts or counts', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const r2 = cleanupR2(f), point = gate()
  r2.objects.set(f.prefix + 'x', 'fake')
  r2.deleteGate = point
  const running = execute(f, r2)
  await point.started.promise
  try {
    f.advance(61)
    assert.equal((await execute(f, r2, 2, { maxOperations: 10 })).state, 'storage_verified')
  } finally { point.resume.resolve() }
  assert.equal((await running).state, 'interrupted')
  assert.equal((await f.status()).progress.confirmed_objects, 1)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_batch_receipts').get().n, 1)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_storage_receipts').get().n, 1)
})

test('a delayed listing from an expired lease cannot prepare a manifest or issue DELETE', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const r2 = cleanupR2(f), point = gate()
  r2.objects.set(f.prefix + 'x', 'fake')
  r2.listGate = point
  const running = execute(f, r2)
  await point.started.promise
  try {
    f.advance(61)
    assert.ok(await f.claim(2))
  } finally { point.resume.resolve() }
  assert.equal((await running).state, 'interrupted')
  assert.equal(r2.deletes.length, 0)
  assert.equal((await f.status()).progress.planned_batches, 0)
})

test('delayed PUTs block cleanup until their writer definitively closes, regardless of elapsed time', async t => {
  const f = await cleanupFixture(t, ['open'])
  await f.certify()
  const r2 = cleanupR2(f), writes = deferred()
  const prefix = f.db.prepare("SELECT prefix FROM portfolio_storage_allocations WHERE portfolio_id=3 AND writer_state='open'").get().prefix
  const pendingPut = (async () => { await writes.promise; r2.objects.set(prefix + 'late.css', 'fake') })()
  try {
    f.advance(100000)
    const result = await execute(f, r2)
    assert.equal(result.state, 'blocked')
    assert.equal(result.error.code, 'WRITERS_OPEN')
    assert.equal(r2.lists.length + r2.deletes.length, 0)
  } finally { writes.resolve() }
  await pendingPut
  f.db.prepare("UPDATE portfolio_storage_allocations SET writer_state='closed',writer_closed_at=unixepoch() WHERE prefix=?").run(prefix)
  await f.certify()
  await drainCleanup(f, r2)
  assert.equal((await f.status()).progress.confirmed_objects, 1)
})

for (const [states, sourceOverride, certify, code] of [
  [[], null, false, 'INVENTORY_INCOMPLETE'],
  [['uncertain'], null, true, 'WRITER_UNCERTAIN'],
  [['closed'], 'portfolios/unverified-history/', true, 'LEGACY_STORAGE_UNVERIFIED'],
]) {
  test('executor makes zero storage calls for blocker ' + code, async t => {
    const f = await cleanupFixture(t, states, sourceOverride)
    if (certify) await f.certify()
    const r2 = cleanupR2(f)
    f.advance(100000)
    const result = await execute(f, r2)
    assert.equal(result.state, 'blocked')
    assert.equal(result.error.code, code)
    assert.equal(r2.lists.length + r2.deletes.length, 0)
  })
}

for (const malformed of [
  () => null,
  () => ({ objects: [] }),
  () => ({ objects: [], truncated: true, cursor: 'fake' }),
  () => ({ objects: {}, truncated: false }),
  () => ({ objects: [{ key: 'portfolios/fixture-two/index.html' }], truncated: false }),
  prefix => ({ objects: [{ key: prefix + 'safe' }, { key: prefix + '../fake\0' }], truncated: false }),
  prefix => ({ objects: [{ key: prefix + 'x' }, { key: prefix + 'x' }], truncated: false }),
  prefix => ({ objects: [{ key: prefix.slice(0, -1) + '-another/file' }], truncated: false }),
  prefix => ({ objects: [{ key: prefix + 'x' }], truncated: true }),
  prefix => ({ objects: [{ key: prefix + 'x'.repeat(1025) }], truncated: false }),
  () => ({ objects: [], truncated: false, delimitedPrefixes: ['hidden/'] }),
  prefix => ({ objects: [{ key: prefix + 'a' }, { key: prefix + 'b' }], truncated: false }),
]) {
  test('malformed or unauthorized listing is rejected without deleting or certifying empty storage #' + String(malformed), async t => {
    const f = await cleanupFixture(t)
    await f.certify()
    const r2 = cleanupR2(f)
    r2.listOverride = () => malformed(f.prefix)
    assert.equal((await execute(f, r2, 1, { pageSize: 1 })).state, 'retry_wait')
    assert.equal(r2.deletes.length, 0)
    const status = await f.status()
    assert.equal(status.error.code, 'OUTCOME_UNKNOWN')
    assert.equal(status.progress.empty_prefixes, 0)
    assert.equal(status.progress.planned_batches, 0)
    assert.equal(status.progress.confirmed_objects, 0)
  })
}

test('an ownership conflict discovered while listing prevents manifest creation and deletion', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const r2 = cleanupR2(f), point = gate()
  r2.objects.set(f.prefix + 'x', 'fake')
  r2.listGate = point
  const running = execute(f, r2)
  await point.started.promise
  try {
    f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix) VALUES(4,?,?,?)')
      .run('Fake foreign owner', 'fixture-foreign', f.prefix + 'nested/')
  } finally { point.resume.resolve() }
  assert.equal((await running).state, 'interrupted')
  assert.equal((await f.status()).error.code, 'OWNERSHIP_CONFLICT')
  assert.equal(r2.deletes.length, 0)
})

test('SQLite rejects premature, stale, foreign and replacement cleanup confirmations', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const lease = await f.claim()
  await prepareCleanupItems(f.env.bitreca_db, lease)
  const storage = f.db.prepare('INSERT INTO portfolio_deletion_storage_receipts(job_id,generation,lease_token) VALUES(?,?,?)')
  assert.throws(() => storage.run(f.jobId, lease.generation, lease.token), /every owned prefix/)
  const batchId = uuid(1500)
  await planCleanupBatch(f.env.bitreca_db, lease, batchId, f.prefix, [f.prefix + 'x'])
  const empty = f.db.prepare('INSERT INTO portfolio_deletion_prefix_receipts(job_id,prefix,generation,lease_token) VALUES(?,?,?,?)')
  assert.throws(() => empty.run(f.jobId, f.prefix, lease.generation, lease.token), /settled batches/)
  const confirmed = f.db.prepare('INSERT INTO portfolio_deletion_batch_receipts(batch_id,generation,lease_token) VALUES(?,?,?)')
  assert.throws(() => confirmed.run(batchId, lease.generation + 1, lease.token), /current cleanup authority/)
  f.advance(61)
  assert.throws(() => confirmed.run(batchId, lease.generation, lease.token), /current cleanup authority/)
  const current = await f.claim(2)
  confirmed.run(batchId, current.generation, current.token)
  assert.throws(() => empty.run(f.jobId, f.owned[0].prefix, current.generation, current.token), /current authority/)
  empty.run(f.jobId, f.prefix, current.generation, current.token)
  await assert.rejects(planCleanupBatch(f.env.bitreca_db, current, uuid(1501), f.prefix, [f.prefix + 'other']), /cannot accept new manifests/)
  storage.run(f.jobId, current.generation, current.token)
  assert.throws(() => f.db.prepare('INSERT OR REPLACE INTO portfolio_deletion_batch_receipts(batch_id,generation,lease_token) VALUES(?,?,?)')
    .run(batchId, current.generation, current.token), /current cleanup authority/)
  for (const table of ['portfolio_deletion_batch_receipts', 'portfolio_deletion_prefix_receipts', 'portfolio_deletion_storage_receipts']) {
    assert.throws(() => f.db.exec('UPDATE ' + table + ' SET generation=99'), /immutable/)
    assert.throws(() => f.db.exec('DELETE FROM ' + table), /retained/)
  }
})

test('live entry points delegate cleanup through the guarded dispatcher rather than importing the executor', () => {
  for (const path of ['../worker/index.js', '../portfolio-hosting/index.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.ok(!source.includes('portfolio-cleanup-executor'))
    assert.ok(!source.includes('executeCleanupStep'))
  }
})

test('0010 preserves prepared items, manifests, receipts, and writer evidence without inventing cleanup results', async t => {
  const f = await cleanupFixture(t, ['closed'], null, 9)
  await f.certify()
  f.db.prepare(`UPDATE portfolio_deletion_executions SET lease_token=?,lease_expires_at=unixepoch()+60,
    generation=1,attempt_count=1,phase='preparing' WHERE job_id=?`).run(cleanupToken(1), f.jobId)
  const lease = { jobId: f.jobId, token: cleanupToken(1), generation: 1 }
  await prepareCleanupItems(f.env.bitreca_db, lease)
  await planCleanupBatch(f.env.bitreca_db, lease, uuid(1600), f.prefix, [f.prefix + 'x'])
  const tables = ['portfolios', 'portfolio_storage_allocations', 'portfolio_deletion_jobs',
    'portfolio_deletion_executions', 'portfolio_deletion_inventory', 'portfolio_deletion_items', 'portfolio_deletion_batches']
  const before = tables.map(table => f.db.prepare('SELECT * FROM ' + table).all())
  f.db.exec(readFileSync(new URL('../migrations/' + migrations[9], import.meta.url), 'utf8'))
  for (const [index, table] of tables.entries()) assert.deepEqual(f.db.prepare('SELECT * FROM ' + table).all(), before[index])
  for (const table of ['portfolio_deletion_batch_receipts', 'portfolio_deletion_prefix_receipts', 'portfolio_deletion_storage_receipts']) {
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM ' + table).get().n, 0)
  }
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), [])
})

test('executor recovers a lost claim response with the retained token before issuing storage calls', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const r2 = cleanupR2(f)
  f.state.fail = 'cleanup-claim-response-lost'
  assert.equal((await execute(f, r2)).state, 'interrupted')
  assert.equal(r2.lists.length + r2.deletes.length, 0)
  assert.equal((await execute(f, r2)).state, 'storage_verified')
  assert.equal((await f.status()).attempts, 1)
})

test('R2 listing failure is sanitized and does not produce a false empty-prefix receipt', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const r2 = cleanupR2(f)
  r2.listOverride = () => { throw new Error('Private storage diagnostic') }
  const result = await execute(f, r2)
  assert.equal(result.state, 'retry_wait')
  assert.equal(result.error.code, 'STORAGE_UNAVAILABLE')
  assert.equal((await f.status()).progress.empty_prefixes, 0)
  assert.equal(r2.deletes.length, 0)
  assert.ok(!JSON.stringify(await f.status()).includes('Private'))
})

test('duplicate and mixed foreign keys are validated before any manifest is persisted', async t => {
  for (const kind of ['duplicate', 'foreign']) {
    const f = await cleanupFixture(t)
    await f.certify()
    const r2 = cleanupR2(f)
    r2.listOverride = () => ({ objects: [{ key: f.prefix + 'x' },
      { key: kind === 'duplicate' ? f.prefix + 'x' : 'portfolios/fixture-two/index.html' }], truncated: false })
    assert.equal((await execute(f, r2)).state, 'retry_wait')
    assert.equal(r2.deletes.length, 0)
    assert.equal((await f.status()).progress.planned_batches, 0)
  }
})

test('unconfirmed protocol cutover and untracked historical writers block every executor storage call', async t => {
  for (const cutover of [false, true]) {
    const f = fixture(t)
    const legacy = f.owned[0].prefix
    f.db.prepare('UPDATE portfolios SET storage_prefix=? WHERE id=2').run(legacy)
    const cookie = await login(f)
    await mark(f, cookie, 2)
    if (cutover) f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
    const r2 = { list() { assert.fail('Listing must be blocked') }, delete() { assert.fail('Deletion must be blocked') } }
    const result = await executeCleanupStep({ db: f.env.bitreca_db, r2, jobId: jobs(f)[0].id, token: cleanupToken(1) })
    assert.equal(result.state, 'blocked')
    assert.equal(result.error.code, cutover ? 'UNTRACKED_ALLOCATION' : 'PROTOCOL_CUTOVER_REQUIRED')
  }
})

test('D1 authorization failure before DELETE leaves all objects and confirmations untouched', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const r2 = cleanupR2(f)
  r2.objects.set(f.prefix + 'x', 'fake')
  assert.equal((await execute(f, r2, 1, { maxOperations: 1 })).state, 'pending')
  f.state.beforeFirst = async query => {
    if (query.startsWith('SELECT a.prefix FROM portfolio_cleanup_authorized_items')) throw new Error('Private D1 failure')
  }
  assert.equal((await execute(f, r2, 2)).state, 'retry_wait')
  assert.ok(r2.objects.has(f.prefix + 'x'))
  assert.equal(r2.deletes.length, 0)
  assert.equal((await f.status()).progress.confirmed_objects, 0)
})

// Step 4: only fake portfolio rows in :memory: are ever removed.
async function finalizationFixture(t) {
  const f = await cleanupFixture(t, ['completed', 'failed', 'closed'])
  await f.certify()
  f.r2 = cleanupR2(f)
  for (const { prefix } of f.db.prepare('SELECT prefix FROM portfolio_storage_allocations WHERE portfolio_id=3').all()) {
    f.r2.objects.set(prefix + 'index.html', 'fake')
  }
  await drainCleanup(f, f.r2)
  f.finalClaim = (number = 50000) => claimFinalizationLease(f.env.bitreca_db, f.jobId, cleanupToken(number))
  return f
}
const finalizations = f => f.db.prepare('SELECT * FROM portfolio_deletion_finalizations').all()

test('finalization atomically removes only the verified portfolio and permanently retains every proof and tombstone', async t => {
  const f = await finalizationFixture(t)
  const retained = ['portfolio_storage_allocations', 'portfolio_deletion_jobs', 'portfolio_deletion_inventory',
    'portfolio_deletion_items', 'portfolio_deletion_batches', 'portfolio_deletion_batch_receipts',
    'portfolio_deletion_prefix_receipts', 'portfolio_deletion_storage_receipts']
  const snapshots = retained.map(table => f.db.prepare('SELECT * FROM ' + table).all())
  const foreign = f.db.prepare('SELECT * FROM portfolios WHERE id<>3').all()
  const lease = await f.finalClaim()
  assert.ok(lease)
  assert.throws(() => f.db.exec('DELETE FROM portfolios WHERE id=3'), /not authorized/)
  const result = await finalizePortfolioDeletion(f.env.bitreca_db, lease)
  assert.equal(result.state, 'finalized')
  assert.equal(result.receipt.portfolio_id, 3)
  assert.equal(f.db.prepare('SELECT * FROM portfolios WHERE id=3').get(), undefined)
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolios').all(), foreign)
  for (const [index, table] of retained.entries()) assert.deepEqual(f.db.prepare('SELECT * FROM ' + table).all(), snapshots[index])
  const execution = f.db.prepare('SELECT * FROM portfolio_deletion_executions WHERE job_id=?').get(f.jobId)
  assert.equal(execution.lease_token, null)
  assert.equal(execution.lease_expires_at, null)
  assert.equal(finalizations(f).length, 1)
  assert.equal((await f.status()).phase, 'finalized')
  assert.equal((await f.status()).error, null)
  assert.equal((await f.status()).eligible_for_preparation, false)
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), [])
  assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
})

test('duplicate finalization is a read-only acknowledgement even after the original lease expires', async t => {
  const f = await finalizationFixture(t)
  const lease = await f.finalClaim()
  const first = await finalizePortfolioDeletion(f.env.bitreca_db, lease)
  const before = finalizations(f)
  const execution = f.db.prepare('SELECT * FROM portfolio_deletion_executions').all()
  f.advance(100000)
  assert.deepEqual(await finalizePortfolioDeletion(f.env.bitreca_db, lease), first)
  assert.deepEqual(finalizations(f), before)
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_deletion_executions').all(), execution)
  assert.equal(await f.finalClaim(50001), null)
})

test('a failure after row removal rolls back the receipt, portfolio deletion, and lease release together', async t => {
  const f = await finalizationFixture(t)
  const lease = await f.finalClaim()
  const row = f.db.prepare('SELECT * FROM portfolios WHERE id=3').get()
  const execution = f.db.prepare('SELECT * FROM portfolio_deletion_executions').all()
  f.db.exec(`CREATE TRIGGER fixture_fail_finalization_release BEFORE UPDATE ON portfolio_deletion_executions
    WHEN NEW.lease_token IS NULL AND OLD.lease_token IS NOT NULL
    BEGIN SELECT RAISE(ABORT, 'Private injected finalization failure'); END`)
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'unavailable')
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolios WHERE id=3').get(), row)
  assert.equal(finalizations(f).length, 0)
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_deletion_executions').all(), execution)
  f.db.exec('DROP TRIGGER fixture_fail_finalization_release')
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'finalized')
})

test('a suppressed DELETE cannot leave a standalone finalization receipt or reusable permit', async t => {
  const f = await finalizationFixture(t)
  const lease = await f.finalClaim()
  f.db.exec(`CREATE TRIGGER fixture_ignore_delete BEFORE DELETE ON portfolios
    WHEN OLD.id=3 BEGIN SELECT RAISE(IGNORE); END`)
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'unavailable')
  assert.equal(finalizations(f).length, 0)
  assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
})

test('lost finalization responses replay the committed permanent receipt without another deletion', async t => {
  const f = await finalizationFixture(t)
  const lease = await f.finalClaim()
  f.state.fail = 'finalization-response-lost'
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'unavailable')
  assert.equal(finalizations(f).length, 1)
  assert.equal(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get(), undefined)
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'finalized')
  assert.equal(finalizations(f).length, 1)
})

test('a committed finalization claim with a lost response is recovered with the original token and generation', async t => {
  const f = await finalizationFixture(t)
  f.state.fail = 'cleanup-claim-response-lost'
  await assert.rejects(f.finalClaim(), /lease could not be confirmed/)
  const generation = f.db.prepare('SELECT generation FROM portfolio_deletion_executions WHERE job_id=?').get(f.jobId).generation
  const lease = await f.finalClaim()
  assert.equal(lease.generation, generation)
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'finalized')
})

test('competing finalization claims are exclusive and duplicate requests cannot create duplicate receipts', async t => {
  const f = await finalizationFixture(t)
  const [one, two] = await Promise.all([f.finalClaim(), f.finalClaim(50001)])
  assert.ok(one)
  assert.equal(two, null)
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, { ...one, token: cleanupToken(50001) })).state, 'stale_lease')
  const results = await Promise.all([finalizePortfolioDeletion(f.env.bitreca_db, one), finalizePortfolioDeletion(f.env.bitreca_db, one)])
  assert.ok(results.every(result => result.state === 'finalized'))
  assert.equal(finalizations(f).length, 1)
})

test('expired and wrong-generation finalization leases cannot remove a portfolio after takeover', async t => {
  const f = await finalizationFixture(t)
  const old = await f.finalClaim()
  f.advance(61)
  assert.equal(await f.finalClaim(), null)
  const current = await f.finalClaim(50001)
  assert.equal(current.generation, old.generation + 1)
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, old)).state, 'stale_lease')
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, { ...current, generation: old.generation })).state, 'stale_lease')
  assert.equal(finalizations(f).length, 0)
  assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, current)).state, 'finalized')
})

test('lease expiration immediately before the finalization SQL is evaluated fails closed', async t => {
  const f = await finalizationFixture(t)
  const lease = await f.finalClaim()
  f.state.beforeRun = async query => {
    if (query.startsWith('INSERT INTO portfolio_deletion_finalizations')) f.advance(61)
  }
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'stale_lease')
  assert.equal(finalizations(f).length, 0)
  assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
})

for (const [states, sourceOverride, certify] of [
  [[], null, false], [['open'], null, true], [['uncertain'], null, true],
  [['closed'], 'portfolios/unverified-history/', true],
]) {
  test('finalization rejects missing inventory or unsettled/unverified storage ' + JSON.stringify([states, sourceOverride, certify]), async t => {
    const f = await cleanupFixture(t, states, sourceOverride)
    if (certify) await f.certify()
    f.advance(100000)
    assert.equal(await claimFinalizationLease(f.env.bitreca_db, f.jobId, cleanupToken(50000)), null)
    assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, { jobId: f.jobId, token: cleanupToken(50000), generation: 1 })).state, 'blocked')
    assert.equal(finalizations(f).length, 0)
    assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
  })
}

test('prepared allocation items and elapsed time never substitute for R2 verification', async t => {
  const f = await cleanupFixture(t)
  await f.certify()
  const lease = await f.claim()
  await prepareCleanupItems(f.env.bitreca_db, lease)
  await finishCleanupPreparation(f.env.bitreca_db, lease)
  f.advance(100000)
  assert.equal((await f.status()).phase, 'prepared')
  assert.equal(await claimFinalizationLease(f.env.bitreca_db, f.jobId, cleanupToken(50000)), null)
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'blocked')
  assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
})

test('one empty-prefix receipt or a pending deletion manifest is insufficient for finalization', async t => {
  for (const hasObject of [false, true]) {
    const f = await cleanupFixture(t)
    await f.certify()
    const r2 = cleanupR2(f)
    if (hasObject) r2.objects.set(f.prefix + 'pending', 'fake')
    await execute(f, r2, 1, { maxOperations: 1 })
    assert.equal((await f.status()).phase, 'cleaning')
    assert.equal(await claimFinalizationLease(f.env.bitreca_db, f.jobId, cleanupToken(50000)), null)
    assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, { jobId: f.jobId, token: cleanupToken(50000), generation: 1 })).state, 'blocked')
    assert.equal(finalizations(f).length, 0)
  }
})

for (const future of ['prefix', 'storage']) {
  test('invalid ' + future + ' receipt chronology cannot authorize finalization', async t => {
    const f = await cleanupFixture(t)
    await f.certify()
    const lease = await f.claim()
    await prepareCleanupItems(f.env.bitreca_db, lease)
    // 0010 accepts nonnegative timestamps; 0011 independently rejects invalid
    // chronology, even if all receipt identities and allocation counts match.
    f.db.prepare(`INSERT INTO portfolio_deletion_prefix_receipts(job_id,prefix,generation,lease_token,verified_empty_at)
      VALUES(?,?,?,?,unixepoch()+?)`).run(f.jobId, f.prefix, lease.generation, lease.token, future === 'prefix' ? 1000 : 0)
    f.db.prepare(`INSERT INTO portfolio_deletion_storage_receipts(job_id,generation,lease_token,verified_at)
      VALUES(?,?,?,unixepoch()+?)`).run(f.jobId, lease.generation, lease.token, future === 'storage' ? 1000 : 0)
    assert.equal(await claimFinalizationLease(f.env.bitreca_db, f.jobId, cleanupToken(50000)), null)
    assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'blocked')
    assert.equal((await f.status()).error.code, 'FINALIZATION_NOT_READY')
    assert.equal((await f.status()).eligible_for_finalization, false)
    assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
  })
}

test('a new ownership conflict blocks finalization even after cleanup verification and lease claiming', async t => {
  const f = await finalizationFixture(t)
  const lease = await f.finalClaim()
  f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix) VALUES(4,?,?,?)')
    .run('Fake overlapping customer', 'fixture-overlap', f.prefix + 'nested/')
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'blocked')
  assert.equal((await f.status()).error.code, 'OWNERSHIP_CONFLICT')
  assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
})

test('finalization cannot substitute another customer job or ownership ID', async t => {
  const f = await finalizationFixture(t)
  const lease = await f.finalClaim()
  await mark(f, f.cookie, 1)
  const other = jobs(f).find(row => row.portfolio_id === 1)
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, { ...lease, jobId: other.id })).state, 'blocked')
  assert.throws(() => f.db.prepare(`INSERT INTO portfolio_deletion_finalizations
    (job_id,portfolio_id,generation,lease_token,storage_verified_at) VALUES(?,?,?,?,unixepoch())`)
    .run(f.jobId, 2, lease.generation, lease.token), /complete verification/)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolios').get().n, 3)
  assert.equal(finalizations(f).length, 0)
})

test('permanent receipts and storage tombstones reject replacement, reassignment, and prefix or portfolio-ID reuse', async t => {
  const f = await finalizationFixture(t)
  const lease = await f.finalClaim()
  await finalizePortfolioDeletion(f.env.bitreca_db, lease)
  assert.throws(() => f.db.exec('UPDATE portfolio_deletion_finalizations SET generation=99'), /immutable/)
  assert.throws(() => f.db.exec('DELETE FROM portfolio_deletion_finalizations'), /retained/)
  assert.throws(() => f.db.prepare(`INSERT OR REPLACE INTO portfolio_deletion_finalizations
    (job_id,portfolio_id,generation,lease_token,storage_verified_at) VALUES(?,?,?,?,unixepoch())`)
    .run(f.jobId, 3, lease.generation, lease.token), /complete verification/)
  const insert = f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix) VALUES(4,?,?,?)')
  for (const prefix of [f.prefix, f.prefix + 'nested/', 'portfolio-initial/']) {
    assert.throws(() => insert.run('Fake reuse', 'fixture-reuse', prefix), /Storage allocation conflict/)
  }
  const fresh = 'portfolio-initial/' + uuid(2000) + '/'
  assert.throws(() => f.db.prepare('INSERT OR REPLACE INTO portfolios(id,name,slug,storage_prefix) VALUES(3,?,?,?)')
    .run('Fake reuse', 'fixture-reuse', fresh), /permanently deleted|birth identity already exists/)
  insert.run('Fake fresh customer', 'fixture-new', fresh)
  assert.throws(() => f.db.prepare('UPDATE portfolios SET storage_prefix=? WHERE id=4').run(f.prefix))
  assert.throws(() => f.db.exec('UPDATE portfolios SET id=3 WHERE id=4'), /permanently deleted/)
  assert.throws(() => f.db.exec('UPDATE portfolio_storage_allocations SET portfolio_id=4 WHERE portfolio_id=3'), /immutable/)
  assert.throws(() => f.db.exec('DELETE FROM portfolio_storage_allocations WHERE portfolio_id=3'), /retained/)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_allocations WHERE portfolio_id=3').get().n, 4)
})

test('old slugs remain reusable with fresh UUID storage and no customer-file inheritance', async t => {
  const f = await finalizationFixture(t)
  await finalizePortfolioDeletion(f.env.bitreca_db, await f.finalClaim())
  const result = await worker.fetch(request('/api/admin/portfolios', 'POST', {
    name: 'Fake replacement customer', slug: 'fixture-new', storage_prefix: f.prefix,
  }, f.cookie), f.env)
  assert.equal(result.status, 201)
  const created = f.db.prepare("SELECT * FROM portfolios WHERE slug='fixture-new'").get()
  assert.notEqual(created.id, 3)
  assert.notEqual(created.storage_prefix, f.prefix)
  assert.equal(f.db.prepare('SELECT portfolio_id FROM portfolio_storage_allocations WHERE prefix=?').get(f.prefix).portfolio_id, 3)
  assert.equal(f.db.prepare('SELECT portfolio_id FROM portfolio_storage_allocations WHERE prefix=?').get(created.storage_prefix).portfolio_id, created.id)
})

test('finalized portfolios remain absent from uploads, publication, hosting, and admin lists; status reports retained final evidence', async t => {
  const f = await finalizationFixture(t)
  await finalizePortfolioDeletion(f.env.bitreca_db, await f.finalClaim())
  const calls = [f.state.puts, f.state.reads, f.state.lists]
  for (const method of ['upload', 'upload-folder']) {
    const form = new FormData()
    form.append(method === 'upload' ? 'file' : 'files', new File(['NEW'], 'index.html'))
    if (method === 'upload-folder') form.append('paths', 'index.html')
    assert.equal((await worker.fetch(request('/api/admin/portfolios/3/' + method, 'POST', form, f.cookie), f.env)).status, 404)
  }
  for (const value of ['published', 'draft']) {
    assert.equal((await worker.fetch(request('/api/admin/portfolios/3/status', 'PATCH', { status: value }, f.cookie), f.env)).status, 404)
  }
  assert.equal((await serve(f, 'fixture-new')).status, 404)
  assert.deepEqual([f.state.puts, f.state.reads, f.state.lists], calls)
  const response = await worker.fetch(request('/api/admin/portfolio-deletion-jobs/' + f.jobId, 'GET', undefined, f.cookie), f.env)
  assert.equal(response.status, 200)
  const body = await response.text()
  assert.equal(JSON.parse(body).job.phase, 'finalized')
  assert.ok(!body.includes('lease_token'))
  const list = await worker.fetch(request('/api/admin/portfolios', 'GET', undefined, f.cookie), f.env)
  assert.ok(!(await list.json()).portfolios.some(row => row.id === 3))
  const storageCalls = [f.r2.lists.length, f.r2.deletes.length]
  assert.equal((await execute(f, f.r2, 60000)).state, 'finalized')
  assert.deepEqual([f.r2.lists.length, f.r2.deletes.length], storageCalls)
})

test('0011 preserves existing cleanup state and installs the new guard before removing the unconditional guard', async t => {
  const f = await cleanupFixture(t, [], null, 10)
  await f.certify()
  const r2 = cleanupR2(f)
  assert.equal((await execute(f, r2, 1, { maxOperations: 10 })).state, 'storage_verified')
  const tables = ['portfolios', 'portfolio_storage_allocations', 'portfolio_deletion_jobs', 'portfolio_deletion_executions',
    'portfolio_deletion_inventory', 'portfolio_deletion_items', 'portfolio_deletion_storage_receipts', 'portfolio_deletion_prefix_receipts']
  const before = tables.map(table => f.db.prepare('SELECT * FROM ' + table).all())
  const sql = readFileSync(new URL('../migrations/' + migrations[10], import.meta.url), 'utf8')
  assert.ok(sql.indexOf('CREATE TRIGGER portfolios_finalization_delete_guard') < sql.indexOf('DROP TRIGGER portfolios_pending_deletion_no_delete'))
  f.db.exec(sql)
  for (const [index, table] of tables.entries()) assert.deepEqual(f.db.prepare('SELECT * FROM ' + table).all(), before[index])
  assert.equal(finalizations(f).length, 0)
  assert.throws(() => f.db.exec('DELETE FROM portfolios WHERE id=3'), /not authorized/)
  const lease = await claimFinalizationLease(f.env.bitreca_db, f.jobId, cleanupToken(50000))
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'finalized')
})

test('live entry points and the cleanup executor cannot directly invoke finalization', () => {
  for (const path of ['../worker/index.js', '../portfolio-hosting/index.js', '../worker/portfolio-cleanup-executor.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.ok(!source.includes('portfolio-finalization'))
    assert.ok(!source.includes('finalizePortfolioDeletion'))
  }
})

test('D1 failure before finalization preserves the row and lease without exposing the error', async t => {
  const f = await finalizationFixture(t)
  const lease = await f.finalClaim()
  const before = f.db.prepare('SELECT * FROM portfolio_deletion_executions').all()
  f.state.beforeRun = async query => {
    if (query.startsWith('INSERT INTO portfolio_deletion_finalizations')) throw new Error('Private simulated database failure')
  }
  const result = await finalizePortfolioDeletion(f.env.bitreca_db, lease)
  assert.deepEqual(result, { state: 'unavailable', error: { code: 'FINALIZATION_UNCONFIRMED' } })
  assert.equal(finalizations(f).length, 0)
  assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_deletion_executions').all(), before)
})

test('failed receipt readback after a committed finalization is safely reconciled on retry', async t => {
  const f = await finalizationFixture(t)
  const lease = await f.finalClaim()
  f.state.beforeFirst = async query => {
    if (query.includes('FROM portfolio_deletion_finalizations WHERE job_id')) throw new Error('Private simulated read failure')
  }
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'unavailable')
  assert.equal(finalizations(f).length, 1)
  assert.equal(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get(), undefined)
  f.state.beforeFirst = null
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'finalized')
  assert.equal(finalizations(f).length, 1)
})

test('a crash after claiming finalization leaves the row pending until another valid generation resumes', async t => {
  const f = await finalizationFixture(t)
  const interrupted = await f.finalClaim()
  assert.equal(finalizations(f).length, 0)
  assert.equal((await f.status()).phase, 'storage_verified')
  assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
  f.advance(61)
  const resumed = await f.finalClaim(50001)
  assert.ok(resumed.generation > interrupted.generation)
  assert.equal((await finalizePortfolioDeletion(f.env.bitreca_db, resumed)).state, 'finalized')
})

// Trusted inventory: signed reports and resource bindings are entirely fake.
async function inventoryCreationFixture(t, cutover = true, storageScope) {
  const f = fixture(t)
  if (cutover) {
    f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
    await signedProtocolFixture(f, 2300, storageScope)
  }
  f.cookie = await login(f)
  const created = await worker.fetch(request('/api/admin/portfolios', 'POST', {
    name: 'Fake protocol customer', slug: 'inventory-fixture', storage_prefix: sourcePrefix,
    storage_birth_token: 'client-must-not-control-this',
  }, f.cookie), f.env)
  assert.equal(created.status, 201)
  f.created = f.db.prepare("SELECT * FROM portfolios WHERE slug='inventory-fixture'").get()
  f.markInventory = async () => {
    assert.equal((await mark(f, f.cookie, f.created.id)).status, 202)
    f.jobId = jobs(f).find(job => job.portfolio_id === f.created.id).id
  }
  f.attest = () => attestPortfolioInventory(f.env.bitreca_db, f.trust, f.jobId)
  f.uploadNew = () => {
    const form = new FormData()
    form.append('files', new File(['NEW HTML'], 'index.html'))
    form.append('paths', 'index.html')
    form.append('files', new File(['NEW CSS'], 'style.css'))
    form.append('paths', 'style.css')
    return worker.fetch(request('/api/admin/portfolios/' + f.created.id + '/upload-folder', 'POST', form, f.cookie), f.env)
  }
  return f
}

test('trusted inventory records actual creation evidence, seals the initial allocation and attests complete closed upload history', async t => {
  const f = await inventoryCreationFixture(t)
  assert.notEqual(f.created.storage_prefix, sourcePrefix)
  assert.match(f.created.storage_birth_token, /^[0-9a-f]{32}$/)
  assert.equal((await f.uploadNew()).status, 200)
  await f.markInventory()
  const before = [f.state.puts, f.state.reads, f.state.lists]
  const result = await f.attest()
  assert.equal(result.state, 'attested')
  assert.equal(result.allocationCount, 2)
  assert.match(result.snapshotSha256, /^[0-9a-f]{64}$/)
  assert.deepEqual([f.state.puts, f.state.reads, f.state.lists], before)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_allocation_events WHERE portfolio_id=?').get(f.created.id).n, 2)
  const origin = f.db.prepare('SELECT * FROM portfolio_storage_origins WHERE portfolio_id=?').get(f.created.id)
  const root = f.db.prepare('SELECT * FROM portfolio_storage_birth_seals WHERE portfolio_id=?').get(f.created.id)
  assert.equal(origin.birth_token, root.writer_token)
  assert.equal(origin.initial_prefix, root.initial_prefix)
  assert.equal((await getPortfolioDeletionStatus(f.env.bitreca_db, f.jobId)).eligible_for_preparation, true)
  assert.deepEqual(await f.attest(), result)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 1)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_inventory').get().n, 1)
})

test('migration 0012 neither cuts over the writer policy nor certifies existing portfolios', t => {
  const f = fixture(t)
  assert.equal(f.db.prepare('SELECT minimum_protocol_version FROM portfolio_storage_writer_policy').get().minimum_protocol_version, 0)
  for (const table of ['portfolio_storage_protocol_verifications', 'portfolio_storage_origins',
    'portfolio_storage_birth_seals', 'portfolio_storage_allocation_events', 'portfolio_inventory_verifications']) {
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM ' + table).get().n, 0)
  }
  assert.ok(f.db.prepare('SELECT storage_birth_token FROM portfolios').all().every(row => row.storage_birth_token === null))
})

test('portfolios born before verified cutover cannot be retroactively auto-certified', async t => {
  const f = await inventoryCreationFixture(t, false)
  const origin = f.db.prepare('SELECT * FROM portfolio_storage_origins WHERE portfolio_id=?').get(f.created.id)
  assert.equal(origin.minimum_at_birth, 0)
  assert.equal(origin.epoch_id, null)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  await signedProtocolFixture(f, 2301)
  await f.markInventory()
  assert.equal((await f.attest()).state, 'blocked')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 0)
  assert.throws(() => f.db.exec("UPDATE portfolio_storage_origins SET epoch_id='fake'"), /immutable/)
})

test('a new portfolio without independent deployment and legacy-writer-settlement evidence stays blocked', async t => {
  const f = fixture(t)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix,storage_birth_token) VALUES(3,?,?,?,?)')
    .run('Fake no epoch', 'fake-no-epoch', 'portfolio-initial/' + uuid(2310) + '/', cleanupToken(2310))
  f.db.prepare(`INSERT INTO portfolio_storage_allocations(prefix,portfolio_id,allocation_kind,upload_state,
    writer_protocol_version,writer_token,writer_state,writer_closed_at)
    VALUES(?,3,'initial','completed',1,?,'closed',unixepoch())`).run('portfolio-initial/' + uuid(2310) + '/', cleanupToken(2310))
  const cookie = await login(f)
  await mark(f, cookie, 3)
  assert.equal((await attestPortfolioInventory(f.env.bitreca_db, {}, jobs(f)[0].id)).state, 'blocked')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_inventory').get().n, 0)
})

test('legacy portfolios cannot acquire birth identity or certify matching UUID names and closed writers', async t => {
  const f = fixture(t)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  await signedProtocolFixture(f, 2320)
  assert.throws(() => f.db.prepare('UPDATE portfolios SET storage_birth_token=? WHERE id=1').run(cleanupToken(2320)), /immutable/)
  const prefix = 'portfolio-initial/' + uuid(2320) + '/'
  f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix) VALUES(3,?,?,?)').run('Fake old writer', 'fake-old-writer', prefix)
  f.db.prepare(`INSERT INTO portfolio_storage_allocations(prefix,portfolio_id,allocation_kind,upload_state,
    writer_protocol_version,writer_token,writer_state,writer_closed_at)
    VALUES(?,3,'initial','completed',1,?,'closed',unixepoch())`).run(prefix, cleanupToken(2320))
  const cookie = await login(f)
  await mark(f, cookie, 3)
  const jobId = jobs(f)[0].id
  assert.equal((await attestPortfolioInventory(f.env.bitreca_db, f.trust, jobId)).state, 'blocked')
  assert.throws(() => f.db.prepare(`INSERT INTO portfolio_deletion_inventory
    (job_id,storage_prefix,allocation_count,verified_by,evidence_reference) VALUES(?,?,1,'auditor','matching-name')`).run(jobId, prefix), /trusted inventory/)
})

test('interrupted creation without its zero-write root seal cannot be certified', async t => {
  const f = fixture(t)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  await signedProtocolFixture(f, 2330)
  f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix,storage_birth_token) VALUES(3,?,?,?,?)')
    .run('Fake interrupted creation', 'fake-interrupted', 'portfolio-initial/' + uuid(2330) + '/', cleanupToken(2330))
  const cookie = await login(f)
  await mark(f, cookie, 3)
  assert.equal((await attestPortfolioInventory(f.env.bitreca_db, f.trust, jobs(f)[0].id)).state, 'blocked')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_birth_seals').get().n, 0)
})

test('invalid, cross-scope, and false-settlement signed reports cannot establish a trusted protocol epoch', async t => {
  const f = fixture(t)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  const report = await signedProtocolFixture(f, 2340)
  for (const change of [
    { id: uuid(2341), legacy_writers_settled: false },
    { id: uuid(2342), storage_scope: 'another-customer-bucket' },
    { id: uuid(2343), writer_protocol: 0 },
    { id: uuid(2344), verified_at: report.verified_at + 10000 },
  ]) {
    const evidence = await f.signReport({ ...report, ...change })
    assert.equal((await registerStorageProtocolVerification(f.env.bitreca_db, f.trust, evidence)).state, 'blocked')
  }
  const tampered = { ...f.protocolEvidence, signature: new Uint8Array(64) }
  assert.equal((await registerStorageProtocolVerification(f.env.bitreca_db, f.trust, tampered)).state, 'blocked')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_protocol_verifications').get().n, 1)
})

test('a valid report cannot be imported while the authoritative cutover is still disabled', async t => {
  const f = fixture(t)
  // Generate fake signatures without importing an epoch into this database.
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const trust = { publicKeySpki: new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)), storageScope: 'fixture' }
  const payload = JSON.stringify({ version: 1, id: uuid(2350), storage_scope: 'fixture', writer_protocol: 1,
    deployment_sha256: '1'.repeat(64), evidence_sha256: '2'.repeat(64), legacy_writers_settled: true, verified_at: 1 })
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(payload)))
  assert.equal((await registerStorageProtocolVerification(f.env.bitreca_db, trust, { payload, signature })).state, 'blocked')
  assert.equal(f.db.prepare('SELECT minimum_protocol_version FROM portfolio_storage_writer_policy').get().minimum_protocol_version, 0)
})

test('a mismatched verifier key or storage scope cannot attest an otherwise complete inventory', async t => {
  const f = await cleanupFixture(t)
  assert.equal((await attestPortfolioInventory(f.env.bitreca_db, { ...f.trust, storageScope: 'foreign-scope' }, f.jobId)).state, 'blocked')
  const foreign = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const wrongKey = { ...f.trust, publicKeySpki: new Uint8Array(await crypto.subtle.exportKey('spki', foreign.publicKey)) }
  assert.equal((await attestPortfolioInventory(f.env.bitreca_db, wrongKey, f.jobId)).state, 'blocked')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 0)
})

test('concurrent uploads block inventory attestation until every registered writer definitively settles', async t => {
  const f = await inventoryCreationFixture(t), point = gate()
  f.state.putGate = point
  const first = f.uploadNew()
  await point.started.promise
  try {
    assert.equal((await f.uploadNew()).status, 200)
    await f.markInventory()
    assert.equal((await f.attest()).state, 'blocked')
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 0)
  } finally { point.resume.resolve() }
  assert.equal((await first).status, 409)
  const proof = await f.attest()
  assert.equal(proof.state, 'attested')
  assert.equal(proof.allocationCount, 3)
})

test('a pending upload without registration cannot write after deletion and cannot alter an attested inventory', async t => {
  const f = await inventoryCreationFixture(t), point = gate()
  f.state.listGate = point
  const pending = f.uploadNew()
  await point.started.promise
  try {
    await f.markInventory()
    assert.equal((await f.attest()).state, 'attested')
    assert.equal(f.state.puts, 0)
  } finally { point.resume.resolve() }
  assert.equal((await pending).status, 409)
  assert.equal(f.state.puts, 0)
  assert.equal((await f.attest()).allocationCount, 1)
})

test('an uncertain R2 write is never converted into trusted inventory evidence', async t => {
  const f = await inventoryCreationFixture(t)
  f.state.fail = 'write-response-lost'
  assert.equal((await f.uploadNew()).status, 500)
  f.state.fail = null
  await f.markInventory()
  assert.equal((await f.attest()).state, 'blocked')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 0)
})

test('a foreign ownership conflict appearing during verification invalidates the atomic attestation checkpoint', async t => {
  const f = await cleanupFixture(t)
  f.state.beforeRun = async query => {
    if (query.startsWith('INSERT INTO portfolio_inventory_verifications')) {
      f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix) VALUES(4,?,?,?)')
        .run('Fake conflicting customer', 'inventory-conflict', f.prefix + 'nested/')
    }
  }
  assert.equal((await f.certify()).state, 'blocked')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 0)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_inventory').get().n, 0)
})

test('lost attestation responses and duplicate verifiers recover one immutable proof and one inventory row', async t => {
  const f = await cleanupFixture(t)
  f.state.fail = 'inventory-response-lost'
  assert.equal((await f.certify()).state, 'blocked')
  const results = await Promise.all([f.certify(), f.certify()])
  assert.ok(results.every(result => result.state === 'attested'))
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 1)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_inventory').get().n, 1)
  for (const table of ['portfolio_storage_origins', 'portfolio_storage_birth_seals', 'portfolio_storage_allocation_events', 'portfolio_inventory_verifications']) {
    assert.throws(() => f.db.exec('DELETE FROM ' + table), /retained/)
  }
})

test('allocation snapshots are paginated and remain complete beyond a single verification page', async t => {
  const f = await cleanupFixture(t, Array(105).fill('closed'))
  const result = await f.certify()
  assert.equal(result.state, 'attested')
  assert.equal(result.allocationCount, 106)
  assert.equal(f.db.prepare('SELECT allocation_count FROM portfolio_deletion_inventory').get().allocation_count, 106)
  assert.equal(f.state.puts + f.state.reads + f.state.lists, 0)
})

test('entry points delegate inventory verification to the configured API and dispatcher', () => {
  for (const path of ['../worker/index.js', '../portfolio-hosting/index.js', '../worker/portfolio-cleanup-executor.js', '../worker/portfolio-finalization.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.ok(!source.includes('attestPortfolioInventory'))
    assert.ok(!source.includes('registerStorageProtocolVerification'))
  }
})

test('registered UUID prefixes with cyclic or future source history cannot be certified', async t => {
  const f = await inventoryCreationFixture(t)
  const one = 'portfolio-versions/' + f.created.id + '/' + uuid(2400) + '/'
  const two = 'portfolio-versions/' + f.created.id + '/' + uuid(2401) + '/'
  const insert = f.db.prepare(`INSERT INTO portfolio_storage_allocations
    (prefix,portfolio_id,allocation_kind,upload_state,source_prefix,writer_protocol_version,writer_token,writer_state)
    VALUES(?,?,'folder','uploading',?,1,?,'open')`)
  insert.run(one, f.created.id, two, cleanupToken(2400))
  insert.run(two, f.created.id, one, cleanupToken(2401))
  f.db.prepare("UPDATE portfolio_storage_allocations SET writer_state='closed',writer_closed_at=unixepoch() WHERE portfolio_id=? AND writer_state='open'").run(f.created.id)
  await f.markInventory()
  assert.equal((await f.attest()).state, 'blocked')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 0)
})

test('oversized inventories fail closed before enumeration rather than skipping allocations', async t => {
  const f = await cleanupFixture(t)
  const binding = f.env.bitreca_db
  let enumerated = false
  const limited = { prepare(sql) {
    if (sql === 'SELECT * FROM portfolio_inventory_history WHERE job_id=?') {
      return { bind: () => ({ first: async () => ({ ...f.db.prepare(sql).get(f.jobId), allocation_count: 2001 }) }) }
    }
    if (sql.includes('LIMIT 100')) enumerated = true
    return binding.prepare(sql)
  } }
  assert.equal((await attestPortfolioInventory(limited, f.trust, f.jobId)).state, 'blocked')
  assert.equal(enumerated, false)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 0)
})

test('malformed empty-namespace responses never produce a portfolio birth or allocation evidence', async t => {
  const f = fixture(t), cookie = await login(f)
  f.env.bitreca_media.list = async () => ({ objects: [] })
  const result = await worker.fetch(request('/api/admin/portfolios', 'POST', {
    name: 'Fake malformed namespace', slug: 'malformed-namespace',
  }, cookie), f.env)
  assert.equal(result.status, 503)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolios').get().n, 2)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_origins').get().n, 0)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_allocation_events').get().n, 0)
})

test('old manual attestations survive migration but cannot masquerade as verified protocol history', async t => {
  const f = await cleanupFixture(t, [], null, 11)
  await f.certify()
  const inventory = f.db.prepare('SELECT * FROM portfolio_deletion_inventory').all()
  const portfolios = f.db.prepare('SELECT * FROM portfolios').all()
  f.db.exec(readFileSync(new URL('../migrations/' + migrations[11], import.meta.url), 'utf8'))
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_deletion_inventory').all(), inventory)
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolios').all().map(({ storage_birth_token, ...row }) => {
    assert.equal(storage_birth_token, null)
    return row
  }), portfolios.map(row => ({ ...row })))
  assert.equal((await f.status()).eligible_for_preparation, false)
  assert.equal(await f.claim(), null)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 0)
})

async function workflowFixture(t, states = ['completed', 'failed']) {

  
  const bucket = 'portfolioforest-stage-fixture', database = '22222222-2222-4222-8222-222222222222'
  const scope = `portfolioforest/staging/${bucket}/${database}`
  const f = await cleanupFixture(t, states, null, migrations.length, scope)
  Object.assign(f.env, {  PORTFOLIO_ENVIRONMENT: 'staging',
 PORTFOLIO_CLEANUP_ENABLED: 'true', PORTFOLIO_FINALIZATION_ENABLED: 'true',
    PORTFOLIO_SCHEDULE_ENABLED: 'true', PORTFOLIO_BUCKET_NAME: bucket, PORTFOLIO_DATABASE_ID: database,
    PORTFOLIO_STORAGE_SCOPE: scope, PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI: btoa(String.fromCharCode(...f.trust.publicKeySpki)) })
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', f.trust.publicKeySpki)), byte => byte.toString(16).padStart(2, '0')).join('')
  f.db.prepare(`UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,environment='staging',
    storage_scope=?,bucket_name=?,database_id=?,signer_sha256=?,cleanup_enabled=1,finalization_enabled=1 WHERE id=1`)
    .run(scope, bucket, database, fingerprint)
  f.r2 = cleanupR2(f)
  for (const { prefix } of f.db.prepare('SELECT prefix FROM portfolio_storage_allocations WHERE portfolio_id=3').all()) f.r2.objects.set(prefix + 'index.html', 'fake')
  f.identityReads = 0
  f.r2.head = async key => {
    assert.equal(key, PORTFOLIO_STORAGE_SENTINEL)
    f.identityReads++
    return { customMetadata: { environment: 'staging', storage_scope: scope, bucket_name: bucket, database_id: database } }
  }
  f.env.bitreca_media = f.r2
  return f
}

test('workflow defaults make no database or storage calls, including a scheduled event', async () => {
  const env = { bitreca_db: { prepare() { assert.fail('Disabled execution must not query D1') } },
    bitreca_media: { list() { assert.fail('No list') }, delete() { assert.fail('No delete') }, head() { assert.fail('No head') } } }
  assert.equal((await schedulePortfolioDeletions(env)).state, 'disabled')
  assert.equal((await runPortfolioDeletionJob(env, uuid(2500))).state, 'disabled')
  assert.equal((await worker.scheduled({}, env)).state, 'disabled')
  assert.equal((await deletionCapabilities(env)).requestsEnabled, false)
})

test('connected workflow verifies inventory, resumes bounded cleanup, finalizes and preserves all receipts', async t => {
  const f = await workflowFixture(t), foreign = new Map(f.state.objects)
  for (let invocation = 0; invocation < 30; invocation++) {
    const result = await runPortfolioDeletionJob(f.env, f.jobId)
    if (result.state === 'finalized') break
    assert.equal(result.state, 'queued')
    assert.ok(f.r2.lists.length + f.r2.deletes.length <= (invocation + 1) * 2)
    f.advance(6)
  }
  assert.equal((await f.status()).phase, 'finalized')
  assert.equal(finalizations(f).length, 1)
  assert.equal(f.db.prepare('SELECT phase FROM portfolio_deletion_dispatch WHERE job_id=?').get(f.jobId).phase, 'finalized')
  assert.deepEqual(f.r2.objects, foreign)
  const calls = f.r2.lists.length + f.r2.deletes.length
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'busy')
  assert.equal(calls, f.r2.lists.length + f.r2.deletes.length)
})

test('environment flags alone cannot override the authoritative disabled D1 policy', async t => {
  const f = await workflowFixture(t)
  f.db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,cleanup_enabled=0,finalization_enabled=0')
  assert.equal(await getDeletionAuthorization(f.env), null)
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'disabled')
  assert.equal(f.identityReads, 0)
  assert.equal(f.r2.deletes.length + f.r2.lists.length, 0)
})

test('staging configuration refuses production resource IDs before any bucket access', async t => {
  const f = await workflowFixture(t)
  f.env.PORTFOLIO_BUCKET_NAME = 'bitreca-media'
  f.env.PORTFOLIO_STORAGE_SCOPE = `portfolioforest/staging/bitreca-media/${f.env.PORTFOLIO_DATABASE_ID}`
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'disabled')
  assert.equal(f.identityReads, 0)
  assert.equal(f.r2.lists.length + f.r2.deletes.length, 0)
})

test('a production bucket bound under a staging alias is rejected by identity metadata', async t => {
  const f = await workflowFixture(t)
  f.r2.head = async () => ({ customMetadata: { environment: 'production', bucket_name: 'bitreca-media' } })
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'blocked')
  assert.equal(f.r2.lists.length + f.r2.deletes.length, 0)
  assert.equal(finalizations(f).length, 0)
  const reported = await worker.fetch(request('/api/admin/portfolio-deletion-jobs/' + f.jobId, 'GET', undefined, f.cookie), f.env)
  const job = (await reported.json()).job
  assert.equal(job.phase, 'blocked')
  assert.equal(job.error.code, 'CONFIGURATION_BLOCKED')
})

test('authoritative policy revocation during a listing prevents the following DELETE', async t => {
  const f = await workflowFixture(t), point = gate()
  f.r2.listGate = point
  const running = runPortfolioDeletionJob(f.env, f.jobId)
  await point.started.promise
  try { f.db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,cleanup_enabled=0,finalization_enabled=0') }
  finally { point.resume.resolve() }
  assert.deepEqual(await running, { state: 'blocked', error: { code: 'CONFIGURATION_BLOCKED' } })
  assert.equal(f.r2.deletes.length, 0)
  assert.equal(finalizations(f).length, 0)
  const dispatch = f.db.prepare('SELECT phase,error_code FROM portfolio_deletion_dispatch WHERE job_id=?').get(f.jobId)
  assert.equal(dispatch.phase, 'blocked')
  assert.equal(dispatch.error_code, 'CONFIGURATION_BLOCKED')
  const manifests = f.db.prepare('SELECT * FROM portfolio_deletion_batches').all()
  assert.ok(manifests.length > 0, 'The exact deletion intent survives revocation.')
  f.db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,cleanup_enabled=1,finalization_enabled=1')
  f.advance(61)
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'busy', 'Restoring policy alone cannot restart a blocked job.')
  assert.equal((await retryPortfolioDeletion(f.env.bitreca_db, f.jobId)).retry_queued, true)
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'queued')
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_deletion_batches').all().slice(0, manifests.length), manifests)
  assert.equal(f.r2.deletes.length, 1, 'An explicit retry replays the retained manifest under fresh authority.')
})

test('authorization revoked before guarded LIST blocks dispatch without recording storage failure or deleting', async t => {
  const f = await workflowFixture(t)
  const head = f.r2.head
  f.r2.head = async key => {
    const identity = await head(key)
    f.db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,cleanup_enabled=0,finalization_enabled=0')
    return identity
  }
  assert.deepEqual(await runPortfolioDeletionJob(f.env, f.jobId), { state: 'blocked', error: { code: 'CONFIGURATION_BLOCKED' } })
  assert.equal(f.r2.lists.length, 0)
  assert.equal(f.r2.deletes.length, 0)
  assert.equal((await f.status()).retries, 0)
  assert.equal(finalizations(f).length, 0)
})

test('workflow never infers settlement and retries do not modify uncertain writers', async t => {
  const f = await workflowFixture(t, ['uncertain'])
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'blocked')
  const before = f.db.prepare('SELECT * FROM portfolio_storage_allocations').all()
  await retryPortfolioDeletion(f.env.bitreca_db, f.jobId)
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'blocked')
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_storage_allocations').all(), before)
  assert.equal(f.identityReads, 0)
})

test('a workflow with an open writer waits without accessing R2', async t => {
  const f = await workflowFixture(t, ['open'])
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'waiting_writers')
  assert.equal(f.identityReads, 0)
  assert.equal(f.db.prepare('SELECT phase FROM portfolio_deletion_dispatch WHERE job_id=?').get(f.jobId).phase, 'waiting_writers')
})

test('scheduler processes at most one job and overlapping dispatchers cannot share a lease', async t => {
  const f = await workflowFixture(t), point = gate()
  f.r2.listGate = point
  const running = schedulePortfolioDeletions(f.env)
  await point.started.promise
  try { assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'busy') }
  finally { point.resume.resolve() }
  assert.equal((await running).processed, 1)
})

test('finalization has a separate approval and cannot race an authoritative revision change', async t => {
  const f = await workflowFixture(t, [])
  f.env.PORTFOLIO_FINALIZATION_ENABLED = 'false'
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'queued')
  f.advance(6)
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'storage_verified')
  assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
  const lease = await claimFinalizationLease(f.env.bitreca_db, f.jobId, cleanupToken(2600))
  lease.authorizationRevision = 1
  f.db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,finalization_enabled=0')
  assert.notEqual((await finalizePortfolioDeletion(f.env.bitreca_db, lease)).state, 'finalized')
  assert.equal(finalizations(f).length, 0)
})

test('deletion requests require explicit enablement and exact portfolio-ID confirmation', async t => {
  const f = fixture(t), cookie = await login(f)
  const noConfirmation = await worker.fetch(request('/api/admin/portfolios/1', 'DELETE', undefined, cookie), f.env)
  assert.equal(noConfirmation.status, 400)
  f.env.PORTFOLIO_DELETE_REQUESTS_ENABLED = 'false'
  assert.equal((await mark(f, cookie)).status, 503)
  assert.equal(jobs(f).length, 0)
  assert.equal(portfolio(f).deletion_requested_at, null)
})

test('job listing, capabilities, retry and evidence import preserve authentication and Origin protection', async t => {
  const f = await workflowFixture(t)
  for (const [path, method] of [
    ['/api/admin/portfolio-deletion-capabilities', 'GET'], ['/api/admin/portfolio-deletion-jobs', 'GET'],
    ['/api/admin/portfolio-deletion-jobs/' + f.jobId + '/retry', 'POST'], ['/api/admin/portfolio-protocol-evidence', 'POST'],
  ]) {
    assert.equal((await worker.fetch(request(path, method), f.env)).status, 401)
    if (method === 'POST') assert.equal((await worker.fetch(request(path, method, {}, f.cookie, 'https://foreign.invalid'), f.env)).status, 403)
  }
  const listing = await worker.fetch(request('/api/admin/portfolio-deletion-jobs', 'GET', undefined, f.cookie), f.env)
  assert.equal(listing.status, 200)
  const text = await listing.text()
  assert.ok(!/lease_token|keys_json|storage_prefix|writer_token/.test(text))
  assert.equal(listing.headers.get('Cache-Control'), 'no-store')
  assert.equal((await worker.fetch(request('/api/admin/portfolio-deletion-jobs/' + f.jobId + '/retry', 'POST', {}, f.cookie), f.env)).status, 202)
  assert.equal(f.r2.lists.length + f.r2.deletes.length, 0)
  assert.equal((await worker.fetch(request('/api/admin/portfolio-protocol-evidence', 'POST', {}, f.cookie), f.env)).status, 503)
})

test('complete customer workflow preserves assets, fences a delayed writer and resumes partial cleanup through permanent receipts', async t => {
  const bucket = 'portfolioforest-stage-fixture', database = '22222222-2222-4222-8222-222222222222'
  const scope = `portfolioforest/staging/${bucket}/${database}`
  const f = await inventoryCreationFixture(t, true, scope)
  let now = Math.floor(Date.now() / 1000)
  f.db.function('unixepoch', () => now)
  f.advance = seconds => { now += seconds }
  const current = () => f.db.prepare('SELECT * FROM portfolios WHERE id=?').get(f.created.id)
  assert.equal(f.created.id, 3)
  const other = await worker.fetch(request('/api/admin/portfolios', 'POST', { name: 'Fixture B', slug: 'fixture-b' }, f.cookie), f.env)
  assert.equal(other.status, 201)
  const otherFolder = new FormData()
  for (const [name, content] of [['index.html', 'OTHER HTML'], ['style.css', 'OTHER CSS']]) {
    otherFolder.append('files', new File([content], name)); otherFolder.append('paths', name)
  }
  assert.equal((await worker.fetch(request('/api/admin/portfolios/4/upload-folder', 'POST', otherFolder, f.cookie), f.env)).status, 200)
  const foreign = new Map(f.state.objects)
  const initialHtml = new FormData(); initialHtml.append('file', new File(['Initial standalone fixture'], 'index.html'))
  assert.equal((await worker.fetch(request('/api/admin/portfolios/3/upload', 'POST', initialHtml, f.cookie), f.env)).status, 200)
  assert.equal((await f.uploadNew()).status, 200)
  const folderPrefix = current().storage_prefix
  const form = new FormData()
  form.append('file', new File(['<!doctype html><h1>Replacement fixture</h1>'], 'index.html', { type: 'text/html' }))
  const replacement = await worker.fetch(request('/api/admin/portfolios/3/upload', 'POST', form, f.cookie), f.env)
  assert.equal(replacement.status, 200)
  assert.notEqual(current().storage_prefix, folderPrefix)
  assert.equal(f.state.objects.get(current().storage_prefix + 'style.css'), 'NEW CSS')
  assert.equal(f.state.objects.get(folderPrefix + 'index.html'), 'NEW HTML')
  const publication = value => worker.fetch(request('/api/admin/portfolios/3/status', 'PATCH', { status: value }, f.cookie), f.env)
  assert.equal((await publication('published')).status, 200)
  assert.equal(await (await serve(f, 'inventory-fixture')).text(), '<!doctype html><h1>Replacement fixture</h1>')
  assert.equal((await f.uploadNew()).status, 200)
  assert.equal(await (await serve(f, 'inventory-fixture')).text(), 'NEW HTML')
  assert.equal((await publication('draft')).status, 200)
  const point = gate(); f.state.puts = 0; f.state.putGate = point
  const pending = f.uploadNew()
  await point.started.promise
  await f.markInventory()
  Object.assign(f.env, {
  PORTFOLIO_ENVIRONMENT: 'staging',
  PORTFOLIO_CLEANUP_ENABLED: 'true',
  PORTFOLIO_FINALIZATION_ENABLED: 'true',
  PORTFOLIO_SCHEDULE_ENABLED: 'true',
    PORTFOLIO_BUCKET_NAME: bucket, PORTFOLIO_DATABASE_ID: database, PORTFOLIO_STORAGE_SCOPE: scope,
    PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI: btoa(String.fromCharCode(...f.trust.publicKeySpki)) })
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', f.trust.publicKeySpki)), byte => byte.toString(16).padStart(2, '0')).join('')
  f.db.prepare(`UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,environment='staging',storage_scope=?,
    bucket_name=?,database_id=?,signer_sha256=?,cleanup_enabled=1,finalization_enabled=1`).run(scope, bucket, database, fingerprint)
  try {
    assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'waiting_writers')
    assert.equal((await serve(f, 'inventory-fixture')).status, 404)
    assert.equal((await publication('published')).status, 409)
    assert.equal((await f.uploadNew()).status, 409)
    assert.equal((await worker.fetch(request('/api/admin/portfolios/3', 'PUT', { name: 'No', slug: 'no' }, f.cookie), f.env)).status, 409)
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_prefix_receipts').get().n, 0)
  } finally { point.resume.resolve() }
  assert.equal((await pending).status, 409)
  assert.equal(f.state.writesAfterMark, 1, 'The already-issued PUT must settle before cleanup; no second PUT is issued.')
  assert.ok(f.db.prepare('SELECT writer_state FROM portfolio_storage_allocations WHERE portfolio_id=3').all().every(row => row.writer_state === 'closed'))
  const r2 = cleanupR2(f); r2.partialOnce = true
  r2.head = async key => {
    assert.equal(key, PORTFOLIO_STORAGE_SENTINEL)
    return { customMetadata: { environment: 'staging', storage_scope: scope, bucket_name: bucket, database_id: database } }
  }
  f.env.bitreca_media = r2
  let sawRetry = false
  for (let turn = 0; turn < 40; turn++) {
    f.advance(turn === 0 ? 61 : 3601)
    const result = await runPortfolioDeletionJob(f.env, f.jobId)
    if (result.state === 'retry_wait') sawRetry = true
    if (result.state === 'finalized') break
    assert.ok(['queued', 'retry_wait'].includes(result.state), JSON.stringify(result))
  }
  assert.equal(sawRetry, true)
  assert.equal(current(), undefined)
  assert.deepEqual(r2.objects, foreign)
  assert.equal(finalizations(f).length, 1)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_allocations WHERE portfolio_id=3').get().n, 6)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_prefix_receipts WHERE job_id=?').get(f.jobId).n, 6)
  const otherPrefix = f.db.prepare('SELECT storage_prefix FROM portfolios WHERE id=4').get().storage_prefix
  assert.equal(r2.objects.get(otherPrefix + 'style.css'), 'OTHER CSS')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications WHERE job_id=?').get(f.jobId).n, 1)
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), [])
  assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
})

test('evidence import uses server-pinned trust, is replay-safe and rejects invalid or oversized packages', async t => {
  const f = await workflowFixture(t)
  f.env.PORTFOLIO_EVIDENCE_IMPORT_ENABLED = 'true'
  const path = '/api/admin/portfolio-protocol-evidence'
  const body = { payload: f.protocolEvidence.payload, signature_base64: btoa(String.fromCharCode(...f.protocolEvidence.signature)) }
  assert.equal((await worker.fetch(request(path, 'POST', body, f.cookie), f.env)).status, 200)
  assert.equal((await worker.fetch(request(path, 'POST', body, f.cookie), f.env)).status, 200)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_protocol_verifications').get().n, 1)
  assert.equal((await worker.fetch(request(path, 'POST', { ...body, payload: body.payload.replace('staging', 'foreign') }, f.cookie), f.env)).status, 409)
  assert.equal((await worker.fetch(request(path, 'POST', { payload: 'x'.repeat(40000) }, f.cookie), f.env)).status, 413)
  assert.equal(f.r2.deletes.length + f.r2.lists.length, 0)
})

test('0013 preserves existing deletion history and initializes disabled policy and replay-safe dispatch rows', async t => {
  const f = await cleanupFixture(t, [], null, 12)
  const tables = ['portfolios', 'portfolio_storage_allocations', 'portfolio_deletion_jobs', 'portfolio_deletion_executions', 'portfolio_storage_origins']
  const before = tables.map(table => f.db.prepare('SELECT * FROM ' + table).all())
  f.db.exec(readFileSync(new URL('../migrations/' + migrations[12], import.meta.url), 'utf8'))
  for (const [index, table] of tables.entries()) assert.deepEqual(f.db.prepare('SELECT * FROM ' + table).all(), before[index])
  const policy = f.db.prepare('SELECT * FROM portfolio_deletion_runtime_policy').get()
  assert.equal(policy.cleanup_enabled, 0); assert.equal(policy.finalization_enabled, 0); assert.equal(policy.revision, 0)
  assert.equal(f.db.prepare('SELECT phase FROM portfolio_deletion_dispatch WHERE job_id=?').get(f.jobId).phase, 'queued')
  assert.throws(() => f.db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=0'), /new revision/)
  assert.throws(() => f.db.exec('DELETE FROM portfolio_deletion_runtime_policy'), /retained/)
  assert.throws(() => f.db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,cleanup_enabled=1'), /CHECK/)
  assert.throws(() => f.db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,finalization_enabled=1'), /CHECK/)
  for (const column of ['environment', 'storage_scope', 'bucket_name', 'database_id', 'signer_sha256']) {
    const values = { environment: 'staging', storage_scope: 'fixture', bucket_name: 'fixture', database_id: uuid(2700), signer_sha256: '1'.repeat(64) }
    values[column] = null
    assert.throws(() => f.db.prepare(`UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,cleanup_enabled=1,
      environment=?,storage_scope=?,bucket_name=?,database_id=?,signer_sha256=?`).run(...Object.values(values)), /CHECK/)
  }
  assert.throws(() => f.db.exec('UPDATE portfolio_deletion_dispatch SET generation=-1'), /revision|CHECK/)
  assert.throws(() => f.db.exec('DELETE FROM portfolio_deletion_dispatch'), /retained/)
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), [])
})

test('a lost dispatch claim response preserves its lease and resumes after takeover without touching storage prematurely', async t => {
  const f = await workflowFixture(t, [])
  f.state.fail = 'dispatch-claim-response-lost'
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'retry_wait')
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'busy')
  assert.equal(f.identityReads, 0)
  f.advance(121)
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'queued')
  assert.equal(f.db.prepare('SELECT generation FROM portfolio_deletion_dispatch WHERE job_id=?').get(f.jobId).generation, 2)
})

test('a lost dispatch checkpoint response retains durable cleanup progress rather than resetting manifests', async t => {
  const f = await workflowFixture(t, [])
  f.state.fail = 'dispatch-checkpoint-response-lost'
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'retry_wait')
  assert.equal(f.db.prepare('SELECT phase FROM portfolio_deletion_dispatch WHERE job_id=?').get(f.jobId).phase, 'queued')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_batches WHERE job_id=?').get(f.jobId).n, 1)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_batch_receipts').get().n, 1)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_prefix_receipts WHERE job_id=?').get(f.jobId).n, 0,
    'The two-call budget listed and deleted; the next invocation must independently verify emptiness.')
  f.advance(6)
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'finalized')
  assert.equal(finalizations(f).length, 1)
})

test('a retry while a dispatcher is active reports that it was not queued and preserves the active lease', async t => {
  const f = await workflowFixture(t), point = gate()
  f.r2.listGate = point
  const running = runPortfolioDeletionJob(f.env, f.jobId)
  await point.started.promise
  try {
    const before = f.db.prepare('SELECT * FROM portfolio_deletion_dispatch WHERE job_id=?').get(f.jobId)
    const result = await worker.fetch(request('/api/admin/portfolio-deletion-jobs/' + f.jobId + '/retry', 'POST', {}, f.cookie), f.env)
    assert.equal(result.status, 202)
    const body = await result.json()
    assert.equal(body.job.retry_queued, false)
    assert.ok(body.message.includes('currently holds'))
    assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_deletion_dispatch WHERE job_id=?').get(f.jobId), before)
    const reported = await worker.fetch(request('/api/admin/portfolio-deletion-jobs/' + f.jobId, 'GET', undefined, f.cookie), f.env)
    assert.equal((await reported.json()).job.dispatch.active, true)
  } finally { point.resume.resolve() }
  await running
})

test('staging ten-file folder and HTML uploads remain within a conservative fifty-subrequest budget', async t => {
  const f = await inventoryCreationFixture(t)
  f.env.PORTFOLIO_UPLOAD_MAX_FILES = '10'
  const folder = new FormData()
  for (let index = 0; index < 10; index++) {
    const name = index ? `asset-${index}.css` : 'index.html'
    folder.append('files', new File(['tiny fixture'], name)); folder.append('paths', name)
  }
  const calls = () => f.state.queries + f.state.puts + f.state.reads + f.state.lists + f.state.heads
  let before = calls()
  assert.equal((await worker.fetch(request('/api/admin/portfolios/3/upload-folder', 'POST', folder, f.cookie), f.env)).status, 200)
  assert.ok(calls() - before <= 40)
  before = calls()
  const html = new FormData(); html.append('file', new File(['replacement fixture'], 'index.html'))
  assert.equal((await worker.fetch(request('/api/admin/portfolios/3/upload', 'POST', html, f.cookie), f.env)).status, 200)
  assert.ok(calls() - before <= 40)
  const active = f.db.prepare('SELECT storage_prefix FROM portfolios WHERE id=3').get().storage_prefix
  folder.append('files', new File(['tiny fixture'], 'eleventh.css')); folder.append('paths', 'eleventh.css')
  const puts = f.state.puts
  assert.equal((await worker.fetch(request('/api/admin/portfolios/3/upload-folder', 'POST', folder, f.cookie), f.env)).status, 400)
  assert.equal(f.state.puts, puts)
  assert.equal(f.db.prepare('SELECT storage_prefix FROM portfolios WHERE id=3').get().storage_prefix, active)
  f.state.objects.set(active + 'eleventh.css', 'fixture from an earlier larger upload budget')
  assert.equal((await worker.fetch(request('/api/admin/portfolios/3/upload', 'POST', html, f.cookie), f.env)).status, 413)
  assert.equal(f.state.puts, puts)
  f.env.PORTFOLIO_UPLOAD_MAX_FILES = 'invalid'
  assert.equal((await worker.fetch(request('/api/admin/portfolios/3/upload-folder', 'POST', folder, f.cookie), f.env)).status, 503)
  assert.equal(f.db.prepare('SELECT storage_prefix FROM portfolios WHERE id=3').get().storage_prefix, active)
})

test('D1 trigger-inclusive changes confirm portfolio birth, allocation registration and idempotent deletion receipts', async t => {
  const f = await inventoryCreationFixture(t)
  assert.equal((await f.uploadNew()).status, 200)
  await f.markInventory()
  assert.ok(f.state.triggerResults.some(result => result.operation.startsWith('INSERT INTO portfolios') && result.changes > 1))
  assert.ok(f.state.triggerResults.some(result => result.operation.startsWith('INSERT INTO portfolio_storage_allocations') && result.changes > 1))
  assert.ok(f.state.triggerResults.some(result => result.operation.startsWith('INSERT INTO portfolio_deletion_jobs') && result.changes >= 3))
  assert.equal((await mark(f, f.cookie, 3)).status, 202)
  assert.equal(jobs(f).length, 1)
  assert.equal((await f.attest()).state, 'attested')
})

test('staging one-operation cleanup reserves budget headroom for maximum inventory pagination', async t => {
  const f = await workflowFixture(t, Array(100).fill('closed'))
  f.env.PORTFOLIO_CLEANUP_R2_OPERATION_LIMIT = '1'
  const before = f.state.queries
  assert.equal((await schedulePortfolioDeletions(f.env)).processed, 1)
  // This real 101-allocation fixture needs two inventory pages; 2,000 need 20.
  // Reserve the other 18 SELECTs and both HEAD/LIST calls below the shared cap.
  assert.ok(f.state.queries - before + 18 + f.identityReads + f.r2.lists.length + f.r2.deletes.length <= 50)
  assert.equal(f.r2.lists.length + f.r2.deletes.length, 1)
  assert.equal(finalizations(f).length, 0)
  f.env.PORTFOLIO_CLEANUP_R2_OPERATION_LIMIT = '99'; f.advance(6)
  const calls = f.r2.lists.length + f.r2.deletes.length
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'disabled')
  assert.equal(f.r2.lists.length + f.r2.deletes.length, calls)
  const tiny = await workflowFixture(t)
  tiny.env.PORTFOLIO_CLEANUP_R2_OPERATION_LIMIT = '1'
  for (let turn = 0; turn < 15; turn++) {
    const queries = tiny.state.queries, storage = tiny.identityReads + tiny.r2.lists.length + tiny.r2.deletes.length
    const result = await runPortfolioDeletionJob(tiny.env, tiny.jobId)
    const total = tiny.state.queries - queries + tiny.identityReads + tiny.r2.lists.length + tiny.r2.deletes.length - storage
    assert.ok(total + 19 <= 50, 'Reserve all 20 inventory SELECT pages even on the finalization invocation.')
    if (result.state === 'finalized') break
    assert.equal(result.state, 'queued'); tiny.advance(6)
  }
  assert.equal(finalizations(tiny).length, 1)
})

async function enrollSoloFixture(f, generation = 1, operatorKey) {
  // Synthetic :memory: policy only; reuse ephemeral test keys, never write keys.
  const fingerprint = operatorKey || Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', f.trust.publicKeySpki)), byte => byte.toString(16).padStart(2, '0')).join('')
  const policyId = uuid(10000 + generation), now = f.db.prepare('SELECT unixepoch() AS now').get().now
  const trust = { ...f.trust, authorizationPolicy: 'solo-operator-v1', policyId, policyGeneration: generation,
    operatorId: 'fixture-owner', operatorKeyId: fingerprint, deploymentSha256: '3'.repeat(64) }
  f.db.prepare(`INSERT INTO portfolio_storage_authorization_policies VALUES(?,?,'solo-operator-v1',?,?,?,?,?)`)
    .run(policyId, generation, trust.operatorId, fingerprint, trust.storageScope, trust.deploymentSha256, now)
  f.db.prepare(`UPDATE portfolio_storage_authorization_state SET policy='solo-operator-v1',generation=?,policy_id=? WHERE id=1`).run(generation, policyId)
  f.trust = trust
  Object.assign(f.env, { PORTFOLIO_AUTHORIZATION_POLICY: trust.authorizationPolicy, PORTFOLIO_AUTHORIZATION_POLICY_ID: policyId,
    PORTFOLIO_AUTHORIZATION_GENERATION: String(generation), PORTFOLIO_OPERATOR_ID: trust.operatorId,
    PORTFOLIO_OPERATOR_KEY_ID: fingerprint, PORTFOLIO_DEPLOYMENT_SHA256: trust.deploymentSha256 })
  const report = { version: 2, id: uuid(11000 + generation), authorization_policy: trust.authorizationPolicy,
    policy_id: policyId, policy_generation: generation, operator_id: trust.operatorId, operator_key_id: fingerprint,
    deployment_verified_at: now, writers_fenced_at: now, writers_settled_at: now,
    storage_scope: trust.storageScope, writer_protocol: 1, deployment_sha256: trust.deploymentSha256,
    evidence_sha256: '4'.repeat(64), legacy_writers_settled: true, verified_at: now }
  return report
}

async function soloPolicyFixture(t) {
  const f = fixture(t)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  await signedProtocolFixture(f)
  f.independentTrust = { ...f.trust }
  f.soloReport = await enrollSoloFixture(f)
  f.importSolo = report => f.signReport(report || f.soloReport).then(evidence => registerStorageProtocolVerification(f.env.bitreca_db, f.trust, evidence))
  return f
}

test('solo policy rejects version confusion and preserves independent records without conversion', async t => {
  const f = await soloPolicyFixture(t)
  const prior = f.db.prepare('SELECT * FROM portfolio_storage_protocol_verifications').all()
  assert.equal((await registerStorageProtocolVerification(f.env.bitreca_db, f.trust, f.protocolEvidence)).state, 'blocked')
  assert.equal((await registerStorageProtocolVerification(f.env.bitreca_db, f.independentTrust, await f.signReport(f.soloReport))).state, 'blocked')
  assert.equal((await registerStorageProtocolVerification(f.env.bitreca_db, f.independentTrust, f.protocolEvidence)).state, 'recorded', 'Exact immutable replay conveys no solo authority.')
  assert.equal((await f.importSolo()).state, 'recorded')
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_storage_protocol_verifications WHERE id=?').all(prior[0].id), prior)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_authorized_epochs').get().n, 1)
  await assert.rejects(requireCurrentAuthorization(f.env.bitreca_db, f.independentTrust))
})

test('solo evidence rejects wrong key, scope, artifact, generation, chronology and unsettled claims', async t => {
  const f = await soloPolicyFixture(t)
  for (const change of [{ operator_key_id: '0'.repeat(64) }, { authorization_policy: 'independent-v1' },
    { storage_scope: 'foreign' }, { deployment_sha256: '0'.repeat(64) }, { policy_generation: 2 },
    { policy_id: uuid(999) }, { operator_id: 'another-owner' }, { legacy_writers_settled: false },
    { deployment_verified_at: f.soloReport.verified_at - 1 }, { writers_settled_at: f.soloReport.verified_at + 1 },
    { writers_fenced_at: -1 }, { verified_at: f.soloReport.verified_at + 3600 }]) {
    assert.equal((await f.importSolo({ ...f.soloReport, ...change })).state, 'blocked', JSON.stringify(change))
  }
  const other = fixture(t)
  other.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  await signedProtocolFixture(other)
  assert.equal((await registerStorageProtocolVerification(f.env.bitreca_db, f.trust, await other.signReport(f.soloReport))).state, 'blocked')
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_authorized_epochs').get().n, 0)
})

test('solo revoked keys invalidate imported evidence permanently and disable runtime execution', async t => {
  const f = await soloPolicyFixture(t)
  assert.equal((await f.importSolo()).state, 'recorded')
  const revision = f.db.prepare('SELECT revision FROM portfolio_deletion_runtime_policy').get().revision
  f.db.prepare('INSERT INTO portfolio_storage_key_revocations(operator_key_id) VALUES(?)').run(f.trust.operatorKeyId)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_authorized_epochs').get().n, 0)
  await assert.rejects(requireCurrentAuthorization(f.env.bitreca_db, f.trust))
  assert.equal((await f.importSolo()).state, 'blocked')
  assert.throws(() => f.db.exec('DELETE FROM portfolio_storage_key_revocations'), /retained/)
  assert.throws(() => f.db.exec('UPDATE portfolio_storage_key_revocations SET revoked_at=0'), /permanent/)
  assert.throws(() => f.db.prepare('INSERT OR REPLACE INTO portfolio_storage_key_revocations VALUES(?,0)').run(f.trust.operatorKeyId), /exists/)
  assert.equal(f.db.prepare('SELECT revision FROM portfolio_deletion_runtime_policy').get().revision, revision + 1)
  await assert.rejects(enrollSoloFixture(f, 2), /unrevoked/)
})

test('solo generation is forward-only and both rollback and restored older state fail against external pins', async t => {
  const f = await soloPolicyFixture(t)
  assert.equal((await f.importSolo()).state, 'recorded')
  const generationOne = { ...f.trust }
  const reportTwo = await enrollSoloFixture(f, 2)
  await assert.rejects(requireCurrentAuthorization(f.env.bitreca_db, generationOne))
  assert.equal((await registerStorageProtocolVerification(f.env.bitreca_db, generationOne, await f.signReport(f.soloReport))).state, 'blocked')
  assert.equal((await f.importSolo(reportTwo)).state, 'recorded')
  assert.throws(() => f.db.exec("UPDATE portfolio_storage_authorization_state SET policy='independent-v1',generation=0,policy_id=NULL"), /rollback/)
  assert.throws(() => f.db.prepare('UPDATE portfolio_storage_authorization_state SET generation=1,policy_id=?').run(generationOne.policyId), /rollback/)
  assert.throws(() => f.db.exec('DELETE FROM portfolio_storage_authorization_policies'), /retained/)
  assert.throws(() => f.db.exec('INSERT OR REPLACE INTO portfolio_storage_authorization_state VALUES(1,\'independent-v1\',0,NULL)'), /replaced/)
  // Simulate a restored older snapshot in a separate :memory: database.
  const restored = await soloPolicyFixture(t)
  await assert.rejects(requireCurrentAuthorization(restored.env.bitreca_db, f.trust))
  await assert.rejects(requireCurrentAuthorization(f.env.bitreca_db, { ...f.trust, deploymentSha256: '0'.repeat(64) }))
})

test('solo enrollment without actual signed writer-settlement evidence cannot authorize a birth', async t => {
  const f = await soloPolicyFixture(t), cookie = await login(f)
  // No signed v2 report was imported; old independent evidence remains inert.
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_storage_authorized_epochs').get().n, 0)
  assert.throws(() => f.db.prepare('INSERT INTO portfolios(name,slug,storage_prefix,storage_birth_token) VALUES(?,?,?,?)')
    .run('fake', 'fake-solo', 'portfolio-initial/' + uuid(2000) + '/', '1'.repeat(32)), /signed settlement/)
  assert.ok(cookie)
  assert.equal(f.state.puts, 0)
})

test('solo revocation invalidates an already attested inventory without changing its immutable proof', async t => {
  const f = await soloPolicyFixture(t)
  assert.equal((await f.importSolo()).state, 'recorded')
  const root = 'portfolio-initial/' + uuid(2010) + '/', token = '8'.repeat(32)
  f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix,storage_birth_token) VALUES(3,?,?,?,?)').run('fake','fake-revocation',root,token)
  f.db.prepare(`INSERT INTO portfolio_storage_allocations
    (prefix,portfolio_id,allocation_kind,upload_state,writer_protocol_version,writer_token,writer_state,writer_closed_at,
    authorization_policy_id,authorization_generation,authorization_artifact)
    VALUES(?,3,'initial','completed',1,?,'closed',?,?,1,?)`)
    .run(root,token,f.soloReport.verified_at,f.trust.policyId,f.trust.deploymentSha256)
  const cookie = await login(f)
  assert.equal((await mark(f,cookie,3)).status,202)
  const jobId = jobs(f).find(job => job.portfolio_id === 3).id
  assert.equal((await attestPortfolioInventory(f.env.bitreca_db,f.trust,jobId)).state,'attested')
  const proof = f.db.prepare('SELECT * FROM portfolio_inventory_verifications').all()
  f.db.prepare('INSERT INTO portfolio_storage_key_revocations(operator_key_id) VALUES(?)').run(f.trust.operatorKeyId)
  assert.deepEqual(f.db.prepare('SELECT * FROM portfolio_inventory_verifications').all(),proof)
  assert.equal((await getPortfolioDeletionStatus(f.env.bitreca_db,jobId)).eligible_for_preparation,false)
  assert.equal(await claimCleanupJob(f.env.bitreca_db,jobId,'9'.repeat(32)),null)
  assert.equal(await claimFinalizationLease(f.env.bitreca_db,jobId,'a'.repeat(32)),null)
})

test('solo policy keeps uncertain and untracked allocations ineligible, never settled by owner approval', async t => {
  for (const state of ['uncertain', 'open', 'untracked']) {
    const f = await soloPolicyFixture(t)
    assert.equal((await f.importSolo()).state, 'recorded')
    const root = 'portfolio-initial/' + uuid(2001) + '/', token = '5'.repeat(32)
    f.db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix,storage_birth_token) VALUES(3,?,?,?,?)').run('fake', 'fake-owner', root, token)
    const insert = f.db.prepare(`INSERT INTO portfolio_storage_allocations
      (prefix,portfolio_id,allocation_kind,upload_state,writer_protocol_version,writer_token,writer_state,writer_closed_at,
       authorization_policy_id,authorization_generation,authorization_artifact) VALUES(?,3,?,CASE WHEN ?='initial' THEN 'completed' ELSE 'uploading' END,1,?,?,?, ?,?,?)`)
    insert.run(root, 'initial', 'initial', token, 'closed', f.soloReport.verified_at, f.trust.policyId, 1, f.trust.deploymentSha256)
    if (state !== 'untracked') {
      const prefix = 'portfolio-versions/3/' + uuid(2002) + '/'
      insert.run(prefix, 'folder', 'folder', '6'.repeat(32), 'open', null, f.trust.policyId, 1, f.trust.deploymentSha256)
      if (state === 'uncertain') f.db.prepare("UPDATE portfolio_storage_allocations SET writer_state='uncertain' WHERE prefix=?").run(prefix)
    } else {
      assert.throws(() => f.db.prepare(`INSERT INTO portfolio_storage_allocations(prefix,portfolio_id,allocation_kind,upload_state)
        VALUES(?,3,'folder','completed')`).run('portfolio-versions/3/' + uuid(2002) + '/'), /authorization|protocol/)
      // Existing legacy portfolios cannot be silently adopted either.
      assert.throws(() => insert.run('portfolio-versions/1/' + uuid(2002) + '/', 'folder', 'folder', '7'.repeat(32), 'open', null,
        f.trust.policyId, 1, f.trust.deploymentSha256), /origin|source|prefix/)
    }
    const cookie = await login(f)
    if (state !== 'untracked') {
      assert.equal((await mark(f, cookie, 3)).status, 202)
      const job = jobs(f).find(job => job.portfolio_id === 3)
      assert.equal((await attestPortfolioInventory(f.env.bitreca_db, f.trust, job.id)).state, 'blocked')
      assert.equal(f.db.prepare('SELECT writer_state FROM portfolio_storage_allocations WHERE prefix<>? AND portfolio_id=3').get(root).writer_state, state)
    }
    assert.equal(f.state.puts, 0)
  }
})

for (const solo of [false, true]) test(`${solo ? 'solo-operator-v1' : 'independent-v1'} sandbox E2E rehearsal: frozen creation, tracked birth, both uploads, staging marking guard, recovery and separate finalization`, async t => {
  // Exact sandbox public identities, but SQLite/R2/keys/credentials are fake and
  // network is forbidden by beforeEach. This is not deployed sandbox evidence.
  const f = fixture(t), { databaseId, bucket } = sandboxResources
  const scope = `portfolioforest/staging/${bucket}/${databaseId}`
  let now = Math.floor(Date.now() / 1000)
  f.db.function('unixepoch', () => now)
  f.db.exec('UPDATE portfolio_storage_writer_policy SET minimum_protocol_version=1')
  await signedProtocolFixture(f, 9900, scope)
  Object.assign(f.env, { PORTFOLIO_ENVIRONMENT: 'staging', PORTFOLIO_DATABASE_ID: databaseId,
    PORTFOLIO_BUCKET_NAME: bucket, PORTFOLIO_STORAGE_SCOPE: scope, PORTFOLIO_STAGING_MUTATIONS_FROZEN: 'true',
    PORTFOLIO_UPLOAD_MAX_FILES: '10', PORTFOLIO_CLEANUP_R2_OPERATION_LIMIT: '1',
    PORTFOLIO_CLEANUP_ENABLED: 'false', PORTFOLIO_FINALIZATION_ENABLED: 'false',
    PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI: btoa(String.fromCharCode(...f.trust.publicKeySpki)) })
  f.cookie = await login(f)
  if (solo) {
    const report = await enrollSoloFixture(f)
    const evidence = await f.signReport(report)
    const envelope = { payload: evidence.payload, signature_base64: btoa(String.fromCharCode(...evidence.signature)) }
    const importEvidence = () => worker.fetch(request('/api/admin/portfolio-protocol-evidence', 'POST', envelope, f.cookie), f.env)
    assert.equal((await importEvidence()).status,503,'Mutation freeze also guards signed imports.')
    f.env.PORTFOLIO_STAGING_MUTATIONS_FROZEN = 'false'
    assert.equal((await importEvidence()).status,503,'Import has its own gate.')
    f.env.PORTFOLIO_EVIDENCE_IMPORT_ENABLED = 'true'
    assert.equal((await importEvidence()).status,200)
    f.env.PORTFOLIO_EVIDENCE_IMPORT_ENABLED = 'false'
    f.env.PORTFOLIO_STAGING_MUTATIONS_FROZEN = 'true'
  }
  const create = slug => worker.fetch(request('/api/admin/portfolios', 'POST', { name: 'Disposable sandbox fixture', slug }, f.cookie), f.env)
  assert.equal((await create('delete-test-sandbox-a')).status, 503)
  f.env.PORTFOLIO_STAGING_MUTATIONS_FROZEN = 'false'
  assert.equal((await create('delete-test-sandbox-a')).status, 201)
  assert.equal((await create('ordinary-sandbox-b')).status, 201)
  const foreign = new Map(f.state.objects)
  const folder = new FormData()
  for (const [path, content] of [['index.html', 'FOLDER'], ['assets/style.css', 'CSS']]) {
    folder.append('files', new File([content], path.split('/').at(-1))); folder.append('paths', path)
  }
  if (solo) for (let index = 0; index < 8; index++) {
    folder.append('files',new File(['fixture'], `extra-${index}.css`)); folder.append('paths',`extra-${index}.css`)
  }
  const calls = () => f.state.queries + f.state.puts + f.state.reads + f.state.lists + f.state.heads
  let beforeCalls = calls()
  assert.equal((await worker.fetch(request('/api/admin/portfolios/3/upload-folder', 'POST', folder, f.cookie), f.env)).status, 200)
  assert.ok(calls()-beforeCalls<=50,`Folder subrequests: ${calls()-beforeCalls}`)
  const html = new FormData(); html.append('file', new File(['HTML replacement'], 'index.html'))
  beforeCalls = calls()
  assert.equal((await worker.fetch(request('/api/admin/portfolios/3/upload', 'POST', html, f.cookie), f.env)).status, 200)
  assert.ok(calls()-beforeCalls<=50,`HTML subrequests: ${calls()-beforeCalls}`)
  const active = f.db.prepare('SELECT storage_prefix FROM portfolios WHERE id=3').get().storage_prefix
  assert.equal(f.state.objects.get(active + 'assets/style.css'), 'CSS')
  assert.equal((await mark(f, f.cookie, 4)).status, 403, 'Non-disposable staging slugs stay protected.')
  assert.equal((await mark(f, f.cookie, 1)).status, 403, 'Legacy births stay protected.')
  const marking = await mark(f, f.cookie, 3)
  assert.equal(marking.status, 202)
  f.jobId = (await marking.json()).job.id
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'disabled')
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', f.trust.publicKeySpki)), byte => byte.toString(16).padStart(2, '0')).join('')
  f.db.prepare(`UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,environment='staging',storage_scope=?,
    bucket_name=?,database_id=?,signer_sha256=?,cleanup_enabled=1,finalization_enabled=0`).run(scope, bucket, databaseId, fingerprint)
  f.env.PORTFOLIO_CLEANUP_ENABLED = 'true'
  const r2 = cleanupR2(f); r2.lostDeleteOnce = true
  r2.head = async () => ({ customMetadata: { environment: 'staging', storage_scope: scope, bucket_name: bucket, database_id: databaseId } })
  f.env.bitreca_media = r2
  let recovered = false
  for (let step = 0; step < 30; step++) {
    const result = await runPortfolioDeletionJob(f.env, f.jobId)
    if (result.state === 'retry_wait') recovered = true
    if (result.state === 'storage_verified') break
    assert.ok(['queued', 'retry_wait'].includes(result.state), JSON.stringify(result))
    now += 3601
  }
  assert.equal(recovered, true)
  assert.deepEqual(r2.objects, foreign)
  assert.equal((await getPortfolioDeletionStatus(f.env.bitreca_db, f.jobId)).phase, 'storage_verified')
  assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get())
  assert.equal(finalizations(f).length, 0)
  f.env.PORTFOLIO_FINALIZATION_ENABLED = 'true'
  await retryPortfolioDeletion(f.env.bitreca_db, f.jobId)
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'storage_verified', 'Environment flag alone cannot authorize finalization.')
  f.db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,finalization_enabled=1')
  await retryPortfolioDeletion(f.env.bitreca_db, f.jobId)
  assert.equal((await runPortfolioDeletionJob(f.env, f.jobId)).state, 'finalized')
  assert.equal(finalizations(f).length, 1)
  assert.equal(f.db.prepare('SELECT id FROM portfolios WHERE id=3').get(), undefined)
  assert.ok(f.db.prepare('SELECT id FROM portfolios WHERE id=4').get())
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_deletion_prefix_receipts WHERE job_id=?').get(f.jobId).n, 3)
  assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), [])
})
