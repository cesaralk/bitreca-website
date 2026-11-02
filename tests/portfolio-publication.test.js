import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'

// All D1/R2 operations below use plain in-memory objects, not Cloudflare or SQLite.
beforeEach((t) => { t.mock.method(console, 'error', () => {}) })

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function fixture(initialStatus = 'draft') {
  const state = {
    portfolio: { id: 1, storage_prefix: 'portfolio-versions/1/original/', status: initialStatus, publication_revision: 0 },
    sessions: new Map(),
    portfolioReads: 0,
    htmlReads: 0,
    updates: 0,
    beforeUpdate: null,
    htmlGate: null,
    failure: null,
  }
  const env = {
    ADMIN_USERNAME: 'test-admin', ADMIN_PASSWORD: 'test-password',
    SESSION_SECRET: 'test-secret', ADMIN_AUTH_VERSION: '1',
    bitreca_db: {
      prepare(sql) {
        const query = sql.replace(/\s+/g, ' ').trim()
        return {
          bind(...args) {
            return {
              async first() {
                if (query.includes('FROM admin_auth_state AS state')) {
                  return {
                    auth_version: 1,
                    authenticated: Number(state.sessions.get(args[0]) === args[1]),
                  }
                }
                assert.equal(query, 'SELECT id, storage_prefix, publication_revision, deletion_requested_at FROM portfolios WHERE id = ?')
                state.portfolioReads++
                if (state.failure === 'lookup') throw new Error('Injected D1 lookup failure')
                return state.portfolio && args[0] === state.portfolio.id ? { ...state.portfolio } : null
              },
              async run() {
                if (query.startsWith('INSERT INTO admin_sessions')) {
                  state.sessions.set(args[0], args[1])
                  return { success: true, meta: { changes: 1 } }
                }
                assert.match(query, /^UPDATE portfolios SET status = \?, publication_revision = publication_revision \+ 1, updated_at = CURRENT_TIMESTAMP WHERE id = \? AND storage_prefix = \? AND publication_revision = \? AND deletion_requested_at IS NULL$/)
                assert.equal(args.length, 4)
                state.updates++
                if (state.beforeUpdate) await state.beforeUpdate(args)
                if (state.failure === 'update') throw new Error('Injected D1 update failure')
                if (state.failure === 'update-result') return { success: false, meta: { changes: 0 } }
                const [status, id, prefix, revision] = args
                const current = state.portfolio
                const matches = current && current.id === id && current.storage_prefix === prefix &&
                  current.publication_revision === revision
                if (matches) {
                  current.status = status
                  current.publication_revision++
                }
                return { success: true, meta: { changes: matches ? 1 : 0 } }
              },
            }
          },
        }
      },
    },
    bitreca_media: {
      async get(key) {
        state.htmlReads++
        assert.ok(key.endsWith('/index.html'))
        if (state.failure === 'missing-html') return null
        if (state.failure === 'r2-get') throw new Error('Injected R2 read failure')
        const gate = state.htmlReads === 1 ? state.htmlGate : null
        return {
          body: new ReadableStream({
            async start(controller) {
              if (gate) {
                gate.started.resolve()
                await gate.resume.promise
              }
              if (state.failure === 'r2-stream') {
                controller.error(new Error('Injected R2 stream failure'))
              } else {
                controller.enqueue(new TextEncoder().encode('<html></html>'))
                controller.close()
              }
            },
          }),
        }
      },
    },
  }
  return { env, state }
}

function request(path, { body, cookie, method = 'PATCH', origin = 'https://test.invalid' } = {}) {
  return new Request(`https://test.invalid${path}`, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function login(env) {
  const response = await worker.fetch(request('/api/admin/login', {
    method: 'POST', body: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
  }), env)
  assert.equal(response.status, 200)
  return response.headers.get('Set-Cookie').split(';')[0]
}

const setStatus = (env, cookie, status) => worker.fetch(request('/api/admin/portfolios/1/status', {
  body: { status }, cookie,
}), env)

test('normal and repeated status operations increment revision, including draft to draft', async () => {
  const { env, state } = fixture()
  const cookie = await login(env)
  for (const [index, status] of ['draft', 'published', 'published', 'draft', 'draft'].entries()) {
    const response = await setStatus(env, cookie, status)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).success, true)
    assert.equal(state.portfolio.status, status)
    assert.equal(state.portfolio.publication_revision, index + 1)
  }
  assert.equal(state.htmlReads, 2, 'Only Publish reads R2')
})

for (const initialStatus of ['draft', 'published']) {
  test(`delayed Publish cannot reverse completed Unpublish starting from ${initialStatus}`, async () => {
    const { env, state } = fixture(initialStatus)
    const cookie = await login(env)
    const gate = { started: deferred(), resume: deferred() }
    state.htmlGate = gate
    const pending = setStatus(env, cookie, 'published')
    await gate.started.promise
    try {
      assert.equal((await setStatus(env, cookie, 'draft')).status, 200)
      assert.equal(state.portfolio.publication_revision, 1)
    } finally { gate.resume.resolve() }
    const stale = await pending
    assert.equal(stale.status, 409)
    assert.equal((await stale.json()).success, false)
    assert.equal(state.portfolio.status, 'draft')
    assert.equal(state.portfolio.publication_revision, 1)
  })
}

