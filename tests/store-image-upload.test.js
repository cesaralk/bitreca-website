import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareStoreImage, sendStoreImage, checkStoreImage, runStoreImageUpload, storeUploadDeadlines } from '../src/utils/storeImageUpload.js'
import { storeImageLimit, storeUploadKey } from '../shared/store-image-upload.js'

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const file = () => new File([png], 'local-fixture.png', { type: 'image/png' })
const manifest = () => prepareStoreImage(file(), crypto.randomUUID())
const confirmation = image => ({ success: true, image_key: storeUploadKey(image), upload_id: image.id, product_id: image.productId, sha256: image.sha256, type: image.type, size: image.size })
const response = (status, data) => ({ response: { status, ok: status >= 200 && status < 300 }, data })

function transport() {
  let now = 0, next = 0
  const jobs = new Map(), requests = [], xhr = { upload: {}, headers: {}, aborts: 0,
    open(method, path) { this.method = method; this.path = path }, setRequestHeader(name, value) { this.headers[name] = value },
    send(body) { requests.push(body) }, abort() { this.aborts++; this.onabort() },
    complete(status, data) { this.status = status; this.responseText = typeof data === 'string' ? data : JSON.stringify(data); this.onload() },
  }
  const timers = { setTimeout(fn, ms) { const id = ++next; jobs.set(id, { at: now + ms, fn }); return id }, clearTimeout(id) { jobs.delete(id) } }
  function advance(ms) { const end = now + ms; while (true) { const job = [...jobs].sort((a, b) => a[1].at - b[1].at)[0]; if (!job || job[1].at > end) break; now = job[1].at; jobs.delete(job[0]); job[1].fn() } now = end }
  return { xhr, timers, advance, jobs, requests }
}

test('preparation bounds the exact bytes, preserves product ID and computes a stable content digest', async () => {
  const productId = crypto.randomUUID(), image = await prepareStoreImage(file(), productId)
  assert.equal(image.productId, productId); assert.match(image.sha256, /^[a-f0-9]{64}$/); assert.equal(image.file.size, 8)
  for (const invalid of [new File([], 'empty.png', { type: 'image/png' }), new File([png], 'bad.svg', { type: 'image/svg+xml' }), new File([new Uint8Array(storeImageLimit + 1)], 'big.png', { type: 'image/png' })]) await assert.rejects(prepareStoreImage(invalid, productId))
  await assert.rejects(prepareStoreImage(file(), 'invalid-product-reference'))
})

test('upload can connect beyond the old 15s budget, reports transfer versus confirmation, and sends once', async () => {
  const f = transport(), image = await manifest(), notices = [], pending = sendStoreImage(image, value => notices.push(value), () => f.xhr, f.timers)
  f.advance(16000); assert.equal(f.xhr.aborts, 0)
  f.xhr.upload.onprogress({ loaded: 4 }); f.advance(16000); assert.equal(f.xhr.aborts, 0)
  f.xhr.upload.onload(); assert.match(notices.at(-1), /Waiting for storage/)
  f.xhr.complete(201, confirmation(image)); assert.equal((await pending).status, 201)
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0], image.file)
  assert.equal(f.xhr.headers['X-Store-Upload-Id'], image.id); assert.equal(f.xhr.headers['X-Store-Product-Id'], image.productId)
  assert.equal(f.xhr.timeout, storeUploadDeadlines.total); assert.equal(f.jobs.size, 0)
})

test('idle/total/network aborts are uncertain, bounded, and never replay a write', async () => {
  for (const failure of ['idle', 'total', 'network', 'abort']) {
    const f = transport(), image = await manifest(), pending = sendStoreImage(image, undefined, () => f.xhr, f.timers)
    const rejected = assert.rejects(pending)
    if (failure === 'idle') f.advance(storeUploadDeadlines.idle)
    else f.xhr[{ total: 'ontimeout', network: 'onerror', abort: 'onabort' }[failure]]()
    await rejected; assert.equal(f.requests.length, 1); assert.equal(f.jobs.size, 0)
  }
})

test('lost upload acknowledgement recovers through an exact metadata GET with no second write', async () => {
  const image = await manifest(), reads = []; let writes = 0
  const result = await runStoreImageUpload(image, async (path, options) => { reads.push({ path, options }); return response(200, confirmation(image)) }, () => {}, false, async original => { assert.equal(original, image); writes++; throw Error('Synthetic lost response') })
  assert.deepEqual(result, { state: 'verified', imageKey: storeUploadKey(image) }); assert.equal(writes, 1)
  assert.equal(reads.length, 1); assert(!reads[0].options.method || reads[0].options.method === 'GET'); assert.equal(reads[0].options.headers['X-Store-Upload-SHA256'], image.sha256)
})

test('no acknowledgement, a successful malformed acknowledgement, or an unreadable check cannot attach an image', async () => {
  const image = await manifest()
  for (const ack of [{ status: 201, data: null }, { status: 503, data: {} }]) {
    let writes = 0
    const missing = await runStoreImageUpload(image, async () => response(404, { status: 'upload_not_found' }), () => {}, false, async () => { writes++; return ack })
    assert.equal(missing.state, 'missing'); assert.equal(writes, 1)
  }
  assert.equal((await checkStoreImage(image, async () => { throw Error('Synthetic check timeout') })).state, 'unconfirmed')
  for (const changes of [{ image_key: 'store-catalogue/' + crypto.randomUUID() + '.png' }, { product_id: crypto.randomUUID() }, { sha256: '0'.repeat(64) }, { size: 9 }, { type: 'image/jpeg' }, { success: false }]) assert.equal((await checkStoreImage(image, async () => response(200, { ...confirmation(image), ...changes }))).state, 'unconfirmed')
})

test('explicit retry checks first; verified/conflicting/unreadable states do not write', async () => {
  const image = await manifest()
  for (const check of [response(200, confirmation(image)), response(409, { message: 'Conflict' }), response(503, {}), response(202, { status: 'upload_unconfirmed' })]) {
    let writes = 0
    await runStoreImageUpload(image, async () => check, () => {}, true, async () => { writes++; throw Error('Unexpected write') })
    assert.equal(writes, 0)
  }
  let reads = 0, writes = 0
  const result = await runStoreImageUpload(image, async () => ++reads === 1 ? response(404, { status: 'upload_not_found' }) : response(200, confirmation(image)), () => {}, true, async retry => { assert.equal(retry, image); writes++; return { status: 200 } })
  assert.equal(result.state, 'verified'); assert.equal(writes, 1); assert.equal(reads, 2)
})

test('authentication failures and definitive rejection never become upload success', async () => {
  const image = await manifest()
  for (const status of [401, 403, 413, 422]) {
    const result = await runStoreImageUpload(image, async () => { throw Error('Unexpected recovery read') }, () => {}, false, async () => ({ status, data: { message: 'Rejected' } }))
    assert.equal(result.state, status === 401 ? 'unauthorized' : 'rejected')
  }
})
