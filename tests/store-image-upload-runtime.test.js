import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { emptyCategory, emptyProduct } from '../shared/store-catalogue.js'
import { imageSha256, storeImageLimit, storeUploadHeaders, storeUploadKey } from '../shared/store-image-upload.js'
import { prepareStoreImage, runStoreImageUpload } from '../src/utils/storeImageUpload.js'
import { handleAdminStore } from '../worker/admin-store.js'

const origin = 'https://store.test', png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
function statements(name) { return readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8').replace(/--[^\n]*/g, '').match(/CREATE TRIGGER[\s\S]*?END;|(?:CREATE|DROP|ALTER|INSERT|PRAGMA)[\s\S]*?;/g) }

test('actual workerd authenticated recoverable uploads, conditional R2 writes and unchanged product lifecycle', async t => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../worker/index.js', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'esm' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-23', d1Databases: ['bitreca_db'], r2Buckets: ['bitreca_media'], bindings: { ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-only', SESSION_SECRET: 'synthetic-session', ADMIN_AUTH_VERSION: '1' } }))
  t.after(() => mf.dispose())
  const db = await mf.getD1Database('bitreca_db'), bucket = await mf.getR2Bucket('bitreca_media')
  for (const name of ['0004_create_admin_sessions.sql', '0019_add_store_catalogue.sql', '0020_add_store_order_requests.sql', '0021_store_product_permanent_deletion.sql']) await db.batch(statements(name).map(sql => db.prepare(sql)))
  async function call(path, { method = 'GET', cookie, data, raw, headers = {} } = {}) {
    return mf.dispatchFetch(origin + path, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(!['GET', 'HEAD'].includes(method) ? { body: raw ?? JSON.stringify(data), ...(raw instanceof ReadableStream ? { duplex: 'half' } : {}) } : {}) })
  }
  const login = await call('/api/admin/login', { method: 'POST', data: { username: 'synthetic-owner', password: 'synthetic-only' } })
  const cookie = login.headers.get('Set-Cookie').split(';')[0]
  const categoryId = crypto.randomUUID(), productId = crypto.randomUUID(), category = { ...emptyCategory(), title: 'Isolated image category', slug: 'image-fixture', status: 'published' }, draft = { ...emptyProduct(), title: 'Isolated product', sku: 'IMAGE-FIXTURE', slug: 'image-fixture', category_id: categoryId, description: 'Local fixture only.' }
  const record = (kind, id, data, version) => call('/api/admin/store/' + kind + (version ? '/' + id : ''), { method: version ? 'PUT' : 'POST', cookie, data: { id, data, ...(version ? { version } : {}) }, headers: { 'Content-Type': 'application/json' } })
  assert.equal((await record('categories', categoryId, category)).status, 201)
  assert.equal((await record('products', productId, draft)).status, 201)
  const originalRows = (await db.prepare('SELECT * FROM store_products').all()).results
  await db.batch(statements('0023_store_image_upload_receipts.sql').map(sql => db.prepare(sql)))
  assert.deepEqual((await db.prepare('SELECT * FROM store_products').all()).results, originalRows)
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM store_image_upload_receipts').first()).n, 0)
  const image = await prepareStoreImage(new File([png], 'local-only.png', { type: 'image/png' }), productId)
  const upload = (manifest = image, bytes = png, extra = {}) => call('/api/admin/store/media', { method: 'POST', cookie, raw: bytes, headers: { 'Content-Type': manifest.type, ...storeUploadHeaders(manifest), ...extra } })
  const verify = manifest => call('/api/admin/store/media/' + storeUploadKey(manifest).split('/')[1] + '?verify=1', { cookie, headers: storeUploadHeaders(manifest) })

  await t.test('origin/session checks protect both upload and verification; missing is not false success', async () => {
    assert.equal((await call('/api/admin/store/media', { method: 'POST', raw: png, headers: { 'Content-Type': image.type, ...storeUploadHeaders(image) } })).status, 401)
    assert.equal((await call('/api/admin/store/media/' + storeUploadKey(image).split('/')[1] + '?verify=1', { headers: storeUploadHeaders(image) })).status, 401)
    assert.equal((await upload(image, png, { Origin: 'https://evil.test' })).status, 403)
    assert.equal((await verify(image)).status, 404)
  })
  await t.test('content/type/size/reference limits and real server-computed checksum reject invalid uploads', async () => {
    assert.equal((await upload({ ...image, id: 'bad' })).status, 400)
    assert.equal((await upload(image, new Uint8Array([1, 2]))).status, 400)
    assert.equal((await upload({ ...image, type: 'image/svg+xml' })).status, 400)
    assert.equal((await upload({ ...image, sha256: '0'.repeat(64) })).status, 422)
    assert.equal((await upload(image, new Uint8Array(storeImageLimit + 1))).status, 413)
    assert.equal((await bucket.list({ prefix: 'store-catalogue/' })).objects.length, 0)
  })
  await t.test('one upload and private read are verified without changing Draft data, ID or image reference', async () => {
    const before = await db.prepare('SELECT * FROM store_products WHERE id=?').bind(productId).first()
    assert.equal((await upload()).status, 201)
    const checked = await verify(image); assert.equal(checked.status, 200); assert.equal((await checked.json()).sha256, image.sha256)
    assert.equal(checked.headers.get('Cache-Control'), 'private, no-store')
    const object = await bucket.get(storeUploadKey(image)); assert.deepEqual(new Uint8Array(await object.arrayBuffer()), png)
    assert.deepEqual(await db.prepare('SELECT * FROM store_products WHERE id=?').bind(productId).first(), before)
    assert.equal((await call('/api/admin/store/media/' + storeUploadKey(image).split('/')[1])).status, 401)
    assert.equal((await call('/api/media/' + storeUploadKey(image))).status, 404)
  })
  await t.test('explicit retries and concurrent requests reuse one object; conflicts cannot overwrite it', async () => {
    const before = await bucket.head(storeUploadKey(image))
    assert.equal((await upload()).status, 200)
    assert.equal((await bucket.head(storeUploadKey(image))).version, before.version)
    assert.equal((await upload({ ...image, productId: crypto.randomUUID() })).status, 409)
    const different = new Uint8Array([...png, 1]), changed = { ...image, sha256: await imageSha256(different) }
    assert.equal((await upload(changed, different)).status, 409)
    assert.equal((await bucket.head(storeUploadKey(image))).version, before.version)
    const concurrent = { ...image, id: crypto.randomUUID() }, results = await Promise.all([upload(concurrent), upload(concurrent)])
    assert.equal(results.filter(r => r.status === 201).length, 1)
    assert(results.every(r => [200, 201, 202].includes(r.status)))
    assert.equal((await verify(concurrent)).status, 200)
    assert.equal((await bucket.list({ prefix: 'store-catalogue/' })).objects.length, 2)
  })
  await t.test('a durable claim prevents a delayed replay from recreating an absent or deleted image', async () => {
    const once = { ...image, id: crypto.randomUUID() }, key = storeUploadKey(once)
    assert.equal((await upload(once)).status, 201)
    await bucket.delete(key) // Isolated fixture only; no production/deletion workflow invocation.
    assert.equal((await upload(once)).status, 202)
    assert.equal(await bucket.head(key), null)
    assert.equal((await verify(once)).status, 202)
    const other = new Uint8Array([...png, 2])
    assert.equal((await upload({ ...once, sha256: await imageSha256(other) }, other)).status, 409)
    assert.equal(await bucket.head(key), null)
  })
  await t.test('lost transport acknowledgement recovers from real R2 metadata without resending', async () => {
    const original = { ...image, id: crypto.randomUUID() }; let writes = 0
    const request = async (path, options) => { const response = await call(path, { cookie, headers: options.headers }); return { response, data: await response.json() } }
    const result = await runStoreImageUpload(original, request, () => {}, false, async () => { writes++; assert.equal((await upload(original)).status, 201); throw Error('Synthetic lost response after commit') })
    assert.equal(result.state, 'verified'); assert.equal(result.imageKey, storeUploadKey(original)); assert.equal(writes, 1)
  })
  await t.test('a bounded streamed upload can transfer for longer than the original 5s body window', async () => {
    const streamed = { ...image, id: crypto.randomUUID() }
    const body = new ReadableStream({ start(controller) { controller.enqueue(png.slice(0, 4)); setTimeout(() => { controller.enqueue(png.slice(4)); controller.close() }, 5500) } })
    assert.equal((await upload(streamed, body)).status, 201)
    assert.equal((await verify(streamed)).status, 200)
  })
  await t.test('existing/shared legacy objects and deletion fences stay protected', async () => {
    const legacy = { ...image, id: crypto.randomUUID() }, key = storeUploadKey(legacy)
    await bucket.put(key, png, { httpMetadata: { contentType: 'image/png' } })
    const version = (await bucket.head(key)).version
    assert.equal((await upload(legacy)).status, 409); assert.equal((await bucket.head(key)).version, version)
    const retired = { ...image, id: crypto.randomUUID(), productId: crypto.randomUUID() }
    await db.prepare("INSERT INTO store_product_deletions(id,title,sku,version,state) VALUES(?,'Isolated tombstone','QA',1,'no_image')").bind(retired.productId).run()
    assert.equal((await upload(retired)).status, 409); assert.equal(await bucket.head(storeUploadKey(retired)), null)
    await db.prepare("INSERT INTO store_product_deletions(id,title,sku,version,image_key,state) VALUES(?,'Isolated tombstone','QA-2',1,?,'pending')").bind(crypto.randomUUID(), key).run()
    assert.equal((await upload(legacy)).status, 409); assert.equal((await bucket.head(key)).version, version)
  })
  await t.test('same product Draft save/reload, publication and public image use exact verified bytes', async () => {
    const attached = { ...draft, image_key: storeUploadKey(image) }
    assert.equal((await record('products', productId, attached, 1)).status, 200)
    const saved = await (await call('/api/admin/store/products/' + productId, { cookie })).json()
    assert.equal(saved.record.id, productId); assert.equal(saved.record.image_key, attached.image_key); assert.equal(saved.record.status, 'draft')
    assert.equal((await record('products', productId, { ...attached, status: 'published' }, 2)).status, 200)
    const publicDetail = await (await call('/api/store/products/image-fixture')).json()
    const publicImage = await call(publicDetail.product.image_url)
    assert.equal(publicImage.status, 200); assert.deepEqual(new Uint8Array(await publicImage.arrayBuffer()), png)
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM store_products').first()).n, 1)
  })
})

