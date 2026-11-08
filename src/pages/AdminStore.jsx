import { useEffect, useRef, useState } from 'react'
import { useAdminApi } from '../hooks/useAdminApi'
import AdminProductDeletion from '../components/AdminProductDeletion'
import { emptyCategory, emptyProduct, storeAvailability, storeImageKey, storeStatuses, storeUuid, validateStoreRecord } from '../../shared/store-catalogue'
import './AdminStore.css'

const apiError = (result) => result?.data?.message || 'Catalogue request failed. Reload before retrying.'
const validRecord = record => record && storeUuid.test(record.id) && typeof record.title === 'string' && storeStatuses.includes(record.status) && Number.isSafeInteger(record.version) && record.version > 0
const productFields = ['sku', 'category_id', 'specifications', 'image_key', 'availability', 'availability_checked_at', 'price_minor', 'currency', 'price_note', 'source_reference', 'internal_notes']
const labels = { title: 'Title', slug: 'Slug', description: 'Description', sku: 'SKU', category_id: 'Category', specifications: 'Specifications (plain text)', image_key: 'Store image', availability: 'Availability (owner verified)', availability_checked_at: 'Availability last checked', price_minor: 'Optional price in currency minor units (integer)', currency: 'Currency code (three uppercase letters)', price_note: 'Approved price / tax context', source_reference: 'Supplier / source reference — private', internal_notes: 'Internal notes — private', status: 'Status' }
const lengths = { title: 150, slug: 80, description: 5000, sku: 64, specifications: 12000, currency: 3, price_note: 500, source_reference: 2000, internal_notes: 4000 }

