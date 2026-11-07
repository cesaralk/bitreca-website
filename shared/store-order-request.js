import { normalizeContactPhone, validateContact } from './contact-enquiry.js'

export const orderLimits = { lines: 10, perLine: 10, totalQuantity: 50 }
export const orderStatuses = { new: 'New', reviewing: 'Reviewing', awaiting_customer: 'Awaiting customer', closed: 'Closed', archived: 'Archived' }
export const orderTransitions = { new: ['reviewing', 'archived'], reviewing: ['awaiting_customer', 'closed', 'archived'], awaiting_customer: ['reviewing', 'closed', 'archived'], closed: ['reviewing', 'archived'], archived: ['reviewing'] }
export const orderSlug = value => typeof value === 'string' && value.length > 0 && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
export const emptyOrderContact = () => ({ name: '', email: '', phone: '', whatsappConsent: false, note: '', manualReviewAck: false, website: '' })

export function validateOrderRequest(input) {
  const errors = {}, data = {}
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['name', 'email', 'phone', 'whatsappConsent', 'note', 'manualReviewAck', 'website', 'items'].includes(key))) return { errors: { form: 'Invalid request fields. Prices and totals are not accepted from the browser.' }, data }
  const contactErrors = validateContact({ ...input, service: 'Not sure yet', message: 'Store request contact validation only.' })
  for (const key of ['name', 'email', 'phone']) if (contactErrors[key]) errors[key] = contactErrors[key]
  if (typeof input.note !== 'string' || input.note.length > 2000 || [...input.note].some(char => { const n = char.charCodeAt(0); return n === 127 || (n < 32 && ![9, 10, 13].includes(n)) })) errors.note = 'Use up to 2,000 characters without control characters.'
  if (input.manualReviewAck !== true) errors.manualReviewAck = 'Acknowledge that this is a request for manual review, not an accepted order or payment.'
  if (input.website !== '') errors.form = 'Invalid request.'
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > orderLimits.lines || input.items.some(item => !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['slug', 'quantity'].includes(key)) || !orderSlug(item.slug) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > orderLimits.perLine) || new Set(input.items.map(item => item?.slug)).size !== input.items.length || input.items.reduce((sum, item) => sum + item.quantity, 0) > orderLimits.totalQuantity) errors.items = 'Choose 1–10 distinct products, 1–10 units each, up to 50 units total.'
  if (!Object.keys(errors).length) Object.assign(data, { name: input.name.trim(), email: input.email.trim(), phone: normalizeContactPhone(input.phone) || null, whatsapp_consent: input.whatsappConsent === true ? 1 : 0, note: input.note.replace(/\r\n?/g, '\n').trim(), manual_review_ack: 1, items: input.items.map(item => ({ slug: item.slug, quantity: item.quantity })).sort((a, b) => a.slug.localeCompare(b.slug)) })
  return { errors, data }
}

export function orderReplyLinks(record) {
  const emailErrors = validateContact({ name: 'Reply', email: record.email, service: 'Not sure yet', message: 'Reply address validation only.' })
  const phone = record.whatsapp_consent === 1 ? normalizeContactPhone(record.phone) : ''
  const message = `Regarding your Bitreca request ${record.id}. This is a manual follow-up, not automatic order acceptance.`
  return { email: !emailErrors.email ? `mailto:${encodeURIComponent(record.email.trim())}?subject=${encodeURIComponent('Bitreca request ' + record.id)}&body=${encodeURIComponent(message)}` : '', whatsapp: phone ? `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(message)}` : '' }
}
