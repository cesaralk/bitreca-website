import { contactRecipient, formatContactBrief, validateContact } from '../shared/contact-enquiry.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const reply = (status, body, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } })

function configured(request, env) {
  const origin = new URL(request.url).origin
  const allowed = typeof env.CONTACT_ALLOWED_ORIGINS === 'string' ? env.CONTACT_ALLOWED_ORIGINS.split(',').map((value) => value.trim()) : []
  return env.CONTACT_EMAIL_ENABLED === 'true' && env.CONTACT_RESEND_DOMAIN_VERIFIED === 'true' &&
    ['RESEND_API_KEY', 'CONTACT_TURNSTILE_SECRET', 'CONTACT_TURNSTILE_SITE_KEY'].every((key) => typeof env[key] === 'string' && env[key].trim()) &&
    typeof env.CONTACT_RATE_LIMITER?.limit === 'function' && typeof env.CONTACT_GLOBAL_RATE_LIMITER?.limit === 'function' &&
    allowed.includes(origin)
}

async function boundedJson(request) {
  if (Number(request.headers.get('Content-Length')) > 24576) throw 413
  const reader = request.body?.getReader()
  if (!reader) throw 400
  let timer
  try {
    return await Promise.race([
      (async () => {
        const chunks = []
        let bytes = 0
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > 24576) throw 413
          chunks.push(value)
        }
        const body = new Uint8Array(bytes)
        let offset = 0
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
        try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) } catch { throw 400 }
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(408), 5000) }),
    ])
  } finally {
    clearTimeout(timer)
    // Do not wait for an attacker-controlled stream to acknowledge cancellation.
    reader.cancel().catch(() => {})
  }
}

async function upstreamJson(fetcher, url, options) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(8000), redirect: 'error' })
  const body = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null
  return { response, body }
}

export async function handleContactRequest(request, env, fetcher = fetch) {
  const url = new URL(request.url)
  if (url.pathname === '/api/contact/config') {
    if (request.method !== 'GET') return reply(405, { status: 'method_not_allowed' }, { Allow: 'GET' })
    const enabled = Boolean(configured(request, env))
    return reply(200, { enabled, siteKey: enabled ? env.CONTACT_TURNSTILE_SITE_KEY : null })
  }
  if (request.method !== 'POST') return reply(405, { status: 'method_not_allowed' }, { Allow: 'POST' })
  if (request.headers.get('Origin') !== url.origin) return reply(403, { status: 'forbidden' })
  if (!configured(request, env)) return reply(503, { status: 'unavailable' })
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, { status: 'invalid_content_type' })

  const ip = request.headers.get('CF-Connecting-IP')
  if (!ip) return reply(503, { status: 'unavailable' })
  try {
    // Dedicated Cloudflare bindings: no admin limiter, D1 or process-local map.
    const personal = await env.CONTACT_RATE_LIMITER.limit({ key: `contact:${ip}` })
    if (personal?.success !== true) return reply(429, { status: 'rate_limited' }, { 'Retry-After': '60' })
    const budget = await env.CONTACT_GLOBAL_RATE_LIMITER.limit({ key: 'contact:all' })
    if (budget?.success !== true) return reply(429, { status: 'rate_limited' }, { 'Retry-After': '60' })
  } catch { return reply(503, { status: 'unavailable' }) }

  let input
  try { input = await boundedJson(request) } catch (status) {
    return reply([400, 408, 413].includes(status) ? status : 400, { status: 'invalid_request' })
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['name', 'email', 'service', 'message', 'turnstileToken', 'requestId'].includes(key))) {
    return reply(400, { status: 'invalid_request' })
  }
  const errors = validateContact(input)
  if (Object.keys(errors).length) return reply(422, { status: 'invalid', errors })
  if (typeof input.requestId !== 'string' || !uuid.test(input.requestId) || typeof input.turnstileToken !== 'string' || !input.turnstileToken.trim() || input.turnstileToken.length > 2048) {
    return reply(400, { status: 'invalid_challenge' })
  }

  let challenge
  try {
    challenge = await upstreamJson(fetcher, 'https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.CONTACT_TURNSTILE_SECRET, response: input.turnstileToken, remoteip: ip }),
    })
  } catch { return reply(503, { status: 'challenge_unavailable' }) }
  if (!challenge.response.ok || challenge.body?.success !== true || challenge.body.hostname !== url.hostname || challenge.body.action !== 'contact_enquiry') {
    return reply(400, { status: 'invalid_challenge' })
  }

  const email = {
    from: `Bitreca <${contactRecipient}>`, to: [contactRecipient],
    reply_to: input.email.trim(), subject: 'Bitreca website project enquiry',
    text: formatContactBrief(input),
  }
  // Bind retries to both the logical enquiry ID and exact provider payload.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(email)))
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  try {
    const result = await upstreamJson(fetcher, 'https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `contact/${input.requestId}/${hash}` },
      body: JSON.stringify(email),
    })
    if (result.response.ok && typeof result.body?.id === 'string' && uuid.test(result.body.id)) {
      return reply(202, { status: 'accepted', reference: result.body.id })
    }
    // 5xx, invalid success bodies and connection failures have uncertain outcomes.
    if (result.response.status >= 500 || result.response.ok) return reply(504, { status: 'unconfirmed' })
    return reply(502, { status: 'rejected' })
  } catch { return reply(504, { status: 'unconfirmed' }) }
}
