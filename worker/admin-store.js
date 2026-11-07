import { storeUuid, storeImageKey, storeStatuses, validateStoreRecord } from '../shared/store-catalogue.js'
import { readContactJson, contactJson as json, contactBodyError } from './contact-http.js'

const tables = { categories: 'store_categories', products: 'store_products' }
const summaries = { categories: 'id, title, slug, status, created_at, updated_at, version', products: 'id, title, sku, slug, category_id, status, availability, created_at, updated_at, version' }
const unavailable = () => json(503, { success: false, message: 'Catalogue request could not be confirmed. Reload before retrying; your entries may already have been saved.' })

function cursor(value) {
  if (!value) return null
  if (value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('cursor')
  const parsed = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')))
  if (!Number.isSafeInteger(parsed.time) || parsed.time < 0 || !storeUuid.test(parsed.id)) throw new Error('cursor')
  return parsed
}

async function media(request, env, tail) {
  if (!env.bitreca_media) return unavailable()
  if (request.method === 'GET' && tail) {
    const key = `store-catalogue/${tail}`
    if (!storeImageKey.test(key)) return json(404, { success: false, message: 'Image not found.' })
    const object = await env.bitreca_media.get(key)
    if (!object) return json(404, { success: false, message: 'Image not found.' })
    const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[tail.split('.').at(-1)]
    return new Response(object.body, { headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } })
  }
  if (request.method !== 'POST' || tail) return json(405, { success: false, message: 'Method not allowed.' })
  const type = request.headers.get('Content-Type'), extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }, limit = 2 * 1024 * 1024
  if (!Object.hasOwn(extensions, type)) return json(415, { success: false, message: 'Choose JPEG, PNG or WebP.' })
  if (Number(request.headers.get('Content-Length')) > limit) return json(413, { success: false, message: 'Image must be 2 MB or smaller.' })
  const reader = request.body?.getReader()
  if (!reader) return json(400, { success: false, message: 'Choose an image.' })
  let timer
  try {
    const bytes = await Promise.race([(async () => {
      const chunks = []; let size = 0
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw 413; chunks.push(value) }
      const result = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
      return result
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(408), 5000) })])
    const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    if (!(type === 'image/jpeg' && jpeg || type === 'image/png' && png || type === 'image/webp' && webp)) return json(400, { success: false, message: 'Image content does not match its type.' })
    const key = `store-catalogue/${crypto.randomUUID()}.${extensions[type]}`
    await env.bitreca_media.put(key, bytes, { httpMetadata: { contentType: type } })
    return json(201, { success: true, image_key: key })
  } catch (error) { if ([408, 413].includes(error)) return json(error, { success: false, message: 'Image exceeded the size or upload time limit.' }); return unavailable() }
  finally { clearTimeout(timer); reader.cancel().catch(() => {}) }
}

