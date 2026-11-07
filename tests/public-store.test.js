import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import worker from '../worker/index.js'
import { contactDatabase } from './helpers/contact-d1.js'
import { readStoreCategory, readStoreProduct, storeAvailabilityText, storeBackUrl, storeEnquiryFields, storePrice } from '../src/utils/publicStore.js'

const fields = ['slug', 'title', 'sku', 'description', 'category_slug', 'category_title', 'image_url', 'availability', 'availability_checked_at', 'price_minor', 'currency', 'price_note']
function fixture(t) {
  const f = contactDatabase(); t.after(() => f.close())
  f.sqlite.exec(readFileSync(new URL('../migrations/0019_add_store_catalogue.sql', import.meta.url), 'utf8'))
  // Isolated fixtures deliberately permit inconsistent states to prove the public
  // JOIN fails closed even if historical/manual data bypassed lifecycle guards.
  f.sqlite.exec('DROP TRIGGER store_product_category_insert; DROP TRIGGER store_product_category_update; DROP TRIGGER store_category_state_update;')
  const objects = new Map(), calls = []
  const env = { bitreca_db: f.db, bitreca_media: { get: async key => { calls.push(key); return objects.has(key) ? { body: objects.get(key) } : null }, head: async key => { calls.push(key); return objects.has(key) ? {} : null } } }
  const call = (path, method = 'GET', headers = {}) => worker.fetch(new Request('https://bitreca.test' + path, { method, headers }), env)
  function category(slug, status = 'published') { const id = crypto.randomUUID(); f.sqlite.prepare('INSERT INTO store_categories(id,creation_hash,title,slug,description,status) VALUES(?,?,?,?,?,?)').run(id, 'a'.repeat(64), 'Synthetic ' + slug, slug, '<script>literal category</script>', status); return id }
  function product(slug, categoryId, status = 'published', changes = {}) {
    const row = { id: crypto.randomUUID(), creation_hash: 'b'.repeat(64), category_id: categoryId, slug, sku: slug.toUpperCase(), title: 'Synthetic <img src=x> ' + slug, description: '<script>literal description</script>', specifications: '<b>literal specifications</b>', image_key: `store-catalogue/${crypto.randomUUID()}.png`, source_reference: 'PRIVATE-SUPPLIER-SENTINEL', internal_notes: 'PRIVATE-NOTES-SENTINEL', availability: 'unknown', availability_checked_at: null, price_minor: null, currency: null, price_note: '', status, ...changes }
    const keys = Object.keys(row)
    f.sqlite.prepare(`INSERT INTO store_products(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(row))
    objects.set(row.image_key, Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))
    return row
  }
  return { ...f, env, objects, calls, call, category, product }
}
const body = async response => { assert.equal(response.status, 200); return response.json() }

test('empty public catalogue is read-only/no-store and strict filters cannot request private fields', async t => {
  const f = fixture(t)
  const categories = await f.call('/api/store/categories'), products = await f.call('/api/store/products')
  assert.equal(categories.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual((await body(categories)).categories, []); assert.deepEqual((await body(products)).products, [])
  for (const query of ['status=draft', 'include=internal_notes', 'category=a&category=b', 'category=../admin', 'cursor=bad', 'limit=9999']) assert.equal((await f.call('/api/store/products?' + query)).status, 400)
  assert.equal((await f.call('/api/store/categories?status=archived')).status, 400)
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await f.call('/api/store/products', method)).status, 405)
  assert.equal((await f.call('/api/store/private')).status, 404)
})

test('published product AND eligible published category required for list/detail/media; field allowlist exact', async t => {
  const f = fixture(t), visible = []
  for (const categoryStatus of ['draft', 'published', 'archived']) {
    const c = f.category('category-' + categoryStatus, categoryStatus)
    for (const productStatus of ['draft', 'published', 'archived']) {
      const slug = `${categoryStatus}-${productStatus}`, p = f.product(slug, c, productStatus)
      const eligible = categoryStatus === 'published' && productStatus === 'published'
      const detail = await f.call('/api/store/products/' + slug)
      assert.equal(detail.status, eligible ? 200 : 404)
      const before = f.calls.length
      for (const method of ['GET', 'HEAD']) assert.equal((await f.call('/api/store/products/' + slug + '/image', method)).status, eligible ? 200 : 404)
      if (!eligible) assert.equal(f.calls.length, before, 'private media must not read R2')
      else {
        const data = (await detail.json()).product
        assert.deepEqual(Object.keys(data).sort(), [...fields, 'specifications'].sort())
        assert.equal(data.image_url, '/api/store/products/' + slug + '/image')
        assert(!JSON.stringify(data).includes('PRIVATE-')); assert(!JSON.stringify(data).includes(p.id)); assert(!JSON.stringify(data).includes(p.image_key))
        assert.equal(readStoreProduct(data, true).description, '<script>literal description</script>')
        visible.push(slug)
      }
    }
  }
  const list = (await body(await f.call('/api/store/products'))).products
  assert.deepEqual(list.map(row => row.slug), visible)
  assert.deepEqual(Object.keys(list[0]).sort(), fields.sort())
  const categories = (await body(await f.call('/api/store/categories'))).categories
  assert.deepEqual(categories.map(row => row.slug), ['category-published'])
  assert.deepEqual(Object.keys(categories[0]).sort(), ['description', 'slug', 'title'])
  assert.equal((await f.call('/api/store/products?category=category-draft')).status, 404)
  assert.equal((await f.call('/api/store/products?category=category-archived')).status, 404)
})

test('unpublish/archive/category withdrawal and image detachment immediately revoke direct media with no cache escape', async t => {
  const f = fixture(t), c = f.category('visible'), p = f.product('visible', c), path = '/api/store/products/visible'
  assert.equal((await f.call(path + '/image')).status, 200)
  f.sqlite.prepare("UPDATE store_products SET status='draft' WHERE id=?").run(p.id)
  for (const suffix of ['', '/image']) assert.equal((await f.call(path + suffix, 'GET', { 'If-None-Match': 'old', Range: 'bytes=0-10' })).status, 404)
  f.sqlite.prepare("UPDATE store_products SET status='published' WHERE id=?").run(p.id)
  f.sqlite.prepare("UPDATE store_categories SET status='archived' WHERE id=?").run(c)
  assert.equal((await f.call(path + '/image')).status, 404)
  f.sqlite.prepare("UPDATE store_categories SET status='published' WHERE id=?").run(c)
  f.sqlite.prepare('UPDATE store_products SET image_key=NULL WHERE id=?').run(p.id)
  assert.equal((await body(await f.call(path))).product.image_url, null)
  assert.equal((await f.call(path + '/image')).status, 404)
})

test('bounded product/category pagination, filter-bound cursors and empty eligible category', async t => {
  const f = fixture(t), c = f.category('main')
  for (let n = 0; n < 26; n++) { f.product('item-' + String(n).padStart(2, '0'), c); f.category('extra-' + String(n).padStart(2, '0')) }
  const seen = [], pages = []; let cursor = null
  do { const data = await body(await f.call('/api/store/products?category=main' + (cursor ? '&cursor=' + cursor : ''))); pages.push(data.products.length); seen.push(...data.products.map(row => row.slug)); cursor = data.nextCursor; if (cursor) assert.equal((await f.call('/api/store/products?cursor=' + cursor)).status, 400) } while (cursor)
  assert.deepEqual(pages, [12, 12, 2]); assert.equal(new Set(seen).size, 26)
  const first = await body(await f.call('/api/store/categories')); assert.equal(first.categories.length, 20)
  assert.equal((await body(await f.call('/api/store/categories?cursor=' + first.nextCursor))).categories.length, 7)
  const empty = await body(await f.call('/api/store/products?category=extra-00')); assert.deepEqual(empty.products, []); assert.equal(empty.category.title, 'Synthetic extra-00')
})

test('media paths/traversal/missing R2 and SQL failures fail safely; source and internal keys never leak', async t => {
  const f = fixture(t), c = f.category('main'), p = f.product('fixture', c)
  for (const path of ['/api/store/products/../private/image', '/api/store/products/fixture%2Fimage', '/api/store/products/fixture/image?key=' + p.image_key, '/api/store/media/' + p.image_key, '/api/media/' + p.image_key]) assert([400, 404].includes((await f.call(path)).status))
  f.objects.clear(); assert.equal((await f.call('/api/store/products/fixture/image')).status, 404)
  f.state.failure = ({ sql }) => { if (sql.includes('store_products')) throw Error('PRIVATE-SQL-SENTINEL') }
  const failed = await f.call('/api/store/products'); assert.equal(failed.status, 503); assert(!JSON.stringify(await failed.json()).includes('PRIVATE-'))
})

test('client guards, safe fallbacks, prices/dated availability and product-specific enquiry prepare no submission', () => {
  const row = { slug: 'fixture', title: '<script>literal</script>', sku: 'QA-ONLY', description: '', category_slug: 'main', category_title: 'Synthetic', image_url: null, availability: 'unknown', availability_checked_at: null, price_minor: null, currency: null, price_note: '' }
  assert.equal(storePrice(readStoreProduct(row)), 'Price not listed')
  assert.equal(storePrice({ ...row, price_minor: 1234, currency: 'USD' }), 'USD 12.34')
  assert(storePrice({ ...row, price_minor: 100, currency: 'ZZZ' }).includes('100 minor units'))
  assert.equal(storeAvailabilityText(row), 'Availability not specified')
  assert(storeAvailabilityText({ ...row, availability: 'available', availability_checked_at: '2026-01-01' }).includes('Owner marked available · checked 2026-01-01'))
  for (const changes of [{ internal_notes: 'private' }, { image_url: 'javascript:alert(1)' }, { image_url: '/api/store/products/other/image' }, { availability: 'in stock' }, { price_minor: 99, currency: null }]) assert.throws(() => readStoreProduct({ ...row, ...changes }))
  assert.throws(() => readStoreCategory({ slug: 'main', title: 'Main', description: '', source_reference: 'private' }))
  const fields = storeEnquiryFields({ storeProduct: row }); assert.deepEqual(Object.keys(fields).sort(), ['message', 'service']); assert.equal(fields.service, 'Not sure yet'); assert(fields.message.includes('SKU: QA-ONLY')); assert(fields.message.includes('https://bitreca.com/store/fixture')); assert(fields.message.includes('not an order'))
  assert.deepEqual(storeEnquiryFields({ storeProduct: { ...row, title: 'header\nattack' } }), {})
  assert.equal(storeBackUrl('https://evil.test/redirect'), '/store'); assert.equal(storeBackUrl('/store?category=main'), '/store?category=main')
})
