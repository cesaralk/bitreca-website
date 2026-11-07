import { useEffect, useRef } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import usePublicStore from '../hooks/usePublicStore'
import PublicStoreImage from '../components/PublicStoreImage'
import { storeAvailabilityText, storeBackUrl, storePrice, validStoreSlug } from '../utils/publicStore'
import './Store.css'

export default function StoreProduct() {
  const { slug } = useParams(), location = useLocation(), heading = useRef(null)
  const result = usePublicStore(`/api/store/products/${encodeURIComponent(slug || '')}`, 'product', validStoreSlug(slug))
  const back = storeBackUrl(location.state?.backTo), product = result.status === 'ready' ? result.data : null
  useEffect(() => { if (result.status !== 'loading') { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }) } }, [slug, result.status])
  return <main className="hardware-store-page"><section className="hardware-store-container catalogue-detail" aria-labelledby="store-product-title"><Link className="hardware-store-text-link" to={back} state={{ focusCatalogue: true }}>← Back to catalogue</Link>
    {result.status === 'loading' && <div className="catalogue-state" role="status"><h1 id="store-product-title">Loading product…</h1></div>}
    {result.status === 'error' && <div className="catalogue-state" role="alert"><h1 id="store-product-title" ref={heading} tabIndex={-1}>Product could not be loaded.</h1><p>Please retry. No product information is confirmed in this view.</p><button type="button" onClick={result.retry}>Retry product</button></div>}
    {result.status === 'not-found' && <div className="catalogue-state"><h1 id="store-product-title" ref={heading} tabIndex={-1}>Product not available.</h1><p>This item may no longer be published, or the link may be incorrect.</p><Link className="hardware-store-text-link" to="/store">Browse the catalogue →</Link></div>}
    {product && <><div className="catalogue-detail-grid"><PublicStoreImage key={product.slug} product={product} eager /><div><Link className="hardware-store-text-link" to={`/store?category=${product.category_slug}`}>Browse {product.category_title} →</Link><h1 id="store-product-title" ref={heading} tabIndex={-1}>{product.title}</h1><p className="catalogue-sku">SKU: {product.sku}</p><p className="catalogue-plain-text">{product.description}</p><p className="catalogue-detail-price">{storePrice(product)}</p>{product.price_note && <p className="catalogue-plain-text">{product.price_note}</p>}<p className="catalogue-availability">{storeAvailabilityText(product)}</p><p className="hardware-store-small">Availability is owner-entered and may change. Ask Bitreca to confirm the details. No supply or delivery commitment is made here.</p><div className="catalogue-enquiry"><Link className="hardware-store-button hardware-store-primary" to="/contact" state={{ storeProduct: { slug: product.slug, title: product.title, sku: product.sku } }}>Enquire about this product →</Link><p>Opens an editable enquiry with this product reference. No message is sent automatically.</p></div><p className="catalogue-order-notice">Enquiry only. Checkout and online order acceptance are unavailable. Contacting us does not reserve an item or place an order.</p></div></div><section className="catalogue-specifications" aria-labelledby="store-specifications-title"><p className="hardware-store-eyebrow">OWNER-ENTERED INFORMATION</p><h2 id="store-specifications-title">Specifications</h2><p className="catalogue-plain-text">{product.specifications || 'No specifications have been provided.'}</p></section><Link className="hardware-store-text-link" to={back} state={{ focusCatalogue: true }}>← Back to catalogue</Link></>}
  </section></main>
}
