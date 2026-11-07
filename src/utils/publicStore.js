export const validStoreSlug = value => typeof value === 'string' && value.length > 0 && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0)
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
export function readStoreCategory(row) {
  if (!row || Object.keys(row).some(key => !['slug', 'title', 'description'].includes(key)) || !validStoreSlug(row.slug) || !text(row.title, 100, true) || !text(row.description, 2000)) throw Error('Invalid category')
  return row
}
export function readStoreProduct(row, detail = false) {
  const keys = ['slug', 'title', 'sku', 'description', 'category_slug', 'category_title', 'image_url', 'availability', 'availability_checked_at', 'price_minor', 'currency', 'price_note', ...(detail ? ['specifications'] : [])]
  if (!row || Object.keys(row).some(key => !keys.includes(key)) || !validStoreSlug(row.slug) || !validStoreSlug(row.category_slug) || !text(row.title, 150, true) || !text(row.sku, 64, true) || !text(row.category_title, 100, true) || !text(row.description, 5000) || !text(row.price_note, 500) || (detail && !text(row.specifications, 12000)) ||
    (row.image_url !== null && row.image_url !== `/api/store/products/${row.slug}/image`) || !['unknown', 'available', 'unavailable'].includes(row.availability) || (row.availability_checked_at !== null && !date(row.availability_checked_at)) || (row.availability !== 'unknown' && !date(row.availability_checked_at)) ||
    !(row.price_minor === null && row.currency === null || Number.isSafeInteger(row.price_minor) && row.price_minor >= 0 && row.price_minor <= 999999999999 && typeof row.currency === 'string' && /^[A-Z]{3}$/.test(row.currency))) throw Error('Invalid product')
  return row
}
export function storePrice(product) {
  if (product.price_minor === null) return 'Price not listed'
  try {
    if (!Intl.supportedValuesOf('currency').includes(product.currency)) throw Error('Unknown currency')
    const formatter = new Intl.NumberFormat('en', { style: 'currency', currency: product.currency, currencyDisplay: 'code' })
    return formatter.format(product.price_minor / 10 ** formatter.resolvedOptions().maximumFractionDigits)
  } catch { return `${product.price_minor} minor units (${product.currency})` }
}
export const storeAvailabilityText = product => product.availability === 'unknown' ? 'Availability not specified' : `Owner marked ${product.availability} · checked ${product.availability_checked_at}`
export function storeEnquiryFields(state) {
  const product = state?.storeProduct
  if (!product || !validStoreSlug(product.slug) || !text(product.title, 150, true) || !text(product.sku, 64, true) || [...product.title + product.sku].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return {}
  return { service: 'Not sure yet', message: `Store enquiry — not an order\nProduct: ${product.title}\nSKU: ${product.sku}\nProduct link: https://bitreca.com/store/${product.slug}\n\nMy question: ` }
}
export function storeBackUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return '/store'
  try { const url = new URL(value, 'https://bitreca.com'); return url.origin === 'https://bitreca.com' && url.pathname === '/store' && !url.hash && [...url.searchParams.keys()].every(key => ['category', 'cursor'].includes(key)) ? url.pathname + url.search : '/store' } catch { return '/store' }
}