test('R2 write acknowledgement loss and metadata read failure remain fail-safe without leaking exceptions', async () => {
  // Handler fault injection only; the actual authentication/origin gate is exercised above.
  const image = await prepareStoreImage(new File([png], 'local-only.png', { type: 'image/png' }), crypto.randomUUID())
  let object = null, writes = 0, failRead = false
  const claims = new Map()
  const env = { bitreca_db: { prepare: sql => ({ bind: (...args) => ({ first: async () => {
    if (sql.startsWith('INSERT INTO store_image_upload_receipts')) {
      if (claims.has(args[0])) return null
      claims.set(args[0], { upload_id: args[0], product_id: args[1], image_key: args[2], sha256: args[3], content_type: args[4], size: args[5] })
      return { upload_id: args[0] }
    }
    return sql.includes('FROM store_image_upload_receipts') ? claims.get(args[0]) || null : null
  } }) }) }, bitreca_media: {
    head: async () => { if (failRead) throw Error('synthetic private exception'); return object },
    put: async (key, bytes, options) => { writes++; object = { key, size: bytes.length, httpMetadata: options.httpMetadata, customMetadata: options.customMetadata, checksums: { sha256: Uint8Array.from(image.sha256.match(/../g), hex => parseInt(hex, 16)).buffer } }; throw Error('synthetic private exception after commit') },
  } }
  const response = await handleAdminStore(new Request(origin + '/api/admin/store/media', { method: 'POST', headers: { 'Content-Type': image.type, ...storeUploadHeaders(image) }, body: png }), env)
  assert.equal(response.status, 503); assert(!JSON.stringify(await response.json()).includes('synthetic private'))
  const check = () => handleAdminStore(new Request(origin + '/api/admin/store/media/' + storeUploadKey(image).split('/')[1] + '?verify=1', { headers: storeUploadHeaders(image) }), env)
  const recovered = await check(); assert.equal(recovered.status, 200); assert.equal((await recovered.json()).image_key, storeUploadKey(image)); assert.equal(writes, 1)
  failRead = true
  const unavailable = await check(); assert.equal(unavailable.status, 503); assert(!JSON.stringify(await unavailable.json()).includes('synthetic private')); assert.equal(writes, 1)
})