test('publication-state ABA cycle does not make an old Publish valid again', async () => {
  const { env, state } = fixture('published')
  const cookie = await login(env)
  const gate = { started: deferred(), resume: deferred() }
  state.htmlGate = gate
  const pending = setStatus(env, cookie, 'published')
  await gate.started.promise
  try {
    assert.equal((await setStatus(env, cookie, 'draft')).status, 200)
    assert.equal((await setStatus(env, cookie, 'published')).status, 200)
    assert.equal(state.portfolio.publication_revision, 2)
  } finally { gate.resume.resolve() }
  assert.equal((await pending).status, 409)
  assert.equal(state.portfolio.status, 'published')
  assert.equal(state.portfolio.publication_revision, 2)
})

for (const nextStatus of ['published', 'draft']) {
  test(`stale Unpublish conflicts after a newer ${nextStatus} operation`, async () => {
    const { env, state } = fixture()
    const cookie = await login(env)
    const started = deferred(), resume = deferred()
    state.beforeUpdate = async () => {
      if (state.updates === 1) { started.resolve(); await resume.promise }
    }
    const pending = setStatus(env, cookie, 'draft')
    await started.promise
    try { assert.equal((await setStatus(env, cookie, nextStatus)).status, 200) }
    finally { resume.resolve() }
    assert.equal((await pending).status, 409)
    assert.equal(state.portfolio.status, nextStatus)
    assert.equal(state.portfolio.publication_revision, 1)
  })
}

for (const status of ['published', 'draft']) {
  test(`${status} also conflicts if the selected storage prefix changes`, async () => {
    const { env, state } = fixture()
    const cookie = await login(env)
    state.beforeUpdate = async () => { state.portfolio.storage_prefix = 'portfolio-versions/1/replacement/' }
    assert.equal((await setStatus(env, cookie, status)).status, 409)
    assert.equal(state.portfolio.status, 'draft')
    assert.equal(state.portfolio.publication_revision, 0)
  })
}

test('two overlapping Publishes activate only one revision', async () => {
  const { env, state } = fixture()
  const cookie = await login(env)
  const gate = { started: deferred(), resume: deferred() }
  state.htmlGate = gate
  const pending = setStatus(env, cookie, 'published')
  await gate.started.promise
  try { assert.equal((await setStatus(env, cookie, 'published')).status, 200) }
  finally { gate.resume.resolve() }
  assert.equal((await pending).status, 409)
  assert.equal(state.portfolio.publication_revision, 1)
})

for (const [failure, expected] of [
  ['missing-html', 422], ['r2-get', 503], ['r2-stream', 503],
  ['lookup', 500], ['update', 500], ['update-result', 500],
]) {
  test(`Publish preserves state and revision on ${failure}`, async () => {
    const { env, state } = fixture()
    const cookie = await login(env)
    state.failure = failure
    assert.equal((await setStatus(env, cookie, 'published')).status, expected)
    assert.equal(state.portfolio.status, 'draft')
    assert.equal(state.portfolio.publication_revision, 0)
  })
}

test('Unpublish succeeds even when R2 is unavailable', async () => {
  const { env, state } = fixture('published')
  const cookie = await login(env)
  state.failure = 'r2-get'
  assert.equal((await setStatus(env, cookie, 'draft')).status, 200)
  assert.equal(state.htmlReads, 0)
  assert.equal(state.portfolio.status, 'draft')
  assert.equal(state.portfolio.publication_revision, 1)
})

for (const failure of ['update', 'update-result']) {
  test(`Unpublish does not report success or increment revision on ${failure}`, async () => {
    const { env, state } = fixture('published')
    const cookie = await login(env)
    state.failure = failure
    assert.equal((await setStatus(env, cookie, 'draft')).status, 500)
    assert.equal(state.portfolio.status, 'published')
    assert.equal(state.portfolio.publication_revision, 0)
  })
}

test('invalid status and missing portfolios retain 400 and 404 behavior', async () => {
  const { env, state } = fixture()
  const cookie = await login(env)
  assert.equal((await setStatus(env, cookie, 'invalid')).status, 400)
  assert.equal(state.portfolioReads, 0)
  state.portfolio = null
  assert.equal((await setStatus(env, cookie, 'published')).status, 404)
  assert.equal(state.updates, 0)
})

test('unauthorized and cross-origin status changes never reach portfolio validation', async () => {
  const { env, state } = fixture()
  assert.equal((await setStatus(env, null, 'published')).status, 401)
  assert.equal((await worker.fetch(request('/api/admin/portfolios/1/status', {
    body: { status: 'published' }, origin: 'https://untrusted.invalid',
  }), env)).status, 403)
  assert.equal(state.portfolioReads, 0)
  assert.equal(state.htmlReads, 0)
  assert.equal(state.updates, 0)
})
