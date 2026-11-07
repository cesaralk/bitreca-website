import { orderLimits, validateOrderRequest } from '../shared/store-order-request.js'
import { contactJson as json, contactUuid, readContactJson } from './contact-http.js'

const disabled = () => json(503, { status: 'intake_disabled', message: 'Product request intake is not open. No request was submitted. Please contact Bitreca directly.' })
function configured(request, env) {
  return env.STORE_ORDER_REQUESTS_ENABLED === 'true' && typeof env.CONTACT_ALLOWED_ORIGINS === 'string' && env.CONTACT_ALLOWED_ORIGINS.split(',').map(value => value.trim()).includes(new URL(request.url).origin) && typeof env.CONTACT_RATE_LIMIT_SECRET === 'string' && env.CONTACT_RATE_LIMIT_SECRET.trim().length >= 32 && ['CONTACT_TURNSTILE_SITE_KEY', 'CONTACT_TURNSTILE_SECRET'].every(key => typeof env[key] === 'string' && env[key].trim()) && typeof env.bitreca_db?.batch === 'function'
}
async function schemaReady(db) {
  try {
    const results = await db.batch([db.prepare('SELECT id, committed, request_hash FROM store_order_requests LIMIT 0'), db.prepare('SELECT request_ref, quantity FROM store_order_request_items LIMIT 0'), db.prepare('SELECT key, hits FROM store_order_request_limits LIMIT 0')])
    return results.length === 3 && results.every(result => result.success === true)
  } catch { return false }
}
async function hmac(secret, value) {
  const encoder = new TextEncoder(), key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))), n => n.toString(16).padStart(2, '0')).join('')
}
async function reserve(db, ip) {
  for (const [prefix, period, max] of [['day:', 86400, 200], ['minute:', 60, 20], [`ip:${ip}:`, 600, 5]]) {
    const row = await db.prepare(`INSERT INTO store_order_request_limits(key,hits,expires_at) VALUES (? || CAST(unixepoch() / ${period} AS INTEGER),1,(CAST(unixepoch() / ${period} AS INTEGER)+1)*${period}+60) ON CONFLICT(key) DO UPDATE SET hits=store_order_request_limits.hits+1 WHERE store_order_request_limits.hits < ${max} RETURNING hits`).bind(prefix).first()
    if (!row) return period
  }
  const cleanup = await db.prepare('DELETE FROM store_order_request_limits WHERE key IN (SELECT key FROM store_order_request_limits WHERE expires_at < unixepoch() ORDER BY expires_at LIMIT 100)').run()
  if (cleanup.success !== true) throw Error('limits')
  return 0
}

