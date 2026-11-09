import { useEffect, useRef, useState } from 'react'
import { useAdminApi } from '../hooks/useAdminApi'
import { orderReplyLinks, orderStatuses, orderTransitions } from '../../shared/store-order-request'
import { fulfilmentStages } from '../../shared/store-fulfilment'
import AdminRequestFulfilment from '../components/AdminRequestFulfilment'
import { storePrice } from '../utils/publicStore'
import './AdminEnquiries.css'
import './AdminStoreRequests.css'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const validRecord = row => row && uuid.test(row.id) && typeof row.name === 'string' && Object.hasOwn(orderStatuses, row.status) && Object.hasOwn(fulfilmentStages, row.fulfilment_stage) && Number.isSafeInteger(row.version) && row.version > 0 && Number.isSafeInteger(row.line_count) && Number.isSafeInteger(row.total_quantity) && Number.isSafeInteger(row.created_at)
const date = value => new Date(value * 1000).toLocaleString()

export default function AdminStoreRequests() {
  const request = useAdminApi(), [view, setView] = useState({ status: 'all', stage: 'all', cursor: null, previous: [], revision: 0 })
  const key = JSON.stringify(view), [listResult, setListResult] = useState({ key: '', state: 'loading', records: [] })
  const [selected, setSelected] = useState(null), [detailRevision, setDetailRevision] = useState(0), [detailResult, setDetailResult] = useState({ key: '', state: 'idle' })
  const detailKey = `${selected}:${detailRevision}`, [choice, setChoice] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false)
  const mutex = useRef(false), heading = useRef(null)
  const list = listResult.key === key ? listResult : { state: 'loading', records: [] }
  const detail = !selected ? { state: 'idle' } : detailResult.key === detailKey ? detailResult : { state: 'loading' }
  const record = detail.state === 'ready' ? detail.record : null, value = choice || record?.status || '', replies = record ? orderReplyLinks(record) : {}
  useEffect(() => {
    let active = true
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000), query = new URLSearchParams({ status: view.status, stage: view.stage })
    if (view.cursor) query.set('cursor', view.cursor)
    async function load() {
      try {
        const result = await request(`/api/admin/store/requests?${query}`, { signal: controller.signal })
        if (!result || !active) return
        if (!result.response.ok || result.data?.success !== true || !Array.isArray(result.data.records) || !result.data.records.every(validRecord)) throw Error(result.data?.message || 'Request list unavailable.')
        setListResult({ key, state: 'ready', records: result.data.records, nextCursor: result.data.nextCursor })
      } catch (error) { if (active) setListResult({ key, state: 'error', records: [], error: error.message }) }
      finally { clearTimeout(timer) }
    }
    load(); return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [key, request, view.cursor, view.status, view.stage])
  useEffect(() => {
    if (!selected) return
    let active = true
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000)
    async function load() {
      try {
        const result = await request(`/api/admin/store/requests/${selected}`, { signal: controller.signal })
        if (!result || !active) return
        if (!result.response.ok || !validRecord(result.data?.record) || result.data.record.id !== selected || !Array.isArray(result.data.items) || result.data.items.length !== result.data.record.line_count || !result.data.items.every(item => typeof item.title === 'string' && typeof item.sku === 'string' && Number.isSafeInteger(item.quantity) && item.quantity > 0)) throw Error(result.data?.message || 'Request detail unavailable.')
        setDetailResult({ key: detailKey, state: 'ready', record: result.data.record, items: result.data.items })
      } catch (error) { if (active) setDetailResult({ key: detailKey, state: 'error', error: error.message }) }
      finally { clearTimeout(timer) }
    }
    load(); return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [selected, detailKey, request])
  useEffect(() => { if (detail.state === 'ready') heading.current?.focus() }, [detailKey, detail.state])
  function select(id) { setSelected(id); setChoice(''); setNotice(''); setBlocked(false) }
  function reload() { setDetailRevision(n => n + 1); setChoice(''); setNotice(''); setBlocked(false) }
  async function save() {
    if (mutex.current || !record || blocked || value === record.status) return
    mutex.current = true; setBusy(true); setNotice('Saving review status…')
    try {
      const result = await request(`/api/admin/store/requests/${record.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: value, version: record.version }), signal: AbortSignal.timeout(12000) })
      if (!result) return
      if (!result.response.ok || result.data?.success !== true) { if (result.response.status === 409) setBlocked(true); throw Error(result.data?.message || 'Status update unconfirmed. Reload before retrying.') }
      reload(); setView(current => ({ ...current, revision: current.revision + 1 })); setNotice('Review status updated. Fulfilment, payment receipt, supplier actions and customer messages were not changed.')
    } catch (error) { setNotice(error.message || 'Status update unconfirmed. Reload before retrying.') }
    finally { mutex.current = false; setBusy(false) }
  }
  return <main className="enquiries-admin store-requests-admin"><header className="enquiries-header"><div><p className="enquiries-eyebrow">PRIVATE STORE REQUESTS</p><h1>Requests for manual review</h1><p>A new request requires manual supplier and customer confirmation. Honour its captured item prices; agree delivery charges and payment method before confirming. Review, fulfilment, delivery and payment receipt are tracked separately.</p></div><button type="button" disabled={busy} onClick={() => setView(current => ({ ...current, revision: current.revision + 1 }))}>Refresh requests</button></header><div className="enquiries-layout"><section className="enquiries-list" aria-labelledby="store-requests-list-title" aria-busy={list.state === 'loading'}><h2 id="store-requests-list-title">Requests</h2><label htmlFor="store-requests-filter">Review status<select id="store-requests-filter" disabled={busy} value={view.status} onChange={event => { setView(current => ({ ...current, status: event.target.value, cursor: null, previous: [], revision: 0 })); select(null) }}><option value="all">All statuses</option>{Object.entries(orderStatuses).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label><label htmlFor="store-requests-stage-filter">Fulfilment stage<select id="store-requests-stage-filter" disabled={busy} value={view.stage} onChange={event => { setView(current => ({ ...current, stage: event.target.value, cursor: null, previous: [], revision: 0 })); select(null) }}><option value="all">All stages</option>{Object.entries(fulfilmentStages).map(([stage, label]) => <option key={stage} value={stage}>{label}</option>)}</select></label>{list.state === 'loading' && <p role="status">Loading requests…</p>}{list.state === 'error' && <p role="alert">{list.error} Use Refresh requests to retry.</p>}{list.state === 'ready' && <>{!list.records.length && <p>No requests in this view. Submitted requests appear here for manual review; receipt is not order acceptance or payment.</p>}<ul>{list.records.map(row => <li key={row.id}><button type="button" disabled={busy} aria-pressed={selected === row.id} onClick={() => select(row.id)}><strong>{row.name}</strong><span>{orderStatuses[row.status]} · {row.line_count} products / {row.total_quantity} units</span><span>{fulfilmentStages[row.fulfilment_stage]} · Payment: {row.payment_status}</span><span>{date(row.created_at)}</span></button></li>)}</ul><nav className="enquiries-pagination" aria-label="Store request pages"><button type="button" disabled={busy || !view.previous.length} onClick={() => { setView(current => ({ ...current, cursor: current.previous.at(-1), previous: current.previous.slice(0, -1) })); select(null) }}>Previous</button><span>Page {view.previous.length + 1}</span><button type="button" disabled={busy || !list.nextCursor} onClick={() => { setView(current => ({ ...current, cursor: list.nextCursor, previous: [...current.previous, current.cursor] })); select(null) }}>Next</button></nav></>}</section>
    <section className="enquiries-detail" aria-labelledby="store-request-detail-title" aria-busy={detail.state === 'loading'}><h2 id="store-request-detail-title" ref={heading} tabIndex={-1}>{record ? `Request from ${record.name}` : 'Request details'}</h2>{detail.state === 'idle' && <p>Select a request to inspect its immutable submitted details and item snapshots.</p>}{detail.state === 'loading' && <p role="status">Loading request…</p>}{detail.state === 'error' && <div role="alert"><p>{detail.error}</p><button type="button" onClick={reload}>Retry request</button></div>}{record && <><dl><dt>Reference</dt><dd>{record.id}</dd><dt>Email</dt><dd>{record.email}</dd>{record.phone && <><dt>WhatsApp reply number</dt><dd>{record.phone} — visitor permission recorded</dd></>}<dt>Received</dt><dd>{date(record.created_at)}</dd><dt>Current review status</dt><dd>{orderStatuses[record.status]}</dd></dl><h3>Customer note</h3><p className="enquiry-message">{record.note || 'No note provided.'}</p><h3>Item snapshots</h3><p className="enquiries-help">Immutable item prices captured at submission must be honoured at confirmation. Supplier cost changes never reprice these items. Delivery charges and payment terms are recorded separately below; snapshots are not stock reservations.</p><ul className="store-request-snapshots">{detail.items.map(item => <li key={item.slug}><h4>{item.title}</h4><p>SKU: {item.sku} · Quantity: {item.quantity}</p><p>Category: {item.category_title}</p><p>Captured unit selling price: {storePrice({ price_minor: item.listed_price_minor, currency: item.listed_currency })}</p>{item.listed_price_note && <p>{item.listed_price_note}</p>}<p>Availability recorded: {item.listed_availability}{item.availability_checked_at ? ` · checked ${item.availability_checked_at}` : ''}</p><p>Snapshot captured: {date(item.captured_at)}</p></li>)}</ul><div className="enquiry-replies">{replies.email && <a href={replies.email}>Prepare manual email reply ↗</a>}{replies.whatsapp && <a href={replies.whatsapp} target="_blank" rel="noopener noreferrer">Prepare WhatsApp reply ↗<span className="enquiries-sr-only"> (opens a new tab)</span></a>}</div><p className="enquiries-help">Review and send in the selected app yourself. Opening a reply link sends nothing automatically and does not change request status.</p><div className="enquiry-status-editor"><label htmlFor="store-request-review-status">Review status<select id="store-request-review-status" value={value} disabled={busy || blocked} onChange={event => setChoice(event.target.value)}><option value={record.status}>{orderStatuses[record.status]}</option>{orderTransitions[record.status].map(status => <option key={status} value={status}>{orderStatuses[status]}</option>)}</select></label><button type="button" onClick={save} disabled={busy || blocked || value === record.status}>{busy ? 'Saving…' : 'Save review status'}</button><button type="button" onClick={reload} disabled={busy}>Reload request</button></div><AdminRequestFulfilment key={`${record.id}:${record.version}`} record={record} items={detail.items} busy={busy} blocked={blocked} onBusy={setBusy} onConflict={() => setBlocked(true)} onSaved={() => { reload(); setView(current => ({ ...current, revision: current.revision + 1 })); setNotice('Fulfilment details saved. No customer message, supplier purchase or automatic payment action was performed.') }} />{blocked && <p role="alert">Request changed. Reload before saving again.</p>}</>}<p role="status" aria-live="polite">{notice}</p></section></div></main>
}
