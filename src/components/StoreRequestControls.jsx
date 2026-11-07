import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStoreRequestConfig, useStoreSelection } from '../hooks/useStoreRequest'

export function StoreRequestLink() {
  const config = useStoreRequestConfig()
  return <div className="store-request-entry"><Link className="hardware-store-text-link" to="/store/request/review">Product request review →</Link><p className="hardware-store-small">{config.enabled ? 'Requests are for manual review, not accepted orders or payments.' : 'Request intake is currently disabled. General product enquiries remain available.'}</p></div>
}

export function StoreRequestAction({ product }) {
  const config = useStoreRequestConfig(), selection = useStoreSelection(), navigate = useNavigate()
  const [quantity, setQuantity] = useState(1), [error, setError] = useState('')
  return <section className="store-request-entry" aria-labelledby="store-request-action-title"><h2 id="store-request-action-title">Request manual review</h2><p>No item is reserved. Availability, final price, delivery and payment must be confirmed by the owner manually.</p>{config.state === 'loading' && <p role="status">Checking request intake…</p>}{config.state === 'error' && <p role="alert">Intake could not be checked. <button type="button" onClick={config.retry}>Retry intake check</button></p>}{!config.enabled && config.state !== 'loading' && <p>Product request intake is currently disabled. You can still use the product enquiry above.</p>}<div className="store-request-actions"><label htmlFor="store-request-add-quantity">Quantity<select id="store-request-add-quantity" value={quantity} disabled={!config.enabled || product.availability === 'unavailable'} onChange={event => setQuantity(Number(event.target.value))}>{Array.from({ length: 10 }, (_, n) => <option key={n + 1}>{n + 1}</option>)}</select></label><button type="button" disabled={!config.enabled || product.availability === 'unavailable'} onClick={() => { try { selection.add(product.slug, quantity); navigate('/store/request/review') } catch (failure) { setError(failure.message) } }}>Add to review selection</button></div>{product.availability === 'unavailable' && <p>Owner marked this item unavailable. Use a general enquiry rather than adding it to a request.</p>}<Link className="hardware-store-text-link" to="/store/request/review">Review selection →</Link><p role="status">{error}</p></section>
}
