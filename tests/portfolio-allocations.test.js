import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import worker from '../worker/index.js'

// In-memory binding models only. No migration is executed by this suite.
beforeEach((t) => { t.mock.method(console, 'error', () => {}) })
const uuid = (number) => String(number).padStart(8, '0') + '-0000-4000-8000-000000000000'
const overlaps = (a, b) => a.startsWith(b) || b.startsWith(a)
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function fixture(t) {
  const state = {
    portfolios: new Map([[1, { id: 1, name: 'Fixture', slug: 'fixture', storage_prefix: 'portfolios/legacy/', status: 'draft' }]]),
    allocations: new Map(), sessions: new Map(),
    objects: new Map([['portfolios/legacy/index.html', 'OLD'], ['portfolios/legacy/style.css', 'CSS']]),
    sequence: 1, puts: 0, nextId: 2, fail: null, gate: null,
  }
  t.mock.method(crypto, 'randomUUID', () => uuid(state.sequence++))
  const env = {
    ADMIN_USERNAME: 'fixture-admin', ADMIN_PASSWORD: 'fixture-password',
    SESSION_SECRET: 'fixture-secret', ADMIN_AUTH_VERSION: '1',
  }
  function insertAllocation(prefix, owner, kind, source, uploadState, writerToken) {
    if (state.fail === 'registration') throw new Error('Injected registration failure')
    assert.ok(state.portfolios.has(owner), 'Owner must exist')
    if ([...state.allocations.values()].some(a => overlaps(a.prefix, prefix)) ||
        [...state.portfolios.values()].some(p => p.id !== owner && overlaps(p.storage_prefix, prefix))) {
      throw new Error('Storage allocation conflict.')
    }
    state.allocations.set(prefix, { prefix, portfolio_id: owner, allocation_kind: kind, source_prefix: source, upload_state: uploadState,
      writer_protocol_version: 1, writer_token: writerToken, writer_state: kind === 'initial' ? 'closed' : 'open',
      writer_closed_at: kind === 'initial' ? 1 : null })
    if (state.fail === 'registration-response-lost') throw new Error('Injected registration response loss')
    return { success: true, meta: { changes: 1 } }
  }
  let transaction = Promise.resolve()
  env.bitreca_db = {
    batch(statements) {
      const operation = transaction.then(async () => {
        const portfolios = structuredClone(state.portfolios), allocations = structuredClone(state.allocations), nextId = state.nextId
        try {
          const results = []
          for (const statement of statements) results.push(await statement.run())
          if (state.fail === 'lost-activation-response') throw Object.assign(new Error('Injected response loss'), { committed: true })
          return results
        } catch (error) {
          if (!error.committed) {
            state.portfolios = portfolios
            state.allocations = allocations
            state.nextId = nextId
          }
          throw error
        }
      })
      transaction = operation.catch(() => {})
      return operation
    },
    prepare(sql) {
      const query = sql.replace(/\s+/g, ' ').trim()
      return {
        bind(...args) {
          return {
            async first() {
              if (query.includes('FROM portfolio_storage_allocations AS allocation')) {
                const a = state.allocations.get(args[1])
                return a?.portfolio_id === args[0] && a.writer_token === args[2]
                  ? { ...a, minimum_protocol_version: 0, deletion_requested_at: state.portfolios.get(args[0])?.deletion_requested_at ?? null } : null
              }
              if (query.startsWith('SELECT writer_state FROM portfolio_storage_allocations')) return state.allocations.get(args[0]) ?? null
              if (query.includes('FROM admin_auth_state AS state')) {
                return { auth_version: 1, authenticated: Number(state.sessions.get(args[0]) === args[1]) }
              }
              if (query.includes('WHERE slug = ?')) {
                const row = [...state.portfolios.values()].find(p => p.slug === args[0])
                return row ? { ...row } : null
              }
              assert.match(query, /FROM portfolios WHERE id = \?/)
              const row = state.portfolios.get(args[0])
              return row ? { ...row } : null
            },
            async run() {
              if (query.startsWith('INSERT INTO admin_sessions')) {
                state.sessions.set(args[0], args[1])
                return { success: true, meta: { changes: 1 } }
              }
              if (query.startsWith('INSERT INTO portfolios')) {
                if ([...state.portfolios.values()].some(p => p.slug === args[1] || p.storage_prefix === args[4])) {
                  throw new Error('UNIQUE constraint failed')
                }
                const id = state.nextId++
                state.portfolios.set(id, { id, name: args[0], slug: args[1], storage_prefix: args[4], status: 'draft' })
                return { success: true, meta: { changes: 1, last_row_id: id } }
              }
              if (query.startsWith('INSERT INTO portfolio_storage_allocations')) {
                if (query.includes("'initial', 'completed'")) {
                  const portfolio = [...state.portfolios.values()].find(p => p.storage_prefix === args[1])
                  return insertAllocation(args[1], portfolio.id, 'initial', null, 'completed', args[0])
                }
                return insertAllocation(args[0], args[1], args[2], args[3], 'uploading', args[4])
              }
              if (query.startsWith('UPDATE portfolios SET storage_prefix')) {
                if (state.fail === 'activation') throw new Error('Injected activation failure')
                const [prefix, id, original, registeredPrefix, owner] = args
                assert.match(query, /AND EXISTS .*portfolio_storage_allocations/)
                assert.equal(prefix, registeredPrefix)
                assert.equal(owner, id)
                const portfolio = state.portfolios.get(id), allocation = state.allocations.get(prefix)
                const matches = portfolio?.storage_prefix === original && allocation?.portfolio_id === id && allocation.upload_state === 'uploading'
                if (matches) portfolio.storage_prefix = prefix
                return { success: true, meta: { changes: matches ? 1 : 0 } }
              }
              if (query.startsWith('UPDATE portfolio_storage_allocations SET writer_state')) {
                const a = state.allocations.get(args[2])
                const matches = a?.portfolio_id === args[3] && a.writer_token === args[4] && a.writer_state === 'open'
                if (matches) { a.writer_state = args[0]; a.writer_closed_at = args[0] === 'closed' ? 1 : null }
                return { success: true, meta: { changes: matches ? 1 : 0 } }
              }
              if (query.startsWith('UPDATE portfolio_storage_allocations')) {
                if (state.fail === 'tracking') throw new Error('Injected tracking failure')
                const activation = query.includes('CASE WHEN EXISTS')
                const prefix = args[activation ? 2 : 1], owner = args[activation ? 3 : 2]
                const allocation = state.allocations.get(prefix)
                if (!allocation || allocation.portfolio_id !== owner || allocation.upload_state !== 'uploading') {
                  return { success: true, meta: { changes: 0 } }
                }
                allocation.upload_state = activation
                  ? (state.portfolios.get(args[0])?.storage_prefix === args[1] ? 'completed' : 'conflicted') : args[0]
                return { success: true, meta: { changes: 1 } }
              }
              throw new Error('Unexpected mock statement')
            },
          }
        },
      }
    },
  }
  env.bitreca_media = {
    async list({ prefix, limit = 100 }) {
      if (state.fail === 'destination-list' && prefix.startsWith('portfolio-versions/')) throw new Error('Injected listing failure')
      const objects = [...state.objects].filter(([key]) => key.startsWith(prefix))
      return { objects: objects.slice(0, limit).map(([key, value]) => ({ key, size: value.length, etag: key })), truncated: objects.length > limit }
    },
    async get(key) {
      if (state.fail === 'source-read') return null
      const value = state.objects.get(key)
      return value === undefined ? null : {
        body: new Blob([value]).stream(), size: value.length, etag: key,
        httpMetadata: { contentType: 'text/css' }, customMetadata: { fixture: 'preserved' },
      }
    },
    async put(key, stream) {
      const allocation = [...state.allocations.values()].find(a => key.startsWith(a.prefix))
      assert.ok(allocation, 'Ownership must be durable before the first PUT')
      assert.equal(allocation.portfolio_id, 1)
      assert.equal(allocation.upload_state, 'uploading')
      assert.equal(allocation.writer_state, 'open')
      state.puts++
      if (state.puts === 1 && state.gate) {
        state.gate.started.resolve()
        await state.gate.resume.promise
      }
      if (state.fail === 'write' || (state.fail === 'write-after-first' && state.puts === 2)) throw new Error('Injected PUT failure')
      state.objects.set(key, await new Response(stream).text())
    },
  }
  return { env, state }
}

