import test from 'node:test'
import assert from 'node:assert/strict'
import { handleContactRequest } from '../worker/contact-enquiry.js'
import { contactWhatsAppUrl, validateContact } from '../shared/contact-enquiry.js'
import worker from '../worker/index.js'

const origin = 'https://bitreca.com'
const reference = '4d316721-6b61-49d7-b713-9840a192af02'
const data = { name: ' QA Visitor ', email: ' qa@example.com ', service: 'Website development', message: 'A synthetic project description with useful detail.', requestId: reference, turnstileToken: 'synthetic-token' }
const environment = () => ({
  CONTACT_EMAIL_ENABLED: 'true', CONTACT_RESEND_DOMAIN_VERIFIED: 'true', CONTACT_ALLOWED_ORIGINS: origin,
  RESEND_API_KEY: 'synthetic-resend-secret', CONTACT_TURNSTILE_SECRET: 'synthetic-turnstile-secret', CONTACT_TURNSTILE_SITE_KEY: 'synthetic-site-key',
  CONTACT_RATE_LIMITER: { limit: async () => ({ success: true }) }, CONTACT_GLOBAL_RATE_LIMITER: { limit: async () => ({ success: true }) },
})
const request = (body = data, headers = {}, method = 'POST') => new Request(`${origin}/api/enquiries`, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers },
  ...(!['GET', 'HEAD'].includes(method) && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
})
function upstream({ challenge = { success: true, hostname: 'bitreca.com', action: 'contact_enquiry' }, provider = { id: reference }, providerStatus = 200, throwAt } = {}) {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, ...options })
    if (url.includes(throwAt || 'never-match')) throw new Error('synthetic upstream failure with private details')
    return Response.json(url.includes('siteverify') ? challenge : provider, { status: url.includes('siteverify') ? 200 : providerStatus })
  }
  return { calls, fetcher }
}

test('disabled configuration fails closed and public config never exposes secrets', async () => {
  for (const key of ['CONTACT_EMAIL_ENABLED', 'CONTACT_RESEND_DOMAIN_VERIFIED', 'CONTACT_ALLOWED_ORIGINS', 'RESEND_API_KEY', 'CONTACT_TURNSTILE_SECRET', 'CONTACT_TURNSTILE_SITE_KEY', 'CONTACT_RATE_LIMITER', 'CONTACT_GLOBAL_RATE_LIMITER']) {
    const env = environment(); delete env[key]
    const mock = upstream()
    assert.equal((await handleContactRequest(request(), env, mock.fetcher)).status, 503, key)
    assert.equal(mock.calls.length, 0)
  }
  const config = await handleContactRequest(new Request(`${origin}/api/contact/config`), environment())
  assert.deepEqual(await config.json(), { enabled: true, siteKey: 'synthetic-site-key' })
  assert.equal(config.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await (await handleContactRequest(new Request(`${origin}/api/contact/config`), {})).json(), { enabled: false, siteKey: null })
})

test('existing Worker routes Contact requests without touching existing storage or auth', async () => {
  const env = { get bitreca_db() { throw new Error('Contact must not access D1') } }
  assert.deepEqual(await (await worker.fetch(new Request(`${origin}/api/contact/config`), env)).json(), { enabled: false, siteKey: null })
  assert.equal((await worker.fetch(request(), env)).status, 503)
})

test('method, origin, content type, trusted IP and JSON shape are enforced', async () => {
  const cases = [
    [request(undefined, {}, 'GET'), 405], [request(data, { Origin: 'https://evil.example' }), 403],
    [request(data, { Origin: '' }), 403], [request(data, { 'Content-Type': 'text/plain' }), 415],
    [request(data, { 'CF-Connecting-IP': '' }), 503], [request('{'), 400], [request('null'), 400],
    [request([]), 400], [request({ ...data, to: 'attacker@example.com' }), 400],
  ]
  for (const [req, status] of cases) {
    const mock = upstream(); assert.equal((await handleContactRequest(req, environment(), mock.fetcher)).status, status); assert.equal(mock.calls.length, 0)
  }
})

test('streamed body limit works without Content-Length', async () => {
  const mock = upstream()
  assert.equal((await handleContactRequest(request('x'.repeat(24577)), environment(), mock.fetcher)).status, 413)
  assert.equal(mock.calls.length, 0)
})

test('field limits, control characters and invalid values never reach upstream', async () => {
  const cases = [
    { name: '' }, { name: 'x'.repeat(101) }, { name: 'A\r\nBcc: attacker@example.com' },
    { email: '' }, { email: 'bad-email' }, { email: 'a@example.com\r\nBcc: a@b.com' }, { email: `${'a'.repeat(65)}@example.com` },
    { service: 'Unknown' }, { message: 'short' }, { message: 'x'.repeat(5001) }, { message: `${'x'.repeat(30)}\u0000` }, { message: 42 },
  ]
  for (const changes of cases) {
    const mock = upstream(); const response = await handleContactRequest(request({ ...data, ...changes }), environment(), mock.fetcher)
    assert.equal(response.status, 422); assert.equal(mock.calls.length, 0)
  }
  assert.deepEqual(validateContact({ ...data, name: 'A', message: 'x'.repeat(5000) }), {})
})

