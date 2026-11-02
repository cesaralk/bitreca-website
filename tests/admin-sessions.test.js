import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import worker from '../worker/index.js'

// Plain in-memory models only: no Wrangler, SQLite, D1, R2, network, or secrets files.
const baseConfiguration = {
  ADMIN_USERNAME: 'test-administrator',
  ADMIN_PASSWORD: 'test-password-not-a-real-credential',
  SESSION_SECRET: 'test-secret-not-a-real-secret',
  ADMIN_AUTH_VERSION: '1',
}
const cookieName = '__Host-bitreca_admin_session'
const hash = (value) => createHash('sha256').update(value).digest('hex')

beforeEach((t) => {
  // Expected infrastructure failures must not flood test output or expose values.
  t.mock.method(console, 'error', () => {})
})

function fixture() {
  const state = {
    version: 1,
    now: 1700000000,
    sessions: new Map(),
    allocations: new Map(),
    failure: null,
    beforeInsert: null,
    reads: 0,
    writes: 0,
    portfolio: { id: 1, storage_prefix: 'portfolio-versions/1/previous/', status: 'draft', publication_revision: 0 },
  }
  const db = {
    async batch(statements) {
      const portfolio = { ...state.portfolio }
      const allocations = structuredClone(state.allocations)
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        return results
      }
      catch (error) {
        state.portfolio = portfolio
        state.allocations = allocations
        throw error
      }
    },
    prepare(sql) {
      const query = sql.replace(/\s+/g, ' ').trim()
      return {
        async all() {
          assert.match(query, /FROM portfolios/)
          return { success: true, results: [{ ...state.portfolio }] }
        },
        bind(...args) {
          return {
            async first() {
              state.reads++
              if (query.includes('FROM portfolio_storage_allocations AS allocation')) {
                const a = state.allocations.get(args[1])
                return a?.portfolioId === args[0] && a.writer_token === args[2]
                  ? { ...a, minimum_protocol_version: 0, deletion_requested_at: state.portfolio.deletion_requested_at ?? null } : null
              }
              if (query.startsWith('SELECT writer_state FROM portfolio_storage_allocations')) return state.allocations.get(args[0]) ?? null
              if (query.includes('FROM admin_auth_state AS state')) {
                if (state.failure === 'read') throw new Error('Injected database failure')
                assert.match(query, /session\.auth_version = state\.auth_version/)
                assert.match(query, /session\.expires_at > unixepoch\(\)/)
                const [tokenHash, fingerprint, adminId] = args
                if (state.version === null) return null
                const session = state.sessions.get(tokenHash)
                return {
                  auth_version: state.version,
                  authenticated: Number(Boolean(session && session.admin_id === adminId &&
                    session.auth_version === state.version &&
                    session.config_fingerprint === fingerprint && session.expires_at > state.now)),
                }
              }
              if (query.includes('FROM portfolios WHERE id = ?')) return { ...state.portfolio }
              throw new Error('Unexpected mock lookup')
            },
            async all() {
              assert.match(query, /FROM portfolios/)
              return { success: true, results: [{ ...state.portfolio }] }
            },
            async run() {
              if (query.startsWith('INSERT INTO portfolio_storage_allocations')) {
                const [prefix, portfolioId, kind, sourcePrefix, writerToken] = args
                assert.ok(!state.allocations.has(prefix))
                state.allocations.set(prefix, { prefix, portfolioId, kind, sourcePrefix, upload_state: 'uploading',
                  writer_protocol_version: 1, writer_token: writerToken, writer_state: 'open', writer_closed_at: null })
                return { success: true, meta: { changes: 1 } }
              }
              if (query.startsWith('UPDATE portfolio_storage_allocations SET writer_state')) {
                const a = state.allocations.get(args[2])
                const matches = a?.portfolioId === args[3] && a.writer_token === args[4] && a.writer_state === 'open'
                if (matches) { a.writer_state = args[0]; a.writer_closed_at = args[0] === 'closed' ? 1 : null }
                return { success: true, meta: { changes: matches ? 1 : 0 } }
              }
              if (query.startsWith('UPDATE portfolio_storage_allocations')) {
                const conditional = query.includes('CASE WHEN EXISTS')
                const prefix = args[conditional ? 2 : 1]
                const allocation = state.allocations.get(prefix)
                if (!allocation || allocation.upload_state !== 'uploading') return { success: true, meta: { changes: 0 } }
                allocation.upload_state = conditional
                  ? (state.portfolio.storage_prefix === args[1] ? 'completed' : 'conflicted') : args[0]
                return { success: true, meta: { changes: 1 } }
              }
              if (query.startsWith('INSERT INTO admin_sessions')) {
                if (state.beforeInsert) await state.beforeInsert()
                if (state.failure === 'insert') throw new Error('Injected database failure')
                if (state.failure === 'insert-result') return { success: false, meta: { changes: 0 } }
                assert.match(query, /SELECT \?, admin_id, auth_version, \?, unixepoch\(\), unixepoch\(\) \+ \?/)
                assert.match(query, /WHERE admin_id = \? AND auth_version = \?/)
                const [tokenHash, fingerprint, lifetime, adminId, version] = args
                if (version !== state.version) return { success: true, meta: { changes: 0 } }
                assert.ok(!state.sessions.has(tokenHash), 'Each login must create an independent token')
                state.sessions.set(tokenHash, {
                  admin_id: adminId, auth_version: version, config_fingerprint: fingerprint,
                  created_at: state.now, expires_at: state.now + lifetime,
                })
                if (state.failure === 'insert-response-lost') throw new Error('Injected response loss')
                return { success: true, meta: { changes: 1 } }
              }
              if (query.startsWith('DELETE FROM admin_sessions')) {
                if (state.failure === 'delete') throw new Error('Injected database failure')
                if (state.failure === 'delete-result') return { success: false }
                const [tokenHash, adminId] = args
                const matches = state.sessions.get(tokenHash)?.admin_id === adminId
                if (matches) state.sessions.delete(tokenHash)
                if (state.failure === 'delete-response-lost') throw new Error('Injected response loss')
                return { success: true, meta: { changes: matches ? 1 : 0 } }
              }
              if (query.startsWith('UPDATE portfolios SET storage_prefix')) {
                const [prefix, id, original] = args
                assert.match(query, /WHERE id = \? AND storage_prefix = \?/)
                const matches = id === state.portfolio.id && original === state.portfolio.storage_prefix &&
                  state.allocations.get(prefix)?.upload_state === 'uploading'
                if (matches) state.portfolio.storage_prefix = prefix
                state.writes++
                return { success: true, meta: { changes: matches ? 1 : 0 } }
              }
              if (query.startsWith('UPDATE portfolios SET status')) {
                const [status, id, prefix, revision] = args
                assert.match(query, /publication_revision = publication_revision \+ 1/)
                assert.match(query, /WHERE id = \? AND storage_prefix = \? AND publication_revision = \?/)
                const matches = id === state.portfolio.id &&
                  prefix === state.portfolio.storage_prefix && revision === state.portfolio.publication_revision
                if (matches) {
                  state.portfolio.status = status
                  state.portfolio.publication_revision++
                }
                state.writes++
                return { success: true, meta: { changes: matches ? 1 : 0 } }
              }
              throw new Error('Unexpected mock mutation')
            },
          }
        },
      }
    },
  }
  return { state, env: { ...baseConfiguration, bitreca_db: db } }
}

