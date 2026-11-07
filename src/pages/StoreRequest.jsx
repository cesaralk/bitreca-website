import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ContactTurnstile from '../components/ContactTurnstile'
import PublicStoreImage from '../components/PublicStoreImage'
import { useStoreRequestConfig, useStoreSelection } from '../hooks/useStoreRequest'
import { readStoreProduct, storePrice } from '../utils/publicStore'
import { emptyOrderContact, orderLimits, validateOrderRequest } from '../../shared/store-order-request'
import './Store.css'
import './StoreRequest.css'

export default function StoreRequest() {
  const config = useStoreRequestConfig(), selection = useStoreSelection()
  const [fields, setFields] = useState(emptyOrderContact), [errors, setErrors] = useState({}), [status, setStatus] = useState({ kind: 'idle', text: '' })
  const [token, setToken] = useState(''), [resetKey, setResetKey] = useState(0), [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState({ key: '', state: 'loading', products: [] })
  const slugs = selection.items.map(item => item.slug).sort().join(','), key = `${slugs}:${revision}`
  const data = loaded.key === key ? loaded : { state: 'loading', products: [] }
  const mutex = useRef(false), receipt = useRef(null), form = useRef(null), savedHeading = useRef(null)
  const busy = status.kind === 'sending', stored = status.kind === 'stored'
  useEffect(() => {
    if (!slugs) return
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000)
    let active = true
    async function load() {
      try {
        const products = await Promise.all(slugs.split(',').map(async slug => {
          const response = await fetch(`/api/store/products/${slug}`, { cache: 'no-store', signal: controller.signal })
          if (response.status === 404) return { slug, unavailable: true }
          const body = response.ok && response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null
          if (body?.success !== true) throw Error('request')
          const product = readStoreProduct(body.product, true)
          if (product.slug !== slug) throw Error('mismatch')
          return product
        }))
        if (active) setLoaded({ key, state: 'ready', products })
      } catch { if (active) setLoaded({ key, state: 'error', products: [] }) }
      finally { clearTimeout(timer) }
    }
    load(); return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [slugs, key])
  useEffect(() => { if (stored) savedHeading.current?.focus() }, [stored])
  function edit(event) { const { name, type, checked, value } = event.target; setFields(current => ({ ...current, [name]: type === 'checkbox' ? checked : value })); setErrors(current => ({ ...current, [name]: undefined })); setStatus({ kind: 'idle', text: '' }) }
  function selectionChange(action) { try { action(); setStatus({ kind: 'idle', text: '' }); setErrors({}) } catch (error) { setStatus({ kind: 'error', text: error.message }) } }
  async function submit(event) {
    event.preventDefault()
    if (mutex.current || stored) return
    if (!config.enabled) { setStatus({ kind: 'error', text: 'Request intake is disabled. Nothing was submitted.' }); return }
    const input = { ...fields, items: selection.items }, validation = validateOrderRequest(input)
    setErrors(validation.errors)
    if (Object.keys(validation.errors).length) { setStatus({ kind: 'error', text: 'Check the highlighted fields and selection.' }); requestAnimationFrame(() => form.current?.querySelector('[aria-invalid="true"]')?.focus()); return }
    if (!token) { setStatus({ kind: 'error', text: 'Complete the security check before submitting.' }); return }
    mutex.current = true; setStatus({ kind: 'sending', text: 'Saving your request for manual review…' })
    try {
      const fingerprint = JSON.stringify(validation.data)
      if (receipt.current?.fingerprint !== fingerprint) receipt.current = { fingerprint, id: crypto.randomUUID() }
      const response = await fetch('/api/store/order-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, requestId: receipt.current.id, turnstileToken: token }), signal: AbortSignal.timeout(25000) })
      const result = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null
      if ([200, 201].includes(response.status) && result?.status === 'stored_for_review' && typeof result.reference === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.reference)) {
        setStatus({ kind: 'stored', reference: result.reference, text: 'Request saved for manual review. This is not an accepted order, a reservation, a quote or a payment. The owner must confirm availability, final price, delivery and payment manually. No customer message was sent automatically.' })
        try { selection.clear() } catch { /* The confirmed receipt must remain successful even if browser storage becomes unavailable. */ }
      } else {
        if (response.status === 422 && result?.errors) setErrors(Object.fromEntries(Object.entries(result.errors).filter(([name, value]) => ['name', 'email', 'phone', 'note', 'manualReviewAck', 'items', 'form'].includes(name) && typeof value === 'string')))
        const text = result?.status === 'intake_disabled' ? 'Request intake is disabled. No request was submitted. Use Contact instead.' : result?.status === 'catalogue_changed' ? 'Some selected products changed or are no longer eligible. Refresh the selection before retrying.' : result?.status === 'invalid_challenge' ? 'Security verification was not valid. Complete a fresh check and retry.' : response.status === 429 ? 'Too many attempts. Wait before retrying, or contact Bitreca directly.' : result?.status === 'request_conflict' ? 'This reference was used with different details. Reload the page to start a new request, or ask Bitreca to check your reference.' : 'We could not confirm whether the request was saved. Your entries remain. Retry unchanged with a fresh security check; a timed-out request may already have been saved.'
        setStatus({ kind: 'error', text })
      }
    } catch { setStatus({ kind: 'error', text: 'We could not confirm whether the request was saved. Keep your entries unchanged and retry with a fresh security check, or contact Bitreca. A timed-out request may have been saved.' }) }
    finally { mutex.current = false; setToken(''); setResetKey(n => n + 1) }
  }
  const badSelection = data.products.some(product => product.unavailable || product.availability === 'unavailable')
  return <main className="hardware-store-page"><section className="hardware-store-container request-page" aria-labelledby="store-request-title"><Link className="hardware-store-text-link" to="/store">← Back to catalogue</Link><p className="hardware-store-eyebrow">PRODUCT REQUEST / MANUAL REVIEW</p><h1 id="store-request-title">Review your selection.<br /><span>Request a conversation.</span></h1><p className="request-intro">Select products and quantities for the owner to review. Submission is not an accepted order or payment. No stock is reserved, no total is quoted, and delivery and payment arrangements are not set here.</p>
    {config.state === 'loading' && <p role="status">Checking request intake…</p>}{config.state === 'error' && <div role="alert"><p>Request intake could not be checked. Submission is unavailable.</p><button type="button" onClick={config.retry}>Retry intake check</button></div>}{config.state === 'ready' && !config.enabled && <div className="request-disabled" role="status"><h2>Product request intake is disabled.</h2><p>Nothing can be submitted through this page right now. You can still browse the catalogue and contact Bitreca with a general enquiry.</p><Link className="hardware-store-text-link" to="/contact">Contact Bitreca →</Link></div>}
    {stored ? <section className="request-receipt" aria-labelledby="request-saved-title"><h2 id="request-saved-title" ref={savedHeading} tabIndex={-1}>Saved for manual review</h2><p>{status.text}</p><p>Reference: <strong>{status.reference}</strong></p><p>Keep this reference for a manual follow-up. No automatic confirmation message is sent.</p></section> : <>
      <section className="request-selection" aria-labelledby="request-selection-title"><div className="request-toolbar"><h2 id="request-selection-title">Selected products</h2><button type="button" disabled={busy || !selection.items.length} onClick={() => { setRevision(n => n + 1); setStatus({ kind: 'idle', text: '' }) }}>Refresh product information</button></div><p className="hardware-store-small">Up to {orderLimits.lines} distinct products, {orderLimits.perLine} units per product, {orderLimits.totalQuantity} units total. Only slugs and quantities are kept in this browser session; contact details are not stored there.</p>{!selection.items.length ? <p>No products selected. <Link className="hardware-store-text-link" to="/store">Browse the catalogue →</Link></p> : data.state === 'loading' ? <p role="status">Loading selected product information…</p> : data.state === 'error' ? <div role="alert"><p>Selected products could not be checked.</p><button type="button" onClick={() => setRevision(n => n + 1)}>Retry selection</button></div> : <ul className="request-items">{data.products.map(product => <li key={product.slug}><div>{!product.unavailable && <PublicStoreImage product={product} />}</div><div><h3>{product.unavailable ? `Product no longer published: ${product.slug}` : product.title}</h3>{!product.unavailable && <><p>SKU: {product.sku}</p><p>Listed unit price, reference only: {storePrice(product)}</p>{product.price_note && <p>{product.price_note}</p>}<Link className="hardware-store-text-link" to={`/store/${product.slug}`}>View current product →</Link></>}{(product.unavailable || product.availability === 'unavailable') && <p className="request-error">Remove this unavailable item before submitting.</p>}<div className="store-request-actions"><label htmlFor={`request-quantity-${product.slug}`}>Quantity<select id={`request-quantity-${product.slug}`} disabled={busy} value={selection.items.find(item => item.slug === product.slug)?.quantity || 1} onChange={event => selectionChange(() => selection.quantity(product.slug, Number(event.target.value)))}>{Array.from({ length: 10 }, (_, n) => <option key={n + 1}>{n + 1}</option>)}</select></label><button type="button" disabled={busy} onClick={() => selectionChange(() => selection.remove(product.slug))}>Remove <span className="hardware-store-sr-only">{product.slug}</span></button></div></div></li>)}</ul>}{errors.items && <p className="request-error" role="alert">{errors.items}</p>}</section>
      {config.enabled && selection.items.length > 0 && <form className="request-form" ref={form} onSubmit={submit} noValidate aria-labelledby="request-contact-title"><h2 id="request-contact-title">Contact details for manual review</h2><fieldset disabled={busy}><legend className="hardware-store-sr-only">Customer contact and acknowledgement</legend>{[['name', 'Name', 'text', 100], ['email', 'Email', 'email', 254], ['phone', 'Optional international WhatsApp number', 'tel', 40]].map(([name, label, type, max]) => <div className="request-field" key={name}><label htmlFor={`request-${name}`}>{label}{name !== 'phone' ? ' (required)' : ''}</label><input id={`request-${name}`} name={name} type={type} autoComplete={name === 'name' ? 'name' : name === 'email' ? 'email' : 'tel'} value={fields[name]} maxLength={max} required={name !== 'phone'} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `request-${name}-error` : undefined} onChange={edit} />{errors[name] && <p id={`request-${name}-error`} className="request-error">{errors[name]}</p>}</div>)}<label className="request-check"><input type="checkbox" name="whatsappConsent" checked={fields.whatsappConsent} onChange={edit} />Allow the owner to reply manually in WhatsApp to my optional number. Leave the number blank if you do not want a WhatsApp reply.</label><div className="request-field"><label htmlFor="request-note">Optional note (up to 2,000 characters)</label><textarea id="request-note" name="note" rows={4} value={fields.note} maxLength={2000} onChange={edit} aria-invalid={Boolean(errors.note)} aria-describedby={errors.note ? 'request-note-error' : undefined} />{errors.note && <p id="request-note-error" className="request-error">{errors.note}</p>}</div><div className="request-trap" aria-hidden="true"><label htmlFor="request-website">Website</label><input id="request-website" name="website" tabIndex={-1} autoComplete="off" value={fields.website} onChange={edit} /></div><label className="request-check"><input id="request-ack" type="checkbox" name="manualReviewAck" checked={fields.manualReviewAck} required aria-invalid={Boolean(errors.manualReviewAck)} aria-describedby={errors.manualReviewAck ? 'request-ack-error' : undefined} onChange={edit} />I understand this is a request for manual review, not an accepted order, reservation, final quote or payment. The owner must confirm availability, final price, delivery and payment manually.</label>{errors.manualReviewAck && <p id="request-ack-error" className="request-error">{errors.manualReviewAck}</p>}<p className="hardware-store-small">Your contact details and request are stored privately for owner review. Do not include passwords, payment information or other sensitive details. No automatic customer message or supplier order is sent.</p><ContactTurnstile siteKey={config.siteKey} onToken={setToken} resetKey={resetKey} action="store_order_request" /><button type="submit" disabled={busy || badSelection || data.state !== 'ready'} aria-busy={busy}>{busy ? 'Saving request…' : 'Submit request for manual review'}</button></fieldset></form>}
      <p role="status" aria-live="polite" className={status.kind === 'error' ? 'request-error' : ''}>{status.text}</p></>}
    <Link className="hardware-store-text-link" to="/contact">Contact Bitreca for general enquiries, WhatsApp or email options →</Link>
  </section></main>
}