test('both limiters deny/fail closed before challenge or email', async () => {
  for (const key of ['CONTACT_RATE_LIMITER', 'CONTACT_GLOBAL_RATE_LIMITER']) {
    for (const throws of [false, true]) {
      const env = environment(); env[key] = { limit: async () => { if (throws) throw new Error('limiter'); return { success: false } } }
      const mock = upstream(); const response = await handleContactRequest(request(), env, mock.fetcher)
      assert.equal(response.status, throws ? 503 : 429); assert.equal(mock.calls.length, 0)
      if (!throws) assert.equal(response.headers.get('Retry-After'), '60')
    }
  }
})

test('challenge token, hostname and action must all be valid', async () => {
  for (const changes of [{ turnstileToken: '' }, { turnstileToken: 'x'.repeat(2049) }, { requestId: 'bad' }, { requestId: [reference] }]) {
    const mock = upstream(); assert.equal((await handleContactRequest(request({ ...data, ...changes }), environment(), mock.fetcher)).status, 400); assert.equal(mock.calls.length, 0)
  }
  for (const challenge of [{ success: false }, { success: true, hostname: 'evil.example', action: 'contact_enquiry' }, { success: true, hostname: 'bitreca.com', action: 'login' }]) {
    const mock = upstream({ challenge }); assert.equal((await handleContactRequest(request(), environment(), mock.fetcher)).status, 400); assert.equal(mock.calls.length, 1)
  }
  const mock = upstream({ throwAt: 'siteverify' }); assert.equal((await handleContactRequest(request(), environment(), mock.fetcher)).status, 503)
})

test('accepted email has fixed recipient/sender, validated Reply-To, plain text and stable idempotency', async () => {
  const mock = upstream()
  for (let i = 0; i < 2; i++) {
    const response = await handleContactRequest(request({ ...data, turnstileToken: `synthetic-${i}` }), environment(), mock.fetcher)
    assert.equal(response.status, 202); assert.deepEqual(await response.json(), { status: 'accepted', reference })
  }
  const email = JSON.parse(mock.calls[1].body)
  assert.equal(email.from, 'Bitreca <info@bitreca.com>'); assert.deepEqual(email.to, ['info@bitreca.com'])
  assert.equal(email.reply_to, 'qa@example.com'); assert.equal(email.subject, 'Bitreca website project enquiry'); assert.equal(email.html, undefined)
  assert.ok(email.text.startsWith('Bitreca project enquiry\nName: QA Visitor\nEmail: qa@example.com'))
  assert.equal(mock.calls[1].headers['Idempotency-Key'], mock.calls[3].headers['Idempotency-Key'])
  assert.equal(JSON.parse(mock.calls[0].body).secret, 'synthetic-turnstile-secret')
  assert.equal(mock.calls[1].headers.Authorization, 'Bearer synthetic-resend-secret')
})

test('provider rejections, malformed acceptance, network errors and timeouts never report acceptance', async () => {
  for (const options of [{ providerStatus: 403, provider: { message: 'unverified domain' } }, { providerStatus: 429 }, { providerStatus: 500 }, { provider: { success: true } }, { provider: { id: 'invalid' } }, { throwAt: 'resend.com' }]) {
    const mock = upstream(options); const response = await handleContactRequest(request(), environment(), mock.fetcher)
    assert.ok([502, 504].includes(response.status)); const body = await response.text()
    assert.ok(!body.includes('accepted')); assert.ok(!body.includes('private details')); assert.ok(!body.includes('secret'))
  }
  const timedOut = async (url) => {
    if (url.includes('siteverify')) return Response.json({ success: true, hostname: 'bitreca.com', action: 'contact_enquiry' })
    throw new DOMException('synthetic timeout', 'TimeoutError')
  }
  assert.equal((await handleContactRequest(request(), environment(), timedOut)).status, 504)
  const html = async (url) => url.includes('siteverify')
    ? Response.json({ success: true, hostname: 'bitreca.com', action: 'contact_enquiry' })
    : new Response('<html>not acceptance</html>', { headers: { 'Content-Type': 'text/html' } })
  assert.equal((await handleContactRequest(request(), environment(), html)).status, 504)
})

test('WhatsApp uses official number, encoded service introduction and no private form content', () => {
  const url = new URL(contactWhatsAppUrl(data))
  assert.equal(url.origin + url.pathname, 'https://wa.me/96170864221')
  assert.ok(url.searchParams.get('text').includes('website development'))
  assert.ok(!url.href.includes('qa%40')); assert.ok(!url.href.includes('synthetic'))
})
