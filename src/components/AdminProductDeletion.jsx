import { useEffect, useRef, useState } from 'react'
import { useAdminApi } from '../hooks/useAdminApi'
import { storeUuid } from '../../shared/store-catalogue'

const valid = row => row && storeUuid.test(row.id) && typeof row.title === 'string' && typeof row.sku === 'string' && Number.isSafeInteger(row.version) && row.version > 0

export default function AdminProductDeletion({ productId, onBusy, onDeleted }) {
  const request = useAdminApi(), dialog = useRef(null), cancel = useRef(null), mutex = useRef(false), alive = useRef(true)
  const [target, setTarget] = useState(null), [typed, setTyped] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [blocked, setBlocked] = useState(false)
  const [pending, setPending] = useState({ records: [], next: null, loading: true, error: '' })
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let active = true
    request('/api/admin/store/product-deletions', { signal: AbortSignal.timeout(12000) }).then(result => {
      if (!result || !active) return
      if (!result.response.ok || result.data?.success !== true || !Array.isArray(result.data.records) || !result.data.records.every(valid)) throw Error('Pending image cleanup could not be loaded.')
      setPending({ records: result.data.records, next: result.data.next, loading: false, error: '' })
    }).catch(() => { if (active) setPending({ records: [], next: null, loading: false, error: 'Pending image cleanup could not be loaded. Refresh it before assuming cleanup is complete.' }) })
    return () => { active = false }
  }, [request])
  useEffect(() => { if (target && !dialog.current.open) { dialog.current.showModal(); cancel.current?.focus() } }, [target])
  async function refresh(more = false) {
    setPending(current => ({ ...current, loading: true, error: '' }))
    try {
      const result = await request(`/api/admin/store/product-deletions${more && pending.next ? '?before=' + pending.next : ''}`, { signal: AbortSignal.timeout(12000) })
      if (!result || !alive.current) return
      if (!result.response.ok || result.data?.success !== true || !Array.isArray(result.data.records) || !result.data.records.every(valid)) throw Error()
      setPending(current => ({ records: [...(more ? current.records : []), ...result.data.records].filter((row, index, rows) => rows.findIndex(other => other.id === row.id) === index), next: result.data.next, loading: false, error: '' }))
    } catch { if (alive.current) setPending(current => ({ ...current, loading: false, error: 'Pending image cleanup could not be loaded. Retry this list.' })) }
  }
  async function open(record) {
    if (mutex.current) return
    mutex.current = true; setBusy(true); onBusy(true); setNotice(''); setTyped(''); setBlocked(false)
    try {
      if (record) { setTarget({ ...record, deleted: true }); return }
      const result = await request(`/api/admin/store/products/${productId}`, { signal: AbortSignal.timeout(12000) })
      if (!result || !alive.current) return
      if (!result.response.ok || !valid(result.data?.record) || result.data.record.id !== productId) throw Error('Saved product could not be loaded. Refresh the catalogue and pending cleanup before retrying.')
      const row = result.data.record
      setTarget({ id: row.id, title: row.title, sku: row.sku, version: row.version, deleted: false })
    } catch (error) { if (alive.current) setNotice(error.message || 'Deletion confirmation unavailable.') }
    finally { mutex.current = false; if (alive.current) { setBusy(false); onBusy(false) } }
  }
  async function remove(event) {
    event.preventDefault()
    if (mutex.current || !target || target.done || blocked || typed !== target.sku) return
    mutex.current = true; setBusy(true); onBusy(true); setNotice('Confirming permanent deletion and image cleanup…')
    try {
      const result = await request(`/api/admin/store/products/${target.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: target.title, sku: target.sku, version: target.version, confirmed: true }), signal: AbortSignal.timeout(25000) })
      if (!result || !alive.current) return
      const body = result.data
      const complete = result.response.status === 200 && body?.success === true && body.status === 'deleted' && body.product_deleted === true && body.cleanup_complete === true && body.receipt?.id === target.id
      const partial = result.response.status === 202 && body?.success === false && body.status === 'cleanup_pending' && body.product_deleted === true && body.cleanup_complete === false && body.receipt?.id === target.id
      if (!complete && !partial) { if (result.response.status === 409) setBlocked(true); throw Error(body?.message || 'Deletion could not be confirmed. Refresh the catalogue and pending cleanup before retrying; no complete deletion is confirmed.') }
      onDeleted(target.id)
      setTarget(current => ({ ...current, deleted: true, done: complete }))
      setNotice(complete ? body.message : 'Product permanently deleted. Image cleanup is still pending. Use Retry image cleanup; this operation is not fully complete.')
      await refresh()
    } catch (error) { if (alive.current) setNotice(error.message || 'Deletion outcome is unconfirmed. Reload before retrying.') }
    finally { mutex.current = false; if (alive.current) { setBusy(false); onBusy(false) } }
  }
  return <section className="admin-store-deletion" aria-labelledby="store-delete-section-title">
    <h3 id="store-delete-section-title">Permanent product deletion</h3><p>Deletes the product record, not an archive. Historical requests keep their submitted details. Only its currently attached, unshared Store image is removed; shared images are preserved.</p>
    {productId && <button type="button" className="admin-store-danger" disabled={busy} onClick={() => open()}>Delete product permanently</button>}
    <h4>Pending image cleanup</h4><p>These product records are already deleted. Cleanup remains incomplete until its retry succeeds.</p><button type="button" disabled={busy || pending.loading} onClick={() => refresh()}>Refresh pending cleanup</button>
    {pending.loading && <p role="status">Loading pending cleanup…</p>}{pending.error && <p role="alert">{pending.error}</p>}{!pending.loading && !pending.error && !pending.records.length && <p>No pending image cleanup.</p>}
    <ul>{pending.records.map(row => <li key={row.id}><strong>{row.title}</strong><span>SKU: {row.sku}</span><button type="button" disabled={busy} onClick={() => open(row)}>Review pending cleanup</button></li>)}</ul>{pending.next && <button type="button" disabled={busy || pending.loading} onClick={() => refresh(true)}>Load more pending cleanup</button>}
    <p role="status" aria-live="polite">{notice}</p>
    <dialog ref={dialog} className="admin-store-delete-dialog" aria-labelledby="store-delete-dialog-title" aria-describedby="store-delete-dialog-help" onCancel={event => { if (mutex.current) event.preventDefault() }} onClose={() => { setTarget(null); setTyped(''); setBlocked(false) }}>
      {target && <form onSubmit={remove} noValidate><h2 id="store-delete-dialog-title">{target.done ? 'Permanent deletion confirmed' : target.deleted ? 'Finish pending image cleanup' : 'Permanently delete this product?'}</h2><dl><dt>Saved title</dt><dd>{target.title}</dd><dt>Saved SKU</dt><dd>{target.sku}</dd></dl><p id="store-delete-dialog-help">{target.deleted ? 'The product record is already permanently deleted.' : 'This cannot be undone. The saved product will be deleted, including any unsaved editor changes being discarded.'} Historical requests and item snapshots remain; their live product reference is detached. Shared images remain. Complete deletion is confirmed only after required image cleanup.</p>
        {!target.done && <><label htmlFor="store-delete-confirm-sku">Type the saved SKU to confirm</label><input id="store-delete-confirm-sku" value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy || blocked} /><p className="admin-store-help">{target.sku}</p></>}
        <div className="admin-store-actions"><button type="button" ref={cancel} disabled={busy} onClick={() => dialog.current.close()}>{target.deleted ? 'Close' : 'Cancel deletion'}</button>{!target.done && <button className="admin-store-danger" type="submit" disabled={busy || blocked || typed !== target.sku}>{busy ? 'Working…' : target.deleted ? 'Retry image cleanup' : 'Confirm permanent deletion'}</button>}</div>
        {blocked && <p role="alert">The saved record changed. Close this confirmation, reload the saved product or cleanup list, and confirm again.</p>}<p role="status" aria-live="polite">{notice}</p>
      </form>}
    </dialog>
  </section>
}
