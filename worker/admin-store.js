import { storeUuid, storeImageKey, storeStatuses, validateStoreRecord } from '../shared/store-catalogue.js'
import { readContactJson, contactJson as json, contactBodyError } from './contact-http.js'
import { deleteStoreProduct, pendingStoreDeletions } from './store-product-deletion.js'
import { imageSha256, storeImageLimit, storeImageTypes, storeUploadKey, validStoreUpload } from '../shared/store-image-upload.js'

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
  const url = new URL(request.url), verifying = url.search === '?verify=1'
  if (url.search && !verifying) return json(400, { success: false, message: 'Invalid image parameters.' })
  const tracked = request.headers.has('X-Store-Upload-Id') || request.headers.has('X-Store-Product-Id') || request.headers.has('X-Store-Upload-SHA256')
  const upload = tracked ? {
    id: request.headers.get('X-Store-Upload-Id'), productId: request.headers.get('X-Store-Product-Id'), sha256: request.headers.get('X-Store-Upload-SHA256'),
    type: request.method === 'POST' ? request.headers.get('Content-Type') : { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[tail?.split('.').at(-1)],
  } : null
  if (tracked && !validStoreUpload(upload) || verifying && !tracked) return json(400, { success: false, message: 'Invalid upload reference.' })
  const retired = async key => env.bitreca_db.prepare("SELECT id FROM store_product_deletions WHERE id=? OR (image_key=? AND state IN ('pending','removed')) LIMIT 1").bind(upload.productId, key).first()
  const readClaim = () => env.bitreca_db.prepare('SELECT * FROM store_image_upload_receipts WHERE upload_id=?').bind(upload.id).first()
  const matchingClaim = claim => claim.product_id === upload.productId && claim.image_key === storeUploadKey(upload) && claim.sha256 === upload.sha256 && claim.content_type === upload.type
  const pending = () => json(202, { success: false, status: 'upload_unconfirmed', message: 'This upload reference already started a storage write. Check upload to verify its outcome; it will not be written again.' })
  const conflict = () => json(409, { success: false, message: 'This image reference is already used or belongs to a deleted product. No image was replaced. Choose a new upload.' })
  function confirmation(object, key) {
    const digest = object?.checksums?.sha256 ? Array.from(new Uint8Array(object.checksums.sha256), byte => byte.toString(16).padStart(2, '0')).join('') : null
    if (!object || object.customMetadata?.store_product_id !== upload.productId || object.customMetadata?.store_upload_sha256 !== upload.sha256 || digest !== upload.sha256 || object.httpMetadata?.contentType !== upload.type || object.size < 1 || object.size > storeImageLimit) return null
    return { success: true, image_key: key, upload_id: upload.id, product_id: upload.productId, sha256: digest, size: object.size, type: upload.type }
  }
  if (verifying) {
    if (request.method !== 'GET' || !tail || `store-catalogue/${tail}` !== storeUploadKey(upload)) return json(400, { success: false, message: 'Invalid upload check.' })
    const key = storeUploadKey(upload)
    if (await retired(key)) return conflict()
    const object = await env.bitreca_media.head(key)
    if (!object) {
      const claim = await readClaim()
      if (claim) return matchingClaim(claim) ? pending() : conflict()
      return json(404, { success: false, status: 'upload_not_found', message: 'No storage write is claimed yet. An earlier request may still be arriving.' })
    }
    const result = confirmation(object, key)
    return result ? json(200, result) : conflict()
  }
  if (request.method === 'GET' && tail) {
    const key = `store-catalogue/${tail}`
    if (!storeImageKey.test(key)) return json(404, { success: false, message: 'Image not found.' })
    const object = await env.bitreca_media.get(key)
    if (!object) return json(404, { success: false, message: 'Image not found.' })
    const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[tail.split('.').at(-1)]
    return new Response(object.body, { headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } })
  }
  if (request.method !== 'POST' || tail) return json(405, { success: false, message: 'Method not allowed.' })
  const type = request.headers.get('Content-Type'), extensions = storeImageTypes, limit = storeImageLimit
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
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(408), tracked ? 30000 : 5000) })])
    const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    if (!(type === 'image/jpeg' && jpeg || type === 'image/png' && png || type === 'image/webp' && webp)) return json(400, { success: false, message: 'Image content does not match its type.' })
    const key = tracked ? storeUploadKey(upload) : `store-catalogue/${crypto.randomUUID()}.${extensions[type]}`
    if (tracked) {
      if (await imageSha256(bytes) !== upload.sha256) return json(422, { success: false, message: 'Image checksum mismatch. No image was stored.' })
      if (await retired(key)) return conflict()
      const existing = await env.bitreca_media.head(key)
      if (existing) { const result = confirmation(existing, key); return result ? json(200, result) : conflict() }
      const claimed = await env.bitreca_db.prepare('INSERT INTO store_image_upload_receipts(upload_id,product_id,image_key,sha256,content_type,size) VALUES(?,?,?,?,?,?) ON CONFLICT(upload_id) DO NOTHING RETURNING upload_id').bind(upload.id, upload.productId, key, upload.sha256, upload.type, bytes.length).first()
      if (!claimed) {
        const claim = await readClaim()
        return claim && matchingClaim(claim) && claim.size === bytes.length ? pending() : conflict()
      }
      // Atomic create-only: even simultaneous retries cannot overwrite an existing/shared image.
      const stored = await env.bitreca_media.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }), sha256: upload.sha256, httpMetadata: { contentType: type }, customMetadata: { store_product_id: upload.productId, store_upload_sha256: upload.sha256 } })
      if (await retired(key)) return conflict()
      const result = confirmation(stored || await env.bitreca_media.head(key), key)
      return result ? json(stored ? 201 : 200, result) : conflict()
    }
    await env.bitreca_media.put(key, bytes, { httpMetadata: { contentType: type } })
    return json(201, { success: true, image_key: key })
  } catch (error) { if ([408, 413].includes(error)) return json(error, { success: false, message: 'Image exceeded the size or upload time limit.' }); return unavailable() }
  finally { clearTimeout(timer); reader.cancel().catch(() => {}) }
}

