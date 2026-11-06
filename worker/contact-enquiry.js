import { normalizeContactPhone, validateContact } from '../shared/contact-enquiry.js'
import { contactBodyError, contactJson as reply, contactUuid, readContactJson } from './contact-http.js'

function configured(request, env) {
  const allowed = typeof env.CONTACT_ALLOWED_ORIGINS === 'string' ? env.CONTACT_ALLOWED_ORIGINS.split(',').map(value => value.trim()) : []
  return env.CONTACT_INBOX_ENABLED === 'true' && allowed.includes(new URL(request.url).origin) &&
    typeof env.CONTACT_RATE_LIMIT_SECRET === 'string' && env.CONTACT_RATE_LIMIT_SECRET.trim().length >= 32 &&
    ['CONTACT_TURNSTILE_SECRET', 'CONTACT_TURNSTILE_SITE_KEY'].every(key => typeof env[key] === 'string' && env[key].trim()) &&
    typeof env.bitreca_db?.prepare === 'function'
}

async function schemaReady(db) {
  try {
    const checks = await db.batch([
      db.prepare('SELECT id, request_id, request_hash, whatsapp_consent, version FROM contact_enquiries LIMIT 0'),
      db.prepare('SELECT key, hits, expires_at FROM contact_enquiry_limits LIMIT 0'),
    ])
    return checks.length === 2 && checks.every(result => result.success === true)
  } catch { return false }
}

async function digest(secret, value) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function reserveAttempts(db, ipKey) {
  // Each capped increment is atomic on D1's primary. Rejections do not create
  // per-IP rows once the shared budget has been exhausted.
  for (const [prefix, period, maximum] of [['day:', 86400, 200], ['minute:', 60, 20], [`ip:${ipKey}:`, 600, 5]]) {
    const row = await db.prepare(`
      INSERT INTO contact_enquiry_limits (key, hits, expires_at)
      VALUES (? || CAST(unixepoch() / ${period} AS INTEGER), 1, (CAST(unixepoch() / ${period} AS INTEGER) + 1) * ${period} + 60)
      ON CONFLICT(key) DO UPDATE SET hits = contact_enquiry_limits.hits + 1
      WHERE contact_enquiry_limits.hits < ${maximum}
      RETURNING hits
    `).bind(prefix).first()
    if (!row || !Number.isInteger(row.hits) || row.hits < 1 || row.hits > maximum) return period
  }
  const cleanup = await db.prepare('DELETE FROM contact_enquiry_limits WHERE key IN (SELECT key FROM contact_enquiry_limits WHERE expires_at < unixepoch() ORDER BY expires_at LIMIT 100)').run()
  if (cleanup.success !== true) throw new Error('Counter cleanup unavailable')
  return 0
}

export async function handleContactRequest(request, env, fetcher = fetch) {
  const url = new URL(request.url)
  if (url.pathname === '/api/contact/config') {
    if (request.method !== 'GET') return reply(405, { status: 'method_not_allowed' }, { Allow: 'GET' })
    const enabled = Boolean(configured(request, env) && await schemaReady(env.bitreca_db))
    return reply(200, { enabled, mode: 'inbox', siteKey: enabled ? env.CONTACT_TURNSTILE_SITE_KEY : null })
  }
  if (url.pathname !== '/api/enquiries') return reply(404, { status: 'not_found' })
  if (request.method !== 'POST') return reply(405, { status: 'method_not_allowed' }, { Allow: 'POST' })
  if (request.headers.get('Origin') !== url.origin) return reply(403, { status: 'forbidden' })
  if (!configured(request, env) || !await schemaReady(env.bitreca_db)) return reply(503, { status: 'unavailable' })
  const ip = request.headers.get('CF-Connecting-IP')
  if (!ip) return reply(503, { status: 'unavailable' })
  let input
  try { input = await readContactJson(request) } catch (status) { return contactBodyError(status) }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['name', 'email', 'service', 'message', 'phone', 'whatsappConsent', 'website', 'requestId', 'turnstileToken'].includes(key))) return reply(400, { status: 'invalid_request' })
  const errors = validateContact(input)
  if (Object.keys(errors).length) return reply(422, { status: 'invalid', errors })
  if ((input.website !== undefined && input.website !== '') || typeof input.requestId !== 'string' || !contactUuid.test(input.requestId) || typeof input.turnstileToken !== 'string' || !input.turnstileToken.trim() || input.turnstileToken.length > 2048) return reply(400, { status: 'invalid_request' })
  const fields = {
    name: input.name.trim(), email: input.email.trim(), service: input.service,
    message: input.message.replace(/\r\n?/g, '\n').trim(),
    phone: normalizeContactPhone(input.phone) || null, whatsappConsent: input.whatsappConsent === true ? 1 : 0,
  }
  const requestId = input.requestId.toLowerCase()
  try {
    const ipKey = await digest(env.CONTACT_RATE_LIMIT_SECRET, JSON.stringify(['contact-ip-v1', new Date().toISOString().slice(0, 10), ip]))
    const wait = await reserveAttempts(env.bitreca_db, ipKey)
    if (wait) return reply(429, { status: 'rate_limited', retryAfter: wait }, { 'Retry-After': String(wait) })
    const requestHash = await digest(env.CONTACT_RATE_LIMIT_SECRET, JSON.stringify(['contact-enquiry-v1', fields]))
    const existing = await env.bitreca_db.prepare('SELECT id, request_hash FROM contact_enquiries WHERE request_id = ?').bind(requestId).first()
    // An exact receipt retry discloses no message/status and can recover a lost
    // acknowledgement without requiring reuse of a consumed Turnstile token.
    if (existing) return existing.request_hash === requestHash
      ? reply(200, { status: 'stored', reference: existing.id })
      : reply(409, { status: 'request_conflict' })

    let verified
    try {
      const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: env.CONTACT_TURNSTILE_SECRET, response: input.turnstileToken, remoteip: ip }),
        signal: AbortSignal.timeout(8000), redirect: 'error',
      })
      verified = response.ok && response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null
    } catch { return reply(503, { status: 'challenge_unavailable' }) }
    if (verified?.success !== true || verified.hostname !== url.hostname || verified.action !== 'contact_enquiry') return reply(400, { status: 'invalid_challenge' })

    const inserted = await env.bitreca_db.prepare(`
      INSERT INTO contact_enquiries (id, request_id, request_hash, name, email, service, message, phone, whatsapp_consent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(request_id) DO NOTHING RETURNING id
    `).bind(crypto.randomUUID(), requestId, requestHash, fields.name, fields.email, fields.service, fields.message, fields.phone, fields.whatsappConsent).first()
    if (inserted && contactUuid.test(inserted.id)) return reply(201, { status: 'stored', reference: inserted.id })
    const receipt = await env.bitreca_db.prepare('SELECT id, request_hash FROM contact_enquiries WHERE request_id = ?').bind(requestId).first()
    if (receipt?.request_hash === requestHash && contactUuid.test(receipt.id)) return reply(200, { status: 'stored', reference: receipt.id })
    return receipt ? reply(409, { status: 'request_conflict' }) : reply(503, { status: 'unconfirmed' })
  } catch {
    // The write outcome can be uncertain after a D1/network error. Never claim
    // success or definite non-storage; preserve the same request ID for retry.
    return reply(503, { status: 'unconfirmed' })
  }
}
