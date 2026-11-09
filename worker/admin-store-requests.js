import { orderStatuses, orderTransitions } from '../shared/store-order-request.js'
import { fulfilmentColumns, fulfilmentFields, fulfilmentStages, validateFulfilment } from '../shared/store-fulfilment.js'
import { contactJson as json, contactUuid, readContactJson } from './contact-http.js'

// Invoked only after the existing session + mutation-origin gate.
export async function handleAdminStoreRequests(request, env) {
  const url = new URL(request.url), match = /^\/api\/admin\/store\/requests(?:\/([^/]+)(\/fulfilment)?)?$/.exec(url.pathname)
  if (!match || match[1] && !contactUuid.test(match[1])) return json(404, { success: false, message: 'Request not found.' })
  const id = match[1], fulfilment = Boolean(match[2]), db = env.bitreca_db
  try {
    if (fulfilment) {
      if (url.search) return json(400, { success: false, message: 'Unexpected parameters.' })
      if (request.method !== 'PATCH') return json(405, { success: false, message: 'Method not allowed.' }, { Allow: 'PATCH' })
      let body
      try { body = await readContactJson(request, 8192) } catch { return json(400, { success: false, message: 'Invalid fulfilment update (maximum 8 KiB JSON).' }) }
      const current = await db.prepare(`SELECT version,${fulfilmentColumns} FROM store_order_requests WHERE id=? AND committed=1`).bind(id).first()
      if (!current) return json(404, { success: false, message: 'Request not found.' })
      if (Number.isSafeInteger(body?.version) && body.version !== current.version) return json(409, { success: false, message: 'Request changed. Reload before updating.' })
      const items = (await db.prepare('SELECT listed_price_minor,listed_currency FROM store_order_request_items WHERE request_ref=?').bind(id).all())
      if (items.success !== true || !Array.isArray(items.results)) throw Error('read')
      const validation = validateFulfilment(body, current, items.results)
      if (Object.keys(validation.errors).length) return json(422, { success: false, message: 'Check the fulfilment fields. Nothing was updated.', errors: validation.errors })
      const updated = await db.prepare(`UPDATE store_order_requests SET ${fulfilmentFields.map(field => field + '=?').join(',')},customer_confirmed_at=CASE WHEN ?=1 THEN unixepoch() ELSE customer_confirmed_at END,updated_at=unixepoch(),version=version+1 WHERE id=? AND committed=1 AND version=? RETURNING id,version,updated_at,${fulfilmentColumns}`).bind(...fulfilmentFields.map(field => validation.data[field]), validation.confirming ? 1 : 0, id, body.version).first()
      return updated ? json(200, { success: true, record: updated }) : json(409, { success: false, message: 'Request changed. Reload before updating.' })
    }
    if (request.method === 'GET') {
      if (id) {
        if (url.search) return json(400, { success: false, message: 'Unexpected parameters.' })
        const results = await db.batch([db.prepare(`SELECT id,name,email,phone,whatsapp_consent,note,manual_review_ack,line_count,total_quantity,status,created_at,updated_at,version,${fulfilmentColumns} FROM store_order_requests WHERE id=? AND committed=1`).bind(id), db.prepare('SELECT slug,sku,title,category_title,quantity,listed_price_minor,listed_currency,listed_price_note,listed_availability,availability_checked_at,captured_at FROM store_order_request_items WHERE request_ref=? ORDER BY slug').bind(id)])
        if (!results.every(result => result.success === true)) throw Error('read')
        const record = results[0].results[0]
        return record ? json(200, { success: true, record, items: results[1].results }) : json(404, { success: false, message: 'Request not found.' })
      }
      if ([...url.searchParams.keys()].some(key => !['status', 'stage', 'cursor'].includes(key) || url.searchParams.getAll(key).length !== 1)) return json(400, { success: false, message: 'Invalid filter.' })
      const status = url.searchParams.get('status') || 'all', value = url.searchParams.get('cursor'), conditions = ['committed=1'], bindings = []
      if (status !== 'all') { if (!Object.hasOwn(orderStatuses, status)) return json(400, { success: false, message: 'Invalid status.' }); conditions.push('status=?'); bindings.push(status) }
      const stage = url.searchParams.get('stage') || 'all'
      if (stage !== 'all') { if (!Object.hasOwn(fulfilmentStages, stage)) return json(400, { success: false, message: 'Invalid fulfilment stage.' }); conditions.push('fulfilment_stage=?'); bindings.push(stage) }
      if (value) {
        let page
        try { if (value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error(); page = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/'))); if (!Number.isSafeInteger(page.time) || page.time < 0 || !contactUuid.test(page.id)) throw Error() } catch { return json(400, { success: false, message: 'Invalid page.' }) }
        conditions.push('(created_at < ? OR (created_at = ? AND id < ?))'); bindings.push(page.time, page.time, page.id)
      }
      const result = await db.prepare(`SELECT id,name,line_count,total_quantity,status,created_at,updated_at,version,fulfilment_stage,payment_status FROM store_order_requests WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT 21`).bind(...bindings).all()
      if (result.success !== true) throw Error('read')
      const records = result.results.slice(0, 20), last = records.at(-1)
      return json(200, { success: true, records, nextCursor: result.results.length > 20 ? btoa(JSON.stringify({ time: last.created_at, id: last.id })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null })
    }
    if (!id || request.method !== 'PATCH') return json(405, { success: false, message: 'Method not allowed. Requests and snapshots cannot be deleted.' }, { Allow: id ? 'GET, PATCH' : 'GET' })
    let body
    try { body = await readContactJson(request, 512) } catch { return json(400, { success: false, message: 'Invalid update.' }) }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['status', 'version'].includes(key)) || !Object.hasOwn(orderStatuses, body.status) || !Number.isSafeInteger(body.version) || body.version < 1) return json(400, { success: false, message: 'Choose a review status and version.' })
    const current = await db.prepare('SELECT status,version FROM store_order_requests WHERE id=? AND committed=1').bind(id).first()
    if (!current) return json(404, { success: false, message: 'Request not found.' })
    if (current.version !== body.version) return json(409, { success: false, message: 'Request changed. Reload before updating.' })
    if (!orderTransitions[current.status].includes(body.status)) return json(422, { success: false, message: 'This review status transition is not allowed.' })
    const updated = await db.prepare('UPDATE store_order_requests SET status=?,updated_at=unixepoch(),version=version+1 WHERE id=? AND committed=1 AND version=? RETURNING id,status,version,updated_at').bind(body.status, id, body.version).first()
    return updated ? json(200, { success: true, record: updated }) : json(409, { success: false, message: 'Request changed. Reload before updating.' })
  } catch { return json(503, { success: false, message: 'Request management is unavailable. No update is confirmed; reload before retrying.' }) }
}
