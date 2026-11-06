import { enquiryStatuses } from '../shared/contact-enquiry.js'
import { contactBodyError, contactJson as reply, contactUuid, readContactJson } from './contact-http.js'

const detailColumns = 'id, name, email, service, message, phone, whatsapp_consent, status, created_at, updated_at, version'
const summaryColumns = 'id, name, email, service, status, created_at, updated_at, version'
function decodeCursor(value) {
  if (!value) return null
  if (value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid cursor')
  const cursor = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')))
  if (!Number.isSafeInteger(cursor.createdAt) || cursor.createdAt < 0 || typeof cursor.id !== 'string' || !contactUuid.test(cursor.id)) throw new Error('Invalid cursor')
  return cursor
}
function encodeCursor(row) {
  return btoa(JSON.stringify({ createdAt: row.created_at, id: row.id })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Called only AFTER the existing Worker admin origin/session authorization gate.
export async function handleAdminEnquiries(request, env) {
  const url = new URL(request.url)
  const collection = url.pathname === '/api/admin/enquiries'
  const id = collection ? null : url.pathname.slice('/api/admin/enquiries/'.length)
  if (!collection && !contactUuid.test(id)) return reply(404, { success: false, message: 'Enquiry not found.' })
  try {
    if (collection) {
      if (request.method !== 'GET') return reply(405, { success: false, message: 'Method not allowed.' }, { Allow: 'GET' })
      if ([...url.searchParams.keys()].some(key => !['status', 'cursor'].includes(key)) || [...new Set(url.searchParams.keys())].some(key => url.searchParams.getAll(key).length !== 1)) return reply(400, { success: false, message: 'Invalid inbox filter.' })
      const status = url.searchParams.get('status') || 'all'
      if (status !== 'all' && !Object.hasOwn(enquiryStatuses, status)) return reply(400, { success: false, message: 'Invalid inbox status.' })
      let cursor
      try { cursor = decodeCursor(url.searchParams.get('cursor')) } catch { return reply(400, { success: false, message: 'Invalid inbox cursor.' }) }
      const conditions = [], bindings = []
      if (status !== 'all') { conditions.push('status = ?'); bindings.push(status) }
      if (cursor) { conditions.push('(created_at < ? OR (created_at = ? AND id < ?))'); bindings.push(cursor.createdAt, cursor.createdAt, cursor.id) }
      const result = await env.bitreca_db.prepare(`SELECT ${summaryColumns} FROM contact_enquiries ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT 21`).bind(...bindings).all()
      if (result.success !== true || !Array.isArray(result.results)) throw new Error('Inbox unavailable')
      const enquiries = result.results.slice(0, 20)
      return reply(200, { success: true, enquiries, nextCursor: result.results.length > 20 ? encodeCursor(enquiries.at(-1)) : null })
    }
    if (request.method === 'GET') {
      const enquiry = await env.bitreca_db.prepare(`SELECT ${detailColumns} FROM contact_enquiries WHERE id = ?`).bind(id).first()
      return enquiry ? reply(200, { success: true, enquiry }) : reply(404, { success: false, message: 'Enquiry not found.' })
    }
    if (request.method !== 'PATCH') return reply(405, { success: false, message: 'Method not allowed.' }, { Allow: 'GET, PATCH' })
    let input
    try { input = await readContactJson(request, 512) } catch (status) { return contactBodyError(status) }
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['status', 'version'].includes(key)) || !Object.hasOwn(enquiryStatuses, input.status) || !Number.isSafeInteger(input.version) || input.version < 1) return reply(400, { success: false, message: 'Choose a valid status and message version.' })
    const updated = await env.bitreca_db.prepare(`UPDATE contact_enquiries SET status = ?, updated_at = unixepoch(), version = version + 1 WHERE id = ? AND version = ? RETURNING id, status, updated_at, version`).bind(input.status, id, input.version).first()
    if (updated) return reply(200, { success: true, enquiry: updated })
    const exists = await env.bitreca_db.prepare('SELECT id FROM contact_enquiries WHERE id = ?').bind(id).first()
    return exists ? reply(409, { success: false, message: 'This enquiry changed. Reload its details before updating.' }) : reply(404, { success: false, message: 'Enquiry not found.' })
  } catch { return reply(503, { success: false, message: 'The inbox is unavailable. No update is confirmed; please retry or reload.' }) }
}
