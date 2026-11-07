export const storeStatuses = ['draft', 'published', 'archived']
export const storeAvailability = ['unknown', 'available', 'unavailable']
export const storeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const storeImageKey = /^store-catalogue\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/
export const emptyCategory = () => ({ title: '', slug: '', description: '', status: 'draft' })
export const emptyProduct = () => ({ title: '', slug: '', sku: '', category_id: '', description: '', specifications: '', image_key: null, source_reference: '', internal_notes: '', availability: 'unknown', availability_checked_at: null, price_minor: null, currency: null, price_note: '', status: 'draft' })

export function validateStoreRecord(kind, input) {
  const errors = {}, data = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: { form: 'Provide a catalogue record.' }, data }
  const defaults = kind === 'categories' ? emptyCategory() : emptyProduct()
  if (Object.keys(input).some(key => !Object.hasOwn(defaults, key))) errors.form = 'Unknown catalogue field.'
  function string(key, maximum, required = false, multiline = false) {
    const value = input[key]
    if (typeof value !== 'string' || value.length > maximum || (required && !value.trim()) ||
      (typeof value === 'string' && [...value].some(char => { const n = char.charCodeAt(0); return n === 127 || (n < 32 && !(multiline && [9, 10, 13].includes(n))) }))) {
      errors[key] = `Enter ${required ? '1' : '0'}–${maximum} characters${multiline ? '' : ' on one line'}.`
    } else data[key] = value.replace(/\r\n?/g, '\n').trim()
  }
  string('title', kind === 'categories' ? 100 : 150, true)
  string('slug', 80, true)
  if (data.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) errors.slug = 'Use lowercase letters, numbers and single hyphens.'
  string('description', kind === 'categories' ? 2000 : 5000, false, true)
  if (!storeStatuses.includes(input.status)) errors.status = 'Choose a valid status.'
  else data.status = input.status
  if (kind === 'products') {
    string('sku', 64, true)
    if (data.sku && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(data.sku)) errors.sku = 'Use letters, numbers, dots, underscores or hyphens.'
    if (data.sku) data.sku = data.sku.toUpperCase()
    if (!storeUuid.test(input.category_id)) errors.category_id = 'Choose a category.'
    else data.category_id = input.category_id
    for (const [key, maximum] of [['specifications', 12000], ['source_reference', 2000], ['internal_notes', 4000], ['price_note', 500]]) string(key, maximum, false, true)
    if (input.image_key !== null && (typeof input.image_key !== 'string' || !storeImageKey.test(input.image_key))) errors.image_key = 'Choose an image uploaded through Store management.'
    else data.image_key = input.image_key
    if (!storeAvailability.includes(input.availability)) errors.availability = 'Choose an availability state.'
    else data.availability = input.availability
    const date = input.availability_checked_at
    if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10))) errors.availability_checked_at = 'Use a real date, no later than today.'
    else data.availability_checked_at = date
    if (input.availability !== 'unknown' && date === null) errors.availability_checked_at = 'Record when availability was checked.'
    if (input.price_minor === null && input.currency === null) { data.price_minor = null; data.currency = null }
    else if (!Number.isSafeInteger(input.price_minor) || input.price_minor < 0 || input.price_minor > 999999999999 || typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) errors.price_minor = 'Supply both a non-negative integer in minor units and an explicit three-letter currency code, or leave both blank.'
    else { data.price_minor = input.price_minor; data.currency = input.currency }
    if (data.status === 'published') {
      if (!data.description) errors.description = 'Published products need an owner-approved description.'
      if (!data.image_key) errors.image_key = 'Published products need an owner-approved Store image.'
      if (data.price_minor !== null && !data.price_note) errors.price_note = 'Describe the approved price/tax context before publishing a price.'
    }
  }
  return { data, errors }
}
