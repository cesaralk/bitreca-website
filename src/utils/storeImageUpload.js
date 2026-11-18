import { imageSha256, storeImageLimit, storeImageTypes, storeUploadHeaders, storeUploadKey, validStoreUpload, verifiedStoreUpload } from '../../shared/store-image-upload.js'

export const storeUploadDeadlines = { idle: 30000, total: 90000 }

export async function prepareStoreImage(file, productId) {
  if (!file || !Object.hasOwn(storeImageTypes, file.type) || file.size < 1 || file.size > storeImageLimit) throw Error('Choose a JPEG, PNG or WebP image of 2 MB or smaller.')
  const upload = { id: crypto.randomUUID(), productId, type: file.type, size: file.size, sha256: await imageSha256(await file.arrayBuffer()), file }
  if (!validStoreUpload(upload)) throw Error('The existing product reference is invalid. No upload was sent.')
  return upload
}

// Store only: progress/idle limits are separate from the total connection + send + response budget.
// This API still uses Chrome's network stack; it does not bypass a broken TLS/network path.
export function sendStoreImage(upload, onProgress = () => {}, createXhr = () => new XMLHttpRequest(), timers = globalThis) {
  return new Promise((resolve, reject) => {
    const xhr = createXhr()
    let idle, settled = false
    function finish(error, value) {
      if (settled) return
      settled = true; timers.clearTimeout(idle)
      if (error) reject(error)
      else resolve(value)
    }
    function activity(message) {
      if (settled) return
      onProgress(message)
      timers.clearTimeout(idle)
      idle = timers.setTimeout(() => { finish(Error('Upload stopped making progress; its outcome needs checking.')); xhr.abort() }, storeUploadDeadlines.idle)
    }
    xhr.upload.onprogress = event => activity(`Sending image: ${Math.min(100, Math.floor(event.loaded / upload.size * 100))}%. Storage is not yet confirmed.`)
    xhr.upload.onload = () => activity('Image transfer finished. Waiting for storage confirmation…')
    xhr.onload = () => {
      let data = null
      try { data = JSON.parse(xhr.responseText) } catch { /* Verification GET handles malformed/lost acknowledgements. */ }
      finish(null, { status: xhr.status, data })
    }
    xhr.onerror = () => finish(Error('Upload connection failed; its outcome needs checking.'))
    xhr.onabort = () => finish(Error('Upload was interrupted; its outcome needs checking.'))
    xhr.ontimeout = () => finish(Error('Upload deadline reached; its outcome needs checking.'))
    xhr.open('POST', '/api/admin/store/media')
    xhr.withCredentials = true
    xhr.timeout = storeUploadDeadlines.total
    for (const [name, value] of Object.entries({ 'Content-Type': upload.type, ...storeUploadHeaders(upload) })) xhr.setRequestHeader(name, value)
    activity('Connecting to upload image. Your product and attached image are unchanged…')
    try { xhr.send(upload.file) } catch (error) { finish(error) }
  })
}

export async function checkStoreImage(upload, request) {
  try {
    const result = await request(`/api/admin/store/media/${storeUploadKey(upload).split('/')[1]}?verify=1`, { headers: storeUploadHeaders(upload), signal: AbortSignal.timeout(30000) })
    if (!result || result.response.status === 401) return { state: 'unauthorized' }
    if (result.response.ok && verifiedStoreUpload(result.data, upload)) return { state: 'verified', imageKey: result.data.image_key }
    if (result.response.status === 404 && result.data?.status === 'upload_not_found') return { state: 'missing' }
    if (result.response.status === 409) return { state: 'rejected', message: result.data?.message || 'Upload reference conflicts with an existing image. No image was replaced.' }
  } catch { /* A failed read cannot establish whether a write committed. */ }
  return { state: 'unconfirmed' }
}

// One write at most per invocation. Retry is a separate, explicit user action, always preceded by a read.
export async function runStoreImageUpload(upload, request, onProgress, retry = false, send = sendStoreImage) {
  if (retry) {
    const existing = await checkStoreImage(upload, request)
    if (existing.state !== 'missing') return existing
  }
  let result
  try { result = await send(upload, onProgress) } catch { /* Reconcile using the same reference, never send again automatically. */ }
  if (result?.status === 401) return { state: 'unauthorized' }
  if (result?.status >= 400 && result.status < 500 && result.status !== 408) return { state: 'rejected', message: result.data?.message || 'Image upload was rejected. The existing image is unchanged.' }
  onProgress('Checking the exact stored image before attaching its reference…')
  return checkStoreImage(upload, request)
}