function request(path, { method = 'GET', body, cookie, origin = 'https://test.invalid' } = {}) {
  return new Request(`https://test.invalid${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  })
}

async function login(env, credentials = { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }) {
  const response = await worker.fetch(request('/api/admin/login', { method: 'POST', body: credentials }), env)
  return { response, cookie: response.headers.get('Set-Cookie')?.split(';')[0] }
}

const check = (env, cookie) => worker.fetch(request('/api/admin/session', { cookie }), env)
const logout = (env, cookie) => worker.fetch(request('/api/admin/logout', { method: 'POST', cookie }), env)

test('unique hashed sessions, secure cookies, no-store responses, and absolute database expiry', async () => {
  const { state, env } = fixture()
  const a = await login(env)
  const b = await login(env)
  assert.equal(a.response.status, 200)
  assert.equal(b.response.status, 200)
  assert.ok(a.cookie !== b.cookie, 'Repeated logins must use distinct sessions')
  assert.equal(state.sessions.size, 2)
  const token = a.cookie.slice(cookieName.length + 1)
  assert.ok(/^v2\.[0-9a-f]{64}$/.test(token), 'Only versioned random tokens are issued')
  const row = state.sessions.get(hash(token))
  assert.ok(Boolean(row), 'Only the SHA-256 hash is used for lookup')
  assert.ok(!JSON.stringify([...state.sessions]).includes(token), 'Raw tokens must not be persisted')
  assert.equal(row.expires_at - row.created_at, 28800)
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) {
    assert.ok(a.response.headers.get('Set-Cookie').includes(flag))
  }
  assert.equal(a.response.headers.get('Cache-Control'), 'no-store')
  state.now += 28799
  assert.equal((await check(env, a.cookie)).status, 200)
  state.now++
  assert.equal((await check(env, a.cookie)).status, 401)
  assert.equal(row.expires_at - row.created_at, 28800, 'Validation must not extend expiry')
})

test('logout revokes only its session; replay fails and repeated logout succeeds', async () => {
  const { env, state } = fixture()
  const a = await login(env)
  const b = await login(env)
  const response = await logout(env, a.cookie)
  assert.equal(response.status, 200)
  assert.ok(response.headers.get('Set-Cookie').includes('Max-Age=0'))
  assert.equal(state.sessions.size, 1)
  assert.equal((await check(env, a.cookie)).status, 401)
  assert.equal((await check(env, b.cookie)).status, 200)
  assert.equal((await logout(env, a.cookie)).status, 200)
})

test('missing, legacy, malformed, and oversized cookies are rejected without D1 reads', async () => {
  const { env, state } = fixture()
  for (const value of [null, 'a'.repeat(64), 'v2.bad', 'v2.' + 'a'.repeat(65), 'x'.repeat(10000)]) {
    const response = await check(env, value && `${cookieName}=${value}`)
    assert.equal(response.status, 401)
    assert.ok(response.headers.get('Set-Cookie').includes('Max-Age=0'))
  }
  assert.equal(state.reads, 0)
})

test('unknown well-formed token is rejected', async () => {
  const { env } = fixture()
  assert.equal((await check(env, `${cookieName}=v2.${'0'.repeat(64)}`)).status, 401)
})

for (const key of ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET']) {
  test(`configuration fingerprint rejects changed ${key}`, async () => {
    const { env } = fixture()
    const session = await login(env)
    assert.equal((await check({ ...env, [key]: 'replacement-test-value' }, session.cookie)).status, 401)
  })
}

test('authoritative rotation fences old Workers; only matching new configuration can log in', async () => {
  const { env, state } = fixture()
  const previous = await login(env)
  state.version = 2
  assert.equal((await check(env, previous.cookie)).status, 503)
  assert.equal((await login(env)).response.status, 503)
  const nextEnv = { ...env, ADMIN_AUTH_VERSION: '2', ADMIN_PASSWORD: 'replacement-test-password' }
  assert.equal((await check(nextEnv, previous.cookie)).status, 401)
  const next = await login(nextEnv)
  assert.equal(next.response.status, 200)
  assert.equal((await check(nextEnv, next.cookie)).status, 200)
})

test('rotation during a pending login prevents stale insertion', async () => {
  const { env, state } = fixture()
  state.beforeInsert = async () => { state.version = 2 }
  const result = await login(env)
  assert.equal(result.response.status, 503)
  assert.ok(!result.cookie, 'Failed login must not issue a cookie')
  assert.equal(state.sessions.size, 0)
})

test('missing authoritative state fails closed', async () => {
  const { env, state } = fixture()
  const session = await login(env)
  state.version = null
  assert.equal((await check(env, session.cookie)).status, 503)
  assert.equal((await login(env)).response.status, 503)
})

test('invalid configuration blocks login and existing sessions', async () => {
  const { env } = fixture()
  const session = await login(env)
  for (const key of Object.keys(baseConfiguration)) {
    for (const value of [undefined, null, '', '   ', 1, false, [], {}]) {
      const invalid = { ...env, [key]: value }
      assert.equal((await login(invalid, {})).response.status, 503)
      assert.equal((await check(invalid, session.cookie)).status, 503)
    }
  }
  for (const value of ['0', '-1', '1.5', '01', '9007199254740992']) {
    assert.equal((await login({ ...env, ADMIN_AUTH_VERSION: value })).response.status, 503)
  }
})

test('invalid and incorrect submitted credentials remain rejected', async () => {
  const { env, state } = fixture()
  const bodies = [null, {}, [], '', true, { username: 'wrong', password: 'wrong' }]
  for (const key of ['username', 'password']) {
    for (const value of [undefined, null, '', ' ', 123, {}, []]) {
      bodies.push({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD, [key]: value })
    }
  }
  for (const body of bodies) assert.equal((await login(env, body)).response.status, 401)
  assert.equal(state.sessions.size, 0)
})

for (const failure of ['insert', 'insert-result', 'insert-response-lost']) {
  test(`login fails closed on ${failure}`, async (t) => {
    t.mock.method(console, 'error', () => {})
    const { env, state } = fixture()
    state.failure = failure
    const result = await login(env)
    assert.equal(result.response.status, 503)
    assert.ok(!result.cookie, 'Unconfirmed insertion must not issue a cookie')
  })
}

test('D1 lookup failure blocks session checks and protected mutations before R2 or business D1 work', async (t) => {
  t.mock.method(console, 'error', () => {})
  const { env, state } = fixture()
  const session = await login(env)
  state.failure = 'read'
  assert.equal((await check(env, session.cookie)).status, 503)
  const response = await worker.fetch(request('/api/admin/portfolios/1/status', {
    method: 'PATCH', body: { status: 'published' }, cookie: session.cookie,
  }), env)
  assert.equal(response.status, 503)
  assert.equal(state.writes, 0)
})

for (const failure of ['delete', 'delete-result', 'delete-response-lost']) {
  test(`logout reports failure and retains cookie on ${failure}`, async (t) => {
    t.mock.method(console, 'error', () => {})
    const { env, state } = fixture()
    const session = await login(env)
    state.failure = failure
    const response = await logout(env, session.cookie)
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('Set-Cookie'), null)
    state.failure = null
    assert.equal((await logout(env, session.cookie)).status, 200)
    assert.equal((await check(env, session.cookie)).status, 401)
  })
}

test('restarted Worker instance uses persistent session data', async () => {
  const { env } = fixture()
  const session = await login(env)
  const restarted = (await import('../worker/index.js?isolated-restart')).default
  assert.equal((await restarted.fetch(request('/api/admin/session', { cookie: session.cookie }), env)).status, 200)
})

test('same-origin mutation protection remains in front of authentication and database work', async () => {
  const { env, state } = fixture()
  for (const path of ['/api/admin/login', '/api/admin/logout', '/api/admin/portfolios/1/status']) {
    const response = await worker.fetch(request(path, {
      method: 'POST', body: {}, origin: 'https://untrusted.invalid',
    }), env)
    assert.equal(response.status, 403)
  }
  assert.equal(state.reads, 0)
  assert.equal(state.sessions.size, 0)
})

test('expired sessions can still be deleted and legacy logout clears the browser cookie', async () => {
  const { env, state } = fixture()
  const session = await login(env)
  state.now += 28800
  assert.equal((await logout(env, session.cookie)).status, 200)
  assert.equal(state.sessions.size, 0)
  assert.equal((await logout(env, `${cookieName}=${'a'.repeat(64)}`)).status, 200)
})

test('protected portfolio list remains compatible with a valid session', async () => {
  const { env } = fixture()
  const session = await login(env)
  const response = await worker.fetch(request('/api/admin/portfolios', { cookie: session.cookie }), env)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).portfolios.length, 1)
})

for (const folder of [false, true]) {
  test(`authenticated ${folder ? 'folder' : 'HTML'} upload preserves version activation and publishing`, async () => {
    const { env, state } = fixture()
    const oldPrefix = state.portfolio.storage_prefix
    const objects = new Map([[oldPrefix + 'index.html', 'OLD'], [oldPrefix + 'style.css', 'CSS']])
    env.bitreca_media = {
      async list({ prefix }) {
        return { objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, size: value.length, etag: key })), truncated: false }
      },
      async get(key) {
        const value = objects.get(key)
        return value === undefined ? null : {
          size: value.length, etag: key, body: new Blob([value]).stream(),
          httpMetadata: { contentType: 'text/css' }, customMetadata: {},
        }
      },
      async put(key, body) { objects.set(key, await new Response(body).text()) },
    }
    const session = await login(env)
    const form = new FormData()
    form.append(folder ? 'files' : 'file', new File(['NEW'], 'index.html'))
    if (folder) form.append('paths', 'index.html')
    const response = await worker.fetch(request(`/api/admin/portfolios/1/${folder ? 'upload-folder' : 'upload'}`, {
      method: 'POST', body: form, cookie: session.cookie,
    }), env)
    assert.equal(response.status, 200)
    assert.ok(state.portfolio.storage_prefix !== oldPrefix)
    assert.equal(objects.get(oldPrefix + 'index.html'), 'OLD')
    assert.equal(objects.get(state.portfolio.storage_prefix + 'index.html'), 'NEW')
    if (!folder) assert.equal(objects.get(state.portfolio.storage_prefix + 'style.css'), 'CSS')
    const published = await worker.fetch(request('/api/admin/portfolios/1/status', {
      method: 'PATCH', body: { status: 'published' }, cookie: session.cookie,
    }), env)
    assert.equal(published.status, 200)
    assert.equal(state.portfolio.status, 'published')
    const unpublished = await worker.fetch(request('/api/admin/portfolios/1/status', {
      method: 'PATCH', body: { status: 'draft' }, cookie: session.cookie,
    }), env)
    assert.equal(unpublished.status, 200)
    assert.equal(state.portfolio.status, 'draft')
  })
}