function StorePanel({ kind, onBusy }) {
  const request = useAdminApi(), root = `/api/admin/store/${kind}`
  const [view, setView] = useState({ status: 'all', cursor: null, previous: [], revision: 0 })
  const key = JSON.stringify(view)
  const [response, setResponse] = useState({ key: '', state: 'loading', records: [] })
  const list = response.key === key ? response : { state: 'loading', records: [] }
  const [editor, setEditor] = useState(null), [notice, setNotice] = useState(''), [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false), [needsReload, setNeedsReload] = useState(false)
  const [choices, setChoices] = useState({ records: [], nextCursor: null, loading: false, error: '' })
  const alive = useRef(true), mutex = useRef(false), selection = useRef(0), heading = useRef(null), form = useRef(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000)
    let active = true
    const query = new URLSearchParams({ status: view.status })
    if (view.cursor) query.set('cursor', view.cursor)
    async function load() {
      try {
        const result = await request(`${root}?${query}`, { signal: controller.signal })
        if (!result || !active) return
        if (!result.response.ok || result.data?.success !== true || !Array.isArray(result.data.records) || !result.data.records.every(validRecord)) throw new Error(apiError(result))
        setResponse({ key, state: 'ready', records: result.data.records, nextCursor: result.data.nextCursor })
      } catch (error) { if (active) setResponse({ key, state: 'error', records: [], error: controller.signal.aborted ? 'Catalogue load timed out. Retry.' : error.message }) }
      finally { clearTimeout(timer) }
    }
    load()
    return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [key, root, request, view.cursor, view.status])
  useEffect(() => { if (editor?.state === 'ready') heading.current?.focus() }, [editor?.id, editor?.state])

  function refresh() { setView(current => ({ ...current, revision: current.revision + 1 })) }
  async function loadChoices(more = false) {
    setChoices(current => ({ ...current, loading: true, error: '' }))
    try {
      const query = new URLSearchParams({ status: 'all' })
      if (more && choices.nextCursor) query.set('cursor', choices.nextCursor)
      const result = await request(`/api/admin/store/categories?${query}`, { signal: AbortSignal.timeout(12000) })
      if (!result || !alive.current) return
      if (!result.response.ok || !Array.isArray(result.data?.records) || !result.data.records.every(validRecord)) throw new Error(apiError(result))
      setChoices(current => ({ loading: false, error: '', records: [...(more ? current.records : []), ...result.data.records].filter((row, index, rows) => rows.findIndex(other => other.id === row.id) === index), nextCursor: result.data.nextCursor }))
    } catch (error) { if (alive.current) setChoices(current => ({ ...current, loading: false, error: error.message })) }
  }
  function create() {
    selection.current++; setNotice(''); setErrors({}); setNeedsReload(false)
    setEditor({ id: crypto.randomUUID(), version: null, state: 'ready', data: kind === 'categories' ? emptyCategory() : emptyProduct() })
    if (kind === 'products') loadChoices()
  }
  async function open(id) {
    const attempt = ++selection.current
    setEditor({ id, state: 'loading' }); setNotice(''); setErrors({}); setNeedsReload(false)
    try {
      const result = await request(`${root}/${id}`, { signal: AbortSignal.timeout(12000) })
      if (!result || !alive.current || attempt !== selection.current) return
      if (!result.response.ok || !validRecord(result.data?.record)) throw new Error(apiError(result))
      const record = result.data.record, defaults = kind === 'categories' ? emptyCategory() : emptyProduct()
      const data = Object.fromEntries(Object.keys(defaults).map(field => [field, record[field]]))
      setEditor({ id, state: 'ready', version: record.version, data })
      if (kind === 'products') loadChoices()
    } catch (error) { if (alive.current && attempt === selection.current) setEditor({ id, state: 'error', error: error.message }) }
  }
  function update(field, value) { setEditor(current => ({ ...current, data: { ...current.data, [field]: value } })); setErrors(current => ({ ...current, [field]: undefined })); setNotice('') }
  async function save(event) {
    event.preventDefault()
    if (mutex.current || needsReload) return
    const validation = validateStoreRecord(kind, editor.data)
    setErrors(validation.errors)
    if (Object.keys(validation.errors).length) { setNotice('Check the highlighted fields.'); requestAnimationFrame(() => form.current?.querySelector('[aria-invalid="true"]')?.focus()); return }
    mutex.current = true; setBusy(true); onBusy(true); setNotice('Saving…')
    try {
      const result = await request(editor.version ? `${root}/${editor.id}` : root, { method: editor.version ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editor.id, ...(editor.version ? { version: editor.version } : {}), data: validation.data }), signal: AbortSignal.timeout(15000) })
      if (!result || !alive.current) return
      if (!result.response.ok || result.data?.success !== true || result.data.id !== editor.id) {
        if (result.data?.errors) setErrors(Object.fromEntries(Object.entries(result.data.errors).filter(([name, value]) => Object.hasOwn(editor.data, name) && typeof value === 'string')))
        if (result.response.status === 409) setNeedsReload(true)
        throw new Error(apiError(result))
      }
      await open(editor.id); refresh(); setNotice('Saved. Published products in published categories are visible in the enquiry-only catalogue. Supplier references and internal notes stay private.')
    } catch (error) { if (alive.current) setNotice(error.message || 'Save outcome uncertain. Reload before retrying.') }
    finally { mutex.current = false; if (alive.current) { setBusy(false); onBusy(false) } }
  }
  async function upload(event) {
    const file = event.target.files?.[0]
    if (!file || mutex.current) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setNotice('Choose a JPEG, PNG or WebP image of 2 MB or smaller.'); return }
    mutex.current = true; setBusy(true); onBusy(true); setNotice('Uploading private Store image…')
    try {
      const result = await request('/api/admin/store/media', { method: 'POST', headers: { 'Content-Type': file.type }, body: file, signal: AbortSignal.timeout(15000) })
      if (!result || !alive.current) return
      if (!result.response.ok || !storeImageKey.test(result.data?.image_key)) throw new Error(apiError(result))
      update('image_key', result.data.image_key); setNotice('Image uploaded privately. Save the product to attach it. Only use images you have permission to publish.')
    } catch (error) { if (alive.current) setNotice(error.message || 'Upload unconfirmed. Retry with a new file selection.') }
    finally { mutex.current = false; if (alive.current) { setBusy(false); onBusy(false) } }
  }
  function field(name) {
    const value = editor.data[name], error = errors[name], id = `store-${name}`
    const props = { id, name, disabled: busy || needsReload, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined }
    let control
    if (name === 'status' || name === 'availability') control = <select {...props} value={value} onChange={event => update(name, event.target.value)}>{(name === 'status' ? storeStatuses : storeAvailability).map(option => <option key={option} value={option}>{option}</option>)}</select>
    else if (name === 'category_id') control = <><select {...props} value={value} onChange={event => update(name, event.target.value)}><option value="">Choose an owner-created category</option>{value && !choices.records.some(row => row.id === value) && <option value={value}>Current category ({value})</option>}{choices.records.map(row => <option key={row.id} value={row.id}>{row.title} ({row.status})</option>)}</select><div className="admin-store-choice-tools"><button type="button" disabled={busy || choices.loading} onClick={() => loadChoices(false)}>Refresh category choices</button>{choices.nextCursor && <button type="button" disabled={busy || choices.loading} onClick={() => loadChoices(true)}>Load more category choices</button>}</div>{choices.loading && <p role="status">Loading choices…</p>}{choices.error && <p role="alert">{choices.error}</p>}</>
    else if (name === 'image_key') control = <><input {...props} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} />{value && storeImageKey.test(value) && <><img className="admin-store-image" src={`/api/admin/store/media/${value.split('/')[1]}`} alt="Current catalogue product" /><button type="button" disabled={busy || needsReload} onClick={() => update('image_key', null)}>Detach image (keeps uploaded file)</button></>}<small>Private Store media only. JPEG/PNG/WebP, up to 2 MB. Uploading does not publish.</small></>
    else if (['description', 'specifications', 'source_reference', 'internal_notes', 'price_note'].includes(name)) control = <textarea {...props} rows={name === 'specifications' ? 6 : 3} value={value} maxLength={kind === 'categories' && name === 'description' ? 2000 : lengths[name]} onChange={event => update(name, event.target.value)} />
    else control = <input {...props} type={name === 'price_minor' ? 'number' : name === 'availability_checked_at' ? 'date' : 'text'} min={name === 'price_minor' ? 0 : undefined} max={name === 'price_minor' ? 999999999999 : name === 'availability_checked_at' ? new Date().toISOString().slice(0, 10) : undefined} step={name === 'price_minor' ? 1 : undefined} maxLength={kind === 'categories' && name === 'title' ? 100 : lengths[name]} value={value ?? ''} onChange={event => update(name, name === 'price_minor' ? event.target.value === '' ? null : Number(event.target.value) : name === 'currency' || name === 'availability_checked_at' ? event.target.value || null : event.target.value)} />
    return <div className="admin-store-field" key={name}><label htmlFor={id}>{labels[name]}</label>{control}{error && <p id={`${id}-error`} className="admin-store-error">{error}</p>}</div>
  }
  return <div className="admin-store-grid"><section className="admin-store-list" aria-labelledby="store-list-title" aria-busy={list.state === 'loading'}><div className="admin-store-toolbar"><h2 id="store-list-title">{kind === 'categories' ? 'Categories' : 'Products'}</h2><button type="button" disabled={busy} onClick={create}>New {kind === 'categories' ? 'category' : 'product'}</button></div><label htmlFor="store-filter">Filter by status</label><select id="store-filter" disabled={busy} value={view.status} onChange={event => setView({ status: event.target.value, cursor: null, previous: [], revision: 0 })}>{['all', ...storeStatuses].map(status => <option key={status}>{status}</option>)}</select><button type="button" disabled={busy} onClick={refresh}>Refresh list</button>{list.state === 'loading' && <p role="status">Loading catalogue…</p>}{list.state === 'error' && <p role="alert">{list.error} Use Refresh list to retry.</p>}{list.state === 'ready' && <>{!list.records.length && <p>No {kind} in this view. Production records are entered by the owner; no sample items are supplied.</p>}<ul>{list.records.map(row => <li key={row.id}><button type="button" disabled={busy} onClick={() => open(row.id)} aria-pressed={editor?.id === row.id}><strong>{row.title}</strong><span>{row.sku || row.slug} · {row.status}</span></button></li>)}</ul><nav className="admin-store-pagination" aria-label={`${kind} pages`}><button type="button" disabled={busy || !view.previous.length} onClick={() => setView(current => ({ ...current, cursor: current.previous.at(-1), previous: current.previous.slice(0, -1) }))}>Previous</button><span>Page {view.previous.length + 1}</span><button type="button" disabled={busy || !list.nextCursor} onClick={() => setView(current => ({ ...current, cursor: list.nextCursor, previous: [...current.previous, current.cursor] }))}>Next</button></nav></>}</section>
    <section className="admin-store-editor" aria-labelledby="store-editor-title"><h2 id="store-editor-title" ref={heading} tabIndex={-1}>{editor ? `${editor.version ? 'Edit' : 'New'} ${kind === 'categories' ? 'category' : 'product'}` : 'Record editor'}</h2>{!editor && <p>Select a record or create a draft. Draft and archived records stay private; published categories and eligible published products are public.</p>}{editor?.state === 'loading' && <p role="status">Loading record…</p>}{editor?.state === 'error' && <div role="alert"><p>{editor.error}</p><button type="button" onClick={() => open(editor.id)}>Retry record</button></div>}{editor?.state === 'ready' && <form ref={form} onSubmit={save} noValidate><p className="admin-store-help">Draft = private. Published = approved for the public catalogue; products also require a published category. Archived = private, with SKU/slug retained. Unpublish products before unpublishing a category; archive its active products before archiving it.</p>{['title', 'slug', 'description', ...(kind === 'products' ? productFields : []), 'status'].map(field)}{kind === 'products' && <p className="admin-store-help">No default currency or price. Leave both price and currency blank for enquiry pricing. If entered, verify the currency’s minor unit convention and approved price/tax context. Unknown availability makes no stock claim. Supplier references/internal notes are private and never included in list summaries.</p>}<div className="admin-store-actions"><button type="submit" disabled={busy || needsReload}>{busy ? 'Working…' : 'Save record'}</button>{editor.version && <button type="button" disabled={busy} onClick={() => open(editor.id)}>Reload record</button>}<button type="button" disabled={busy} onClick={() => { selection.current++; setEditor(null); setNotice(''); setErrors({}); setNeedsReload(false) }}>Close editor</button></div>{needsReload && <p role="alert">Save blocked to prevent conflicts. Reload the existing record, or close this new editor and refresh the list before retrying.</p>}</form>}<p role="status" aria-live="polite" className="admin-store-notice">{notice}</p>{kind === 'products' && <AdminProductDeletion productId={editor?.version ? editor.id : null} onBusy={value => { setBusy(value); onBusy(value) }} onDeleted={id => { if (editor?.id === id) { selection.current++; setEditor(null); setErrors({}); setNeedsReload(false) } refresh() }} />}</section></div>
}

export default function AdminStore() {
  const [kind, setKind] = useState('categories'), [busy, setBusy] = useState(false)
  return <main className="admin-store"><header><p className="admin-store-eyebrow">PRIVATE CATALOGUE MANAGEMENT</p><h1>Store catalogue</h1><p>Owner-entered categories and simple products. Published categories and eligible published products appear in the public enquiry-only catalogue. Drafts, archived records and supplier/internal fields stay private. No checkout or order acceptance.</p></header><nav className="admin-store-tabs" aria-label="Catalogue sections">{['categories', 'products'].map(value => <button type="button" key={value} disabled={busy} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === 'categories' ? 'Categories' : 'Products'}</button>)}</nav><StorePanel key={kind} kind={kind} onBusy={setBusy} /></main>
}
