import { storeImageKey, storeUuid } from '../shared/store-catalogue.js'
import { contactJson as json, readContactJson, contactBodyError } from './contact-http.js'

const receiptColumns = 'id,title,sku,version,image_key,state,created_at,completed_at'
const uncertain = () => json(503, { success: false, status: 'deletion_unconfirmed', message: 'Deletion could not be confirmed. Reload the product and pending image cleanup before retrying. No complete deletion is confirmed.' })
const readReceipt = (db, id) => db.prepare(`SELECT ${receiptColumns} FROM store_product_deletions WHERE id=?`).bind(id).first()
const publicReceipt = record => ({ id: record.id, title: record.title, sku: record.sku, version: record.version, state: record.state })

async function finish(env, record) {
  if (record.state === 'pending') {
    try {
      if (!storeImageKey.test(record.image_key) || !env.bitreca_media?.delete || !env.bitreca_media?.head) throw Error('cleanup unavailable')
      // D1 triggers fence all new references to this claimed key, even while R2
      // calls are in flight. Never list/delete a bucket prefix or arbitrary key.
      const shared = await env.bitreca_db.prepare('SELECT id FROM store_products WHERE image_key=? LIMIT 1').bind(record.image_key).first()
      if (shared) throw Error('unexpected reference')
      await env.bitreca_media.delete(record.image_key)
      if (await env.bitreca_media.head(record.image_key)) throw Error('image remains')
      await env.bitreca_db.prepare("UPDATE store_product_deletions SET state='removed',completed_at=unixepoch() WHERE id=? AND state='pending'").bind(record.id).run()
      const latest = await readReceipt(env.bitreca_db, record.id)
      if (!latest || latest.state !== 'removed') throw Error('cleanup receipt unconfirmed')
      record = latest
    } catch {
      return json(202, { success: false, status: 'cleanup_pending', product_deleted: true, cleanup_complete: false, receipt: publicReceipt(record), message: 'The product record was permanently deleted. Image cleanup is not confirmed. Retry pending image cleanup; complete deletion is not yet confirmed.' })
    }
  }
  return json(200, { success: true, status: 'deleted', product_deleted: true, cleanup_complete: true, receipt: publicReceipt(record), message: record.state === 'retained_shared' ? 'Product permanently deleted. Shared image preserved. Historical requests and snapshots retained.' : 'Product permanently deleted and image cleanup confirmed. Historical requests and snapshots retained.' })
}

// Existing admin session and mutation-origin gate runs before dispatch here.
export async function deleteStoreProduct(request, env, id) {
  if (!storeUuid.test(id) || new URL(request.url).search) return json(400, { success: false, message: 'Invalid product reference.' })
  let body
  try { body = await readContactJson(request, 1024) } catch (status) { return contactBodyError(status) }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['version', 'title', 'sku', 'confirmed'].includes(key)) || !Number.isSafeInteger(body.version) || body.version < 1 || typeof body.title !== 'string' || !body.title || body.title.length > 150 || typeof body.sku !== 'string' || !body.sku || body.sku.length > 64 || body.confirmed !== true) return json(400, { success: false, message: 'Confirm the saved title, SKU and version before permanently deleting this product.' })
  try {
    const db = env.bitreca_db
    let receipt = await readReceipt(db, id)
    if (!receipt) {
      const removed = await db.prepare('DELETE FROM store_products WHERE id=? AND version=? AND title=? AND sku=? COLLATE BINARY RETURNING id').bind(id, body.version, body.title, body.sku).first()
      receipt = await readReceipt(db, id)
      if (!removed && !receipt) {
        const current = await db.prepare('SELECT id FROM store_products WHERE id=?').bind(id).first()
        return json(current ? 409 : 404, { success: false, message: current ? 'Product changed or confirmation does not match. Reload and confirm its saved title and SKU again.' : 'Product not found; no deletion receipt is available.' })
      }
    }
    if (!receipt) return uncertain()
    if (receipt.version !== body.version || receipt.title !== body.title || receipt.sku !== body.sku) return json(409, { success: false, message: 'Deletion confirmation does not match the recorded operation. Reload pending cleanup.' })
    return await finish(env, receipt)
  } catch { return uncertain() }
}

export async function pendingStoreDeletions(request, env) {
  const url = new URL(request.url)
  if (request.method !== 'GET') return json(405, { success: false, message: 'Read pending cleanup here; retry through the confirmed product DELETE action.' }, { Allow: 'GET' })
  if ([...url.searchParams.keys()].some(key => key !== 'before' || url.searchParams.getAll(key).length !== 1)) return json(400, { success: false, message: 'Invalid cleanup page.' })
  const before = url.searchParams.get('before')
  if (before && !storeUuid.test(before)) return json(400, { success: false, message: 'Invalid cleanup page.' })
  try {
    // Stable UUID order, independent of mutable cleanup state; bounded pages.
    const results = await env.bitreca_db.prepare(`SELECT id,title,sku,version,state FROM store_product_deletions WHERE state='pending' ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT 21`).bind(...(before ? [before] : [])).all()
    if (results.success !== true) return uncertain()
    const records = results.results.slice(0, 20)
    return json(200, { success: true, records, next: results.results.length > 20 ? records.at(-1).id : null })
  } catch { return uncertain() }
}
