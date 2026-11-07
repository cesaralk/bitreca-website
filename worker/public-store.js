import { storeImageKey } from '../shared/store-catalogue.js'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const validSlug = value => typeof value === 'string' && value.length > 0 && value.length <= 80 && slugPattern.test(value)
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const json = (status, body, extra = {}) => Response.json(body, { status, headers: { ...headers, ...extra } })
const absent = () => json(404, { success: false, message: 'Catalogue item not available.' })
const columns = 'p.slug, p.title, p.sku, p.description, p.image_key, p.availability, p.availability_checked_at, p.price_minor, p.currency, p.price_note, c.slug AS category_slug, c.title AS category_title'
const eligible = "p.status = 'published' AND c.status = 'published'"

// Deliberate allowlist. Never spread database rows or expose admin detail data.
function publicProduct(row, detail = false) {
  return {
    slug: row.slug, title: row.title, sku: row.sku, description: row.description,
    category_slug: row.category_slug, category_title: row.category_title,
    image_url: typeof row.image_key === 'string' && storeImageKey.test(row.image_key) ? `/api/store/products/${encodeURIComponent(row.slug)}/image` : null,
    availability: row.availability, availability_checked_at: row.availability_checked_at,
    price_minor: row.price_minor, currency: row.currency, price_note: row.price_note,
    ...(detail ? { specifications: row.specifications } : {}),
  }
}
function parseCursor(value, kind, category) {
  if (!value) return null
  if (value.length > 300 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('cursor')
  const parsed = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')))
  if (parsed.kind !== kind || parsed.category !== category || !validSlug(parsed.slug)) throw Error('cursor')
  return parsed.slug
}
const encodeCursor = (kind, category, slug) => btoa(JSON.stringify({ kind, category, slug })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function handlePublicStore(request, env) {
  const url = new URL(request.url), path = url.pathname
  if (path !== '/api/store' && !path.startsWith('/api/store/')) return null
  const detail = /^\/api\/store\/products\/([^/]+)(\/image)?$/.exec(path)
  const kind = path === '/api/store/categories' ? 'categories' : path === '/api/store/products' ? 'products' : null
  if (!kind && !detail) return absent()
  const image = Boolean(detail?.[2])
  if (request.method !== 'GET' && !(image && request.method === 'HEAD')) return json(405, { success: false, message: 'Read-only catalogue.' }, { Allow: image ? 'GET, HEAD' : 'GET' })
  if (detail && (!validSlug(detail[1]) || url.search)) return absent()
  try {
    const db = env.bitreca_db
    if (detail) {
      const row = await db.prepare(`SELECT ${image ? 'p.image_key' : columns + ', p.specifications'} FROM store_products p JOIN store_categories c ON c.id = p.category_id WHERE p.slug = ? AND ${eligible}`).bind(detail[1]).first()
      if (!row) return absent()
      if (!image) return json(200, { success: true, product: publicProduct(row, true) })
      if (typeof row.image_key !== 'string' || !storeImageKey.test(row.image_key)) return absent()
      const object = request.method === 'HEAD' ? await env.bitreca_media.head(row.image_key) : await env.bitreca_media.get(row.image_key)
      if (!object) return absent()
      const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[row.image_key.split('.').at(-1)]
      return new Response(request.method === 'HEAD' ? null : object.body, { headers: { ...headers, 'Content-Type': type, 'Content-Security-Policy': "default-src 'none'; sandbox" } })
    }
    const allowed = kind === 'categories' ? ['cursor'] : ['category', 'cursor']
    if ([...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) return json(400, { success: false, message: 'Invalid catalogue filter.' })
    const category = url.searchParams.get('category')
    if (category !== null && !validSlug(category)) return json(400, { success: false, message: 'Invalid category.' })
    let after
    try { after = parseCursor(url.searchParams.get('cursor'), kind, category) } catch { return json(400, { success: false, message: 'Invalid catalogue page.' }) }
    const categoryRow = category ? await db.prepare("SELECT slug, title, description FROM store_categories WHERE slug = ? AND status = 'published'").bind(category).first() : null
    if (category && !categoryRow) return absent()
    const bindings = [], conditions = []
    if (kind === 'categories') conditions.push("status = 'published'")
    else {
      conditions.push(eligible)
      if (category) { conditions.push('c.slug = ?'); bindings.push(category) }
    }
    if (after) { conditions.push(`${kind === 'categories' ? 'slug' : 'p.slug'} > ?`); bindings.push(after) }
    const limit = kind === 'categories' ? 20 : 12
    const result = await db.prepare(kind === 'categories'
      ? `SELECT slug, title, description FROM store_categories WHERE ${conditions.join(' AND ')} ORDER BY slug LIMIT ${limit + 1}`
      : `SELECT ${columns} FROM store_products p JOIN store_categories c ON c.id = p.category_id WHERE ${conditions.join(' AND ')} ORDER BY p.slug LIMIT ${limit + 1}`).bind(...bindings).all()
    if (result.success !== true || !Array.isArray(result.results)) throw Error('query')
    const rows = result.results.slice(0, limit)
    return json(200, { success: true, [kind]: kind === 'categories' ? rows.map(row => ({ slug: row.slug, title: row.title, description: row.description })) : rows.map(row => publicProduct(row)), ...(kind === 'products' ? { category: categoryRow ? { slug: categoryRow.slug, title: categoryRow.title, description: categoryRow.description } : null } : {}), nextCursor: result.results.length > limit ? encodeCursor(kind, category, rows.at(-1).slug) : null })
  } catch {
    return json(503, { success: false, message: 'Catalogue is temporarily unavailable. Please retry.' })
  }
}
