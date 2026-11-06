import { useEffect, useRef, useState } from 'react'
import { useAdminApi } from '../hooks/useAdminApi'
import { enquiryReplyLinks, enquiryStatuses } from '../../shared/contact-enquiry'
import './AdminEnquiries.css'

const formatDate = (value) => Number.isFinite(value) ? new Date(value * 1000).toLocaleString() : 'Unavailable'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const validSummary = row => row && uuid.test(row.id) && ['name', 'email', 'service'].every(key => typeof row[key] === 'string') && Object.hasOwn(enquiryStatuses, row.status) && Number.isSafeInteger(row.version) && row.version > 0 && Number.isSafeInteger(row.created_at) && Number.isSafeInteger(row.updated_at)
const apiMessage = (result, fallback) => typeof result?.data?.message === 'string' ? result.data.message : fallback

export default function AdminEnquiries() {
  const request = useAdminApi()
  const [view, setView] = useState({ status: 'all', cursor: null, previous: [], refresh: 0 })
  const listKey = JSON.stringify([view.status, view.cursor, view.refresh])
  const [listResult, setListResult] = useState({ key: '', state: 'loading', items: [], nextCursor: null })
  const [selectedId, setSelectedId] = useState(null)
  const [detailRefresh, setDetailRefresh] = useState(0)
  const detailKey = `${selectedId}:${detailRefresh}`
  const [detailResult, setDetailResult] = useState({ key: '', state: 'idle', data: null })
  const [edit, setEdit] = useState({ id: null, value: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [needsReload, setNeedsReload] = useState(false)
  const detailHeading = useRef(null)
  const list = listResult.key === listKey ? listResult : { state: 'loading', items: [], nextCursor: null }
  const detail = !selectedId ? { state: 'idle', data: null } : detailResult.key === detailKey ? detailResult : { state: 'loading', data: null }
  const message = detail.state === 'ready' ? detail.data : null
  const choice = message && edit.id === message.id ? edit.value : message?.status || 'new'
  const replies = message ? enquiryReplyLinks(message) : {}

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 12000)
    let active = true
    const query = new URLSearchParams({ status: view.status })
    if (view.cursor) query.set('cursor', view.cursor)
    async function load() {
      try {
        const result = await request(`/api/admin/enquiries?${query}`, { signal: controller.signal })
        if (!result || !active) return
        if (!result.response.ok || result.data?.success !== true || !Array.isArray(result.data.enquiries) || !result.data.enquiries.every(validSummary) || (result.data.nextCursor !== null && typeof result.data.nextCursor !== 'string')) throw new Error(apiMessage(result, 'The inbox could not be loaded.'))
        setListResult({ key: listKey, state: 'ready', items: result.data.enquiries, nextCursor: result.data.nextCursor })
      } catch (error) { if (active) setListResult({ key: listKey, state: 'error', items: [], nextCursor: null, error: controller.signal.aborted ? 'Inbox request timed out. Please retry.' : error.message }) }
      finally { window.clearTimeout(timer) }
    }
    load()
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [listKey, view.status, view.cursor, request])

  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 12000)
    let active = true
    async function load() {
      try {
        const result = await request(`/api/admin/enquiries/${selectedId}`, { signal: controller.signal })
        if (!result || !active) return
        if (!result.response.ok || result.data?.success !== true || !validSummary(result.data.enquiry) || typeof result.data.enquiry.message !== 'string' || result.data.enquiry.id !== selectedId) throw new Error(apiMessage(result, 'The enquiry could not be loaded.'))
        setDetailResult({ key: detailKey, state: 'ready', data: result.data.enquiry })
      } catch (error) { if (active) setDetailResult({ key: detailKey, state: 'error', data: null, error: controller.signal.aborted ? 'Enquiry request timed out. Please retry.' : error.message }) }
      finally { window.clearTimeout(timer) }
    }
    load()
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [selectedId, detailKey, request])

  useEffect(() => { if (detail.state === 'ready') detailHeading.current?.focus() }, [detailKey, detail.state])

  function clearSelection() { setSelectedId(null); setNotice(''); setNeedsReload(false); setEdit({ id: null, value: '' }) }
  function select(id) { setSelectedId(id); setNotice(''); setNeedsReload(false); setEdit({ id: null, value: '' }) }
  function reloadDetail() { setDetailRefresh(value => value + 1); setNotice(''); setNeedsReload(false); setEdit({ id: null, value: '' }) }
  async function saveStatus() {
    if (busy || needsReload || !message || choice === message.status) return
    setBusy(true); setNotice('Saving status…')
    try {
      const result = await request(`/api/admin/enquiries/${message.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: choice, version: message.version }), signal: AbortSignal.timeout(12000) })
      if (!result) return
      const update = result.data?.enquiry
      if (!result.response.ok || result.data?.success !== true || update?.id !== message.id || !Object.hasOwn(enquiryStatuses, update.status) || update.version !== message.version + 1) throw new Error(apiMessage(result, 'Status update could not be confirmed. Reload before retrying.'))
      setDetailResult(current => ({ ...current, data: { ...current.data, ...update } }))
      setEdit({ id: null, value: '' }); setView(current => ({ ...current, refresh: current.refresh + 1 }))
      setNotice('Status saved. Status labels do not send messages; mark Replied only after your manual reply.')
    } catch (error) { setNeedsReload(true); setNotice(error.message || 'Status update could not be confirmed. Reload before retrying.') }
    finally { setBusy(false) }
  }

  return (
    <main className="enquiries-admin">
      <header className="enquiries-header"><div><p className="enquiries-eyebrow">PRIVATE / OWNER INBOX</p><h1>Project enquiries</h1><p>Read and manage submissions. Replies are always manual.</p></div><button type="button" disabled={busy || list.state === 'loading'} onClick={() => setView(current => ({ ...current, refresh: current.refresh + 1 }))}>Refresh inbox</button></header>
      <div className="enquiries-toolbar"><label htmlFor="enquiry-filter">Filter by status<select id="enquiry-filter" value={view.status} disabled={busy} onChange={event => { setView({ status: event.target.value, cursor: null, previous: [], refresh: 0 }); clearSelection() }}><option value="all">All statuses</option>{Object.entries(enquiryStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p>No automatic emails or WhatsApp messages are sent.</p></div>
      <div className="enquiries-workspace">
        <section className="enquiries-list" aria-labelledby="enquiry-list-title" aria-busy={list.state === 'loading'}>
          <h2 id="enquiry-list-title">Messages</h2>
          {list.state === 'loading' && <p role="status">Loading enquiries…</p>}
          {list.state === 'error' && <div role="alert"><p>{list.error}</p><button type="button" onClick={() => setView(current => ({ ...current, refresh: current.refresh + 1 }))}>Try again</button></div>}
          {list.state === 'ready' && <>
            {list.items.length === 0 && <p role="status">No enquiries match this view.</p>}
            <ul>{list.items.map(item => <li key={item.id}><button type="button" className={selectedId === item.id ? 'enquiry-selected' : ''} aria-current={selectedId === item.id ? 'true' : undefined} disabled={busy} onClick={() => select(item.id)}><span className="enquiry-row-top"><strong>{item.name}</strong><span className={`enquiry-status enquiry-status-${item.status}`}>{enquiryStatuses[item.status]}</span></span><span>{item.email}</span><span>{item.service}</span><time dateTime={new Date(item.created_at * 1000).toISOString()}>{formatDate(item.created_at)}</time></button></li>)}</ul>
            <nav className="enquiries-pagination" aria-label="Inbox pages"><button type="button" disabled={busy || view.previous.length === 0} onClick={() => { setView(current => ({ ...current, cursor: current.previous.at(-1), previous: current.previous.slice(0, -1) })); clearSelection() }}>Previous</button><span>Page {view.previous.length + 1}</span><button type="button" disabled={busy || !list.nextCursor} onClick={() => { setView(current => ({ ...current, cursor: list.nextCursor, previous: [...current.previous, current.cursor] })); clearSelection() }}>Next</button></nav>
          </>}
        </section>
        <section className="enquiries-detail" aria-labelledby="enquiry-detail-title" aria-busy={detail.state === 'loading'}>
          <h2 id="enquiry-detail-title" ref={detailHeading} tabIndex={-1}>{message ? `Enquiry from ${message.name}` : 'Message details'}</h2>
          {detail.state === 'idle' && <p>Select an enquiry to read its details.</p>}
          {detail.state === 'loading' && <p role="status">Loading enquiry…</p>}
          {detail.state === 'error' && <div role="alert"><p>{detail.error}</p><button type="button" onClick={reloadDetail}>Retry details</button></div>}
          {message && <>
            <span className={`enquiry-status enquiry-status-${message.status}`}>{enquiryStatuses[message.status]}</span>
            <dl><dt>Reference</dt><dd>{message.id}</dd><dt>Email</dt><dd>{message.email}</dd><dt>Service</dt><dd>{message.service}</dd><dt>Received</dt><dd>{formatDate(message.created_at)}</dd><dt>Updated</dt><dd>{formatDate(message.updated_at)}</dd>{message.phone && <><dt>WhatsApp number</dt><dd>{message.phone}{message.whatsapp_consent === 1 ? ' — manual reply permitted' : ' — no WhatsApp permission'}</dd></>}</dl>
            <h3>Project message</h3><p className="enquiry-message">{message.message}</p>
            <div className="enquiry-replies">{replies.email && <a href={replies.email}>Reply in email app <span aria-hidden="true">↗</span></a>}{replies.whatsapp && <a href={replies.whatsapp} target="_blank" rel="noopener noreferrer">Reply in WhatsApp <span aria-hidden="true">↗</span><span className="enquiries-sr-only"> (opens in a new tab)</span></a>}</div>
            <p className="enquiries-help">Review and send your reply in the selected app. Opening a reply link does not send anything or mark the enquiry Replied.</p>
            <div className="enquiry-status-editor"><label htmlFor="enquiry-status">Message status<select id="enquiry-status" disabled={busy || needsReload} value={choice} onChange={event => setEdit({ id: message.id, value: event.target.value })}>{Object.entries(enquiryStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="enquiries-primary" onClick={saveStatus} disabled={busy || needsReload || choice === message.status}>{busy ? 'Saving…' : 'Save status'}</button><button type="button" onClick={reloadDetail} disabled={busy}>Reload details</button></div>
          </>}
          <p className="enquiries-notice" role="status" aria-live="polite">{notice}</p>
        </section>
      </div>
    </main>
  )
}