// Dispatch ONLY after the existing admin origin/session gate in worker/index.js.
export async function handleAdminStore(request, env) {
  const url = new URL(request.url), match = /^\/api\/admin\/store\/(categories|products|media)(?:\/([^/]+))?$/.exec(url.pathname)
  if (!match) return json(404, { success: false, message: 'Catalogue route not found.' })
  const [, kind, id] = match
  try {
    if (kind === 'media') return await media(request, env, id)
    if (id && !storeUuid.test(id)) return json(404, { success: false, message: 'Record not found.' })
    const db = env.bitreca_db, table = tables[kind]
    if (request.method === 'GET') {
      if (id) {
        if (url.search) return json(400, { success: false, message: 'Unexpected parameters.' })
        const record = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first()
        if (!record) return json(404, { success: false, message: 'Record not found.' })
        delete record.creation_hash
        return json(200, { success: true, record })
      }
      const allowed = kind === 'products' ? ['status', 'cursor', 'category_id'] : ['status', 'cursor']
      if ([...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) return json(400, { success: false, message: 'Invalid filter.' })
      const status = url.searchParams.get('status') || 'all', category = url.searchParams.get('category_id')
      if (status !== 'all' && !storeStatuses.includes(status) || category !== null && !storeUuid.test(category)) return json(400, { success: false, message: 'Invalid filter.' })
      let page
      try { page = cursor(url.searchParams.get('cursor')) } catch { return json(400, { success: false, message: 'Invalid page cursor.' }) }
      const conditions = [], values = []
      if (status !== 'all') { conditions.push('status = ?'); values.push(status) }
      if (category) { conditions.push('category_id = ?'); values.push(category) }
      if (page) { conditions.push('(created_at < ? OR (created_at = ? AND id < ?))'); values.push(page.time, page.time, page.id) }
      const result = await db.prepare(`SELECT ${summaries[kind]} FROM ${table} ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT 21`).bind(...values).all()
      if (!result.success) return unavailable()
      const records = result.results.slice(0, 20), last = records.at(-1)
      return json(200, { success: true, records, nextCursor: result.results.length > 20 ? btoa(JSON.stringify({ time: last.created_at, id: last.id })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null })
    }
    if (!(request.method === 'POST' && !id || request.method === 'PUT' && id)) return json(405, { success: false, message: 'Use create/edit with archive or draft status. Deletion is unavailable.' }, { Allow: id ? 'GET, PUT' : 'GET, POST' })
    let body
    try { body = await readContactJson(request, 49152) } catch (status) { return contactBodyError(status) }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['id', 'version', 'data'].includes(key)) || !storeUuid.test(body.id) || (id && (body.id !== id || !Number.isSafeInteger(body.version) || body.version < 1)) || (!id && body.version !== undefined)) return json(400, { success: false, message: 'Invalid record ID or version.' })
    const { data, errors } = validateStoreRecord(kind, body.data)
    if (Object.keys(errors).length) return json(422, { success: false, errors, message: 'Check the highlighted fields.' })
    if (kind === 'products' && data.image_key && !(await env.bitreca_media?.head(data.image_key))) return json(422, { success: false, errors: { image_key: 'Uploaded image is unavailable. Choose another image.' }, message: 'Image unavailable.' })
    const columns = Object.keys(data), values = Object.values(data)
    if (!id) {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)))), n => n.toString(16).padStart(2, '0')).join('')
      const inserted = await db.prepare(`INSERT INTO ${table} (id, creation_hash, ${columns.join(', ')}) VALUES (?, ?, ${columns.map(() => '?').join(', ')}) ON CONFLICT(id) DO NOTHING RETURNING id`).bind(body.id, hash, ...values).first()
      if (!inserted) {
        const existing = await db.prepare(`SELECT creation_hash FROM ${table} WHERE id = ?`).bind(body.id).first()
        if (existing?.creation_hash !== hash) return json(409, { success: false, message: 'This create reference was already used. Reload the saved record before editing.' })
      }
      return json(inserted ? 201 : 200, { success: true, id: body.id })
    }
    const updated = await db.prepare(`UPDATE ${table} SET ${columns.map(key => key + ' = ?').join(', ')}, updated_at = unixepoch(), version = version + 1 WHERE id = ? AND version = ? RETURNING id`).bind(...values, id, body.version).first()
    if (!updated) {
      const existing = await db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first()
      return json(existing ? 409 : 404, { success: false, message: existing ? 'Record changed. Reload it before saving again.' : 'Record not found.' })
    }
    return json(200, { success: true, id })
  } catch (error) {
    const message = String(error?.message || '')
    if (/STORE_CATEGORY_STATE|FOREIGN KEY constraint failed/.test(message)) return json(409, { success: false, message: 'Category state prevents this change. Publish the category before its products; unpublish or archive its products before changing the category.' })
    if (/UNIQUE constraint failed/.test(message)) return json(409, { success: false, message: 'SKU or slug is already in use. Archived records retain their identifiers.' })
    return unavailable()
  }
}