function request(path, method, body, cookie) {
  return new Request('https://fixture.invalid' + path, {
    method,
    headers: { Origin: 'https://fixture.invalid', ...(cookie ? { Cookie: cookie } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
}
async function login(env) {
  const result = await worker.fetch(request('/api/admin/login', 'POST', { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }), env)
  assert.equal(result.status, 200)
  return result.headers.get('Set-Cookie').split(';')[0]
}
function upload(env, cookie, folder, invalid = false) {
  const form = new FormData()
  form.append(folder ? 'files' : 'file', new File(['NEW'], invalid ? 'invalid.txt' : 'index.html'))
  if (folder) {
    form.append('paths', invalid ? '../index.html' : 'index.html')
    form.append('files', new File(['NEW CSS'], 'style.css'))
    form.append('paths', 'style.css')
  }
  form.append('portfolio_id', '2')
  form.append('storage_prefix', 'portfolios/foreign/')
  return worker.fetch(request('/api/admin/portfolios/1/' + (folder ? 'upload-folder' : 'upload'), 'POST', form, cookie), env)
}
const create = (env, cookie, slug = 'new-portfolio') => worker.fetch(request('/api/admin/portfolios', 'POST', { name: 'New fixture', slug, storage_prefix: 'portfolios/legacy/' }, cookie), env)

test('initial ownership is registered atomically and client prefixes are ignored', async (t) => {
  const { env, state } = fixture(t), cookie = await login(env)
  assert.equal((await create(env, cookie)).status, 201)
  const portfolio = state.portfolios.get(2), allocation = state.allocations.get(portfolio.storage_prefix)
  assert.equal(allocation.portfolio_id, 2)
  assert.equal(allocation.allocation_kind, 'initial')
  assert.equal(allocation.upload_state, 'completed')
  assert.equal(allocation.source_prefix, null)
  assert.equal(state.puts, 0)
  assert.ok(!state.allocations.has('portfolios/legacy/'))
})

test('initial registration failure rolls back portfolio creation', async (t) => {
  const { env, state } = fixture(t), cookie = await login(env)
  state.fail = 'registration'
  assert.equal((await create(env, cookie)).status, 500)
  assert.equal(state.portfolios.size, 1)
  assert.equal(state.allocations.size, 0)
})

for (const folder of [false, true]) {
  test(`${folder ? 'folder' : 'HTML'} allocation precedes PUT and completes atomically with activation`, async (t) => {
    const { env, state } = fixture(t), cookie = await login(env)
    assert.equal((await upload(env, cookie, folder)).status, 200)
    const allocation = state.allocations.get(state.portfolios.get(1).storage_prefix)
    assert.equal(allocation.portfolio_id, 1)
    assert.equal(allocation.upload_state, 'completed')
    assert.equal(allocation.allocation_kind, folder ? 'folder' : 'html')
    assert.equal(allocation.source_prefix, 'portfolios/legacy/')
    assert.equal(state.objects.get('portfolios/legacy/index.html'), 'OLD')
    assert.ok(!state.allocations.has('portfolios/legacy/'), 'Recording source provenance must not claim legacy ownership')
    if (!folder) assert.equal(state.objects.get(allocation.prefix + 'style.css'), 'CSS')
  })

  test(`${folder ? 'folder' : 'HTML'} invalid upload creates no allocation`, async (t) => {
    const { env, state } = fixture(t), cookie = await login(env)
    assert.equal((await upload(env, cookie, folder, true)).status, 400)
    assert.equal(state.allocations.size, 0)
    assert.equal(state.puts, 0)
  })

  for (const failure of ['registration', 'destination-list']) {
    test(`${folder ? 'folder' : 'HTML'} ${failure} prevents every PUT`, async (t) => {
      const { env, state } = fixture(t), cookie = await login(env)
      state.fail = failure
      assert.equal((await upload(env, cookie, folder)).status, 503)
      assert.equal(state.puts, 0)
      assert.equal(state.allocations.size, 0)
      assert.equal(state.portfolios.get(1).storage_prefix, 'portfolios/legacy/')
    })
  }

  test(`${folder ? 'folder' : 'HTML'} PUT failure retains an uncertain allocation`, async (t) => {
    const { env, state } = fixture(t), cookie = await login(env)
    state.fail = 'write'
    assert.equal((await upload(env, cookie, folder)).status, 500)
    assert.equal([...state.allocations.values()][0].upload_state, 'uncertain')
    assert.equal(state.portfolios.get(1).storage_prefix, 'portfolios/legacy/')
  })

  test(`${folder ? 'folder' : 'HTML'} partial upload retains written objects and ownership`, async (t) => {
    const { env, state } = fixture(t), cookie = await login(env)
    state.fail = 'write-after-first'
    assert.equal((await upload(env, cookie, folder)).status, 500)
    const allocation = [...state.allocations.values()][0]
    assert.equal(allocation.upload_state, 'uncertain')
    assert.equal([...state.objects.keys()].filter(key => key.startsWith(allocation.prefix)).length, 1)
    assert.equal(state.portfolios.get(1).storage_prefix, 'portfolios/legacy/')
  })

  test(`${folder ? 'folder' : 'HTML'} overlapping uploads retain winner and conflicted allocations`, async (t) => {
    const { env, state } = fixture(t), cookie = await login(env)
    state.gate = { started: deferred(), resume: deferred() }
    const pending = upload(env, cookie, folder)
    await state.gate.started.promise
    let active
    try {
      assert.equal((await upload(env, cookie, folder)).status, 200)
      active = state.portfolios.get(1).storage_prefix
    } finally { state.gate.resume.resolve() }
    assert.equal((await pending).status, 409)
    assert.equal(state.portfolios.get(1).storage_prefix, active)
    assert.deepEqual([...state.allocations.values()].map(a => a.upload_state).sort(), ['completed', 'conflicted'])
    assert.equal(state.objects.get('portfolios/legacy/index.html'), 'OLD')
  })
}

test('source-read failure retains a failed allocation without activating', async (t) => {
  const { env, state } = fixture(t), cookie = await login(env)
  state.fail = 'source-read'
  assert.equal((await upload(env, cookie, false)).status, 500)
  assert.equal([...state.allocations.values()][0].upload_state, 'failed')
  assert.equal(state.puts, 0)
  assert.equal(state.portfolios.get(1).storage_prefix, 'portfolios/legacy/')
})

test('lost registration response retains unresolved ownership but performs no PUT', async (t) => {
  const { env, state } = fixture(t), cookie = await login(env)
  state.fail = 'registration-response-lost'
  assert.equal((await upload(env, cookie, true)).status, 503)
  assert.equal([...state.allocations.values()][0].upload_state, 'uploading')
  assert.equal(state.puts, 0)
})

for (const failure of ['activation', 'tracking']) {
  test(`${failure} failure preserves the old pointer and durable unresolved ownership`, async (t) => {
    const { env, state } = fixture(t), cookie = await login(env)
    state.fail = failure
    assert.equal((await upload(env, cookie, true)).status, 500)
    assert.equal(state.portfolios.get(1).storage_prefix, 'portfolios/legacy/')
    assert.equal([...state.allocations.values()][0].upload_state, failure === 'tracking' ? 'uploading' : 'uncertain')
  })
}

test('lost activation response never downgrades a committed completed allocation', async (t) => {
  const { env, state } = fixture(t), cookie = await login(env)
  state.fail = 'lost-activation-response'
  assert.equal((await upload(env, cookie, true)).status, 500)
  const allocation = [...state.allocations.values()][0]
  assert.equal(allocation.upload_state, 'completed')
  assert.equal(state.portfolios.get(1).storage_prefix, allocation.prefix)
})

for (const kind of ['same-owner', 'other-owner', 'parent-prefix', 'child-prefix', 'live-foreign-prefix']) {
  test(`allocation rejects ${kind} collision before writing`, async (t) => {
    const { env, state } = fixture(t), cookie = await login(env)
    const prefix = 'portfolio-versions/1/' + uuid(1) + '/'
    if (kind === 'live-foreign-prefix') {
      state.portfolios.set(2, { id: 2, storage_prefix: prefix, slug: 'other' })
    } else {
      const stored = kind === 'parent-prefix' ? 'portfolio-versions/1/' : kind === 'child-prefix' ? prefix + 'nested/' : prefix
      state.allocations.set(stored, { prefix: stored, portfolio_id: kind === 'same-owner' ? 1 : 2, upload_state: 'completed' })
    }
    const before = structuredClone(state.allocations)
    assert.equal((await upload(env, cookie, true)).status, 409)
    assert.equal(state.puts, 0)
    assert.deepEqual(state.allocations, before)
  })
}

test('occupied unregistered destination is not adopted', async (t) => {
  const { env, state } = fixture(t), cookie = await login(env)
  const key = 'portfolio-versions/1/' + uuid(1) + '/old.css'
  state.objects.set(key, 'UNVERIFIED')
  assert.equal((await upload(env, cookie, true)).status, 409)
  assert.equal(state.allocations.size, 0)
  assert.equal(state.objects.get(key), 'UNVERIFIED')
  assert.equal(state.puts, 0)
})

test('concurrent duplicate-slug creation keeps only one initial allocation', async (t) => {
  const { env, state } = fixture(t), cookie = await login(env)
  const results = await Promise.all([create(env, cookie), create(env, cookie)])
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409])
  assert.equal(state.portfolios.size, 2)
  assert.equal(state.allocations.size, 1)
})

test('migration is additive with immutable identity, literal overlap guards and no ownership backfill', () => {
  const sql = readFileSync(new URL('../migrations/0006_create_portfolio_storage_allocations.sql', import.meta.url), 'utf8')
  assert.match(sql, /CREATE TABLE portfolio_storage_allocations/)
  assert.match(sql, /BEFORE INSERT ON portfolio_storage_allocations/)
  assert.match(sql, /BEFORE UPDATE ON portfolio_storage_allocations/)
  assert.match(sql, /BEFORE DELETE ON portfolio_storage_allocations/)
  assert.match(sql, /NEW\.portfolio_id IS NOT OLD\.portfolio_id/)
  assert.match(sql, /substr\(NEW\.prefix, 1, length\(allocation\.prefix\)\)/)
  assert.match(sql, /portfolio\.id <> NEW\.portfolio_id/)
  assert.doesNotMatch(sql, /INSERT INTO portfolio_storage_allocations|ALTER TABLE portfolios|DROP TABLE|DELETE FROM/)
})