export async function handleStoreOrderRequest(request, env, fetcher = fetch) {
  const url = new URL(request.url), config = url.pathname === '/api/store/order-requests/config'
  if (config) {
    if (request.method !== 'GET') return json(405, { status: 'method_not_allowed' }, { Allow: 'GET' })
    const enabled = Boolean(configured(request, env) && await schemaReady(env.bitreca_db))
    return json(200, { enabled, siteKey: enabled ? env.CONTACT_TURNSTILE_SITE_KEY : null, limits: orderLimits })
  }
  if (url.pathname !== '/api/store/order-requests') return json(404, { status: 'not_found' })
  if (request.method !== 'POST') return json(405, { status: 'method_not_allowed' }, { Allow: 'POST' })
  // Fail before parsing, counters, verification or persistence. A hidden button is
  // not the launch gate. Missing/false/any other value remains disabled.
  if (env.STORE_ORDER_REQUESTS_ENABLED !== 'true') return disabled()
  if (request.headers.get('Origin') !== url.origin) return json(403, { status: 'forbidden' })
  if (!configured(request, env) || !await schemaReady(env.bitreca_db)) return json(503, { status: 'unavailable' })
  const ip = request.headers.get('CF-Connecting-IP')
  if (!ip) return json(503, { status: 'unavailable' })
  let body
  try { body = await readContactJson(request, 16384) } catch (status) { return json([400, 408, 413, 415].includes(status) ? status : 400, { status: 'invalid_request' }) }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['requestId', 'turnstileToken', 'name', 'email', 'phone', 'whatsappConsent', 'note', 'manualReviewAck', 'website', 'items'].includes(key)) || typeof body.requestId !== 'string' || !contactUuid.test(body.requestId) || typeof body.turnstileToken !== 'string' || !body.turnstileToken.trim() || body.turnstileToken.length > 2048) return json(400, { status: 'invalid_request' })
  const { requestId: rawId, turnstileToken, ...input } = body
  const { errors, data } = validateOrderRequest(input)
  if (Object.keys(errors).length) return json(422, { status: 'invalid', errors })
  const requestId = rawId.toLowerCase()
  try {
    const ipKey = await hmac(env.CONTACT_RATE_LIMIT_SECRET, JSON.stringify(['store-order-ip-v1', new Date().toISOString().slice(0, 10), ip]))
    const wait = await reserve(env.bitreca_db, ipKey)
    if (wait) return json(429, { status: 'rate_limited' }, { 'Retry-After': String(wait) })
    const hash = await hmac(env.CONTACT_RATE_LIMIT_SECRET, JSON.stringify(['store-order-request-v1', data]))
    const receipt = () => env.bitreca_db.prepare('SELECT id, request_hash FROM store_order_requests WHERE request_id=? AND committed=1').bind(requestId).first()
    const existing = await receipt()
    if (existing) return existing.request_hash === hash ? json(200, { status: 'stored_for_review', reference: existing.id }) : json(409, { status: 'request_conflict' })
    let verified
    try {
      const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: env.CONTACT_TURNSTILE_SECRET, response: turnstileToken, remoteip: ip }), signal: AbortSignal.timeout(8000), redirect: 'manual' })
      verified = response.ok && response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null
    } catch { return json(503, { status: 'challenge_unavailable' }) }
    if (verified?.success !== true || verified.hostname !== url.hostname || verified.action !== 'store_order_request') return json(400, { status: 'invalid_challenge' })
    if (env.STORE_ORDER_REQUESTS_ENABLED !== 'true') return disabled()
    const id = crypto.randomUUID(), db = env.bitreca_db
    const statements = [db.prepare('INSERT INTO store_order_requests(id,request_id,request_hash,name,email,phone,whatsapp_consent,note,manual_review_ack,line_count,total_quantity) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING').bind(id, requestId, hash, data.name, data.email, data.phone, data.whatsapp_consent, data.note, 1, data.items.length, data.items.reduce((sum, item) => sum + item.quantity, 0))]
    for (const item of data.items) statements.push(db.prepare(`INSERT INTO store_order_request_items(id,request_ref,product_id,slug,sku,title,category_title,quantity,listed_price_minor,listed_currency,listed_price_note,listed_availability,availability_checked_at)
      SELECT ?,?,p.id,p.slug,p.sku,p.title,c.title,?,p.price_minor,p.currency,p.price_note,p.availability,p.availability_checked_at FROM store_products p JOIN store_categories c ON c.id=p.category_id
      WHERE p.slug=? AND p.status='published' AND c.status='published' AND p.availability<>'unavailable' AND EXISTS(SELECT 1 FROM store_order_requests WHERE id=? AND committed=0)`).bind(crypto.randomUUID(), id, item.quantity, item.slug, id))
    statements.push(db.prepare('UPDATE store_order_requests SET committed=1 WHERE id=? AND committed=0').bind(id))
    const results = await db.batch(statements)
    if (!results.every(result => result.success === true)) throw Error('batch')
    const saved = await receipt()
    if (saved?.request_hash === hash) return json(saved.id === id ? 201 : 200, { status: 'stored_for_review', reference: saved.id })
    return saved ? json(409, { status: 'request_conflict' }) : json(503, { status: 'unconfirmed' })
  } catch (error) {
    if (String(error?.message || '').includes('STORE_REQUEST_CATALOGUE_CHANGED')) return json(409, { status: 'catalogue_changed', message: 'Some selected products are no longer eligible. Refresh the selection before retrying.' })
    return json(503, { status: 'unconfirmed' })
  }
}
