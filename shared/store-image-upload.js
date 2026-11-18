import { storeUuid } from './store-catalogue.js'

export const storeImageLimit = 2 * 1024 * 1024
export const storeImageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const storeUploadHeaders = upload => ({
  'X-Store-Upload-Id': upload.id,
  'X-Store-Product-Id': upload.productId,
  'X-Store-Upload-SHA256': upload.sha256,
})
export const storeUploadKey = upload => `store-catalogue/${upload.id}.${storeImageTypes[upload.type]}`
export const imageSha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
export const validStoreUpload = upload => upload && storeUuid.test(upload.id) && storeUuid.test(upload.productId) &&
  /^[a-f0-9]{64}$/.test(upload.sha256) && Object.hasOwn(storeImageTypes, upload.type)

export function verifiedStoreUpload(data, upload) {
  return data?.success === true && data.image_key === storeUploadKey(upload) && data.upload_id === upload.id &&
    data.product_id === upload.productId && data.sha256 === upload.sha256 && data.size === upload.size && data.type === upload.type
}
