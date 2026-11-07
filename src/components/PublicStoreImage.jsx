import { useState } from 'react'

export default function PublicStoreImage({ product, eager = false }) {
  const [failed, setFailed] = useState(null)
  const source = product.image_url === `/api/store/products/${product.slug}/image` ? product.image_url : null
  return <div className="catalogue-image">{source && failed !== source ? <img src={source} alt={`${product.title} product image`} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(source)} /> : <div className="catalogue-image-fallback"><span aria-hidden="true">◇</span><p>{source ? 'Image unavailable' : 'No image provided'}</p></div>}</div>
}