// Dispatch ONLY after the existing admin origin/session gate in worker/index.js.
export async function handleAdminStore(request, env) {
  if (new URL(request.url).pathname === '/api/admin/store/product-deletions') return pendingStoreDeletions(request, env)
  const url = new URL(request.url), match = /^\/api\/admin\/store\/(categories|products|media)(?:\/([^/]+))?$/.exec(url.pathname)
  if (!match) return json(404, { success: false, message: 'Catalogue route not found.' })
  const [, kind, id] = match
  try {
    if (kind === 'media') return await media(request, env, id)
    if (id && !storeUuid.test(id)) return json(404, { success: false, message: 'Record not found.' })
    if (kind === 'products' && id && request.method === 'DELETE') return deleteStoreProduct(request, env, id)
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
    if (!(request.method === 'POST' && !id || request.method === 'PUT' && id)) return json(405, { success: false, message: 'Use supported catalogue actions. Only individually confirmed products support permanent deletion.' }, { Allow: id ? kind === 'products' ? 'GET, PUT, DELETE' : 'GET, PUT' : 'GET, POST' })
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
    if (/STORE_IMAGE_DELETING|STORE_PRODUCT_DELETED/.test(message)) return json(409, { success: false, message: 'This product ID or image belongs to a permanent deletion. Use a new product reference or upload a new image.' })
    if (/STORE_CATEGORY_STATE|FOREIGN KEY constraint failed/.test(message)) return json(409, { success: false, message: 'Category state prevents this change. Publish the category before its products; unpublish or archive its products before changing the category.' })
    if (/UNIQUE constraint failed/.test(message)) return json(409, { success: false, message: 'SKU or slug is already in use. Archived records retain their identifiers.' })
    return unavailable()
  }
}
