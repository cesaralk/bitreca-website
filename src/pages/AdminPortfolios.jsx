import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAdminApi } from '../hooks/useAdminApi'
import { deletionConfirmed, deletionPhaseText, folderUploadData, mapLimited, mergeJobEvidence, portfolioAddress, portfolioDisplayAddress, portfolioState } from '../utils/portfolioAdmin'
import './AdminPortfolios.css'

const emptyForm = { name: '', slug: '', profession: '', description: '' }
const defaultCapabilities = { environment: 'production', requestsEnabled: false, cleanupEnabled: false, message: 'Production deletion requires a verified storage and ownership rollout. You can unpublish a portfolio while it remains unavailable.' }
const stateLabels = { published: 'Published', draft: 'Draft', pending: 'Pending deletion', blocked: 'Deletion blocked', finalized: 'Deleted' }
function ForestMark() {
  return <svg className="pf-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M10 25V12M22 25V7M3 19l7-12 7 12H3Zm11-3L22 3l8 13H14Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function Dialog({ title, children, onClose, busy }) {
  const element = useRef(null), titleId = useId()
  useEffect(() => {
    const dialog = element.current, previous = document.activeElement
    dialog.showModal()
    dialog.querySelector('input')?.focus()
    return () => { dialog.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  return <dialog className="pf-admin pf-modal" ref={element} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header className="pf-modal-head"><h2 id={titleId}>{title}</h2><button type="button" disabled={busy} aria-label="Close dialog" onClick={onClose}>×</button></header>
    <div className="pf-modal-body">{children}</div>
  </dialog>
}
function PortfolioCard({ portfolio, job, busy, message, fileStatus, onUploadHTML, onUploadFolder, onPublish, onEdit, onDelete, deletionEnabled, deployment }) {
  const htmlInput = useRef(null), folderInput = useRef(null)
  const state = portfolioState(portfolio, job), pending = portfolio.deletion_requested_at != null
  const disabled = Boolean(busy) || pending, address = portfolioAddress(portfolio, deployment)
  const addressLabel = portfolioDisplayAddress(portfolio, deployment)
  return <article className="pf-card" data-portfolio-id={portfolio.id} aria-label={portfolio.name} aria-busy={Boolean(busy)}>
    <div className="pf-card-top"><span className="pf-avatar" aria-hidden="true">{portfolio.name?.slice(0, 1).toUpperCase()}</span><span className={`pf-badge pf-badge-${state}`}>{stateLabels[state]}</span></div>
    <div className="pf-card-body"><h2>{portfolio.name}</h2><p className="pf-profession">{portfolio.profession || 'Personal portfolio'}</p>
      <div className="pf-address">{address && portfolio.status === 'published' && !pending ? <a href={address} target="_blank" rel="noopener noreferrer" aria-label={`Open ${portfolio.name}'s website`}>{addressLabel} ↗</a> : <span>{addressLabel}</span>}</div>
      {portfolio.description && <p className="pf-description">{portfolio.description}</p>}
      <div className="pf-meta"><span>Portfolio #{portfolio.id}</span><span className={fileStatus === true && !pending ? 'pf-ready' : ''}>{pending ? 'Website offline' : fileStatus === undefined ? 'Checking website…' : fileStatus === true ? 'Website files ready' : fileStatus === null ? 'File check unavailable' : 'Upload your website'}</span></div>
    </div>
    <div className="pf-card-actions">
      <div className="pf-upload-actions">
        <button type="button" className="pf-button pf-button-primary" disabled={disabled} onClick={() => htmlInput.current.click()}>↑ Upload HTML</button>
        <button type="button" className="pf-button" disabled={disabled} onClick={() => folderInput.current.click()}>↑ Upload Folder</button>
        <input ref={htmlInput} type="file" accept=".html" hidden disabled={disabled} aria-label={`HTML file for ${portfolio.name}`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onUploadHTML(portfolio, file) }} />
        <input ref={folderInput} type="file" webkitdirectory="" multiple hidden disabled={disabled} aria-label={`Website folder for ${portfolio.name}`} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) onUploadFolder(portfolio, files) }} />
      </div>
      <div className="pf-secondary-actions"><button type="button" className="pf-button pf-button-quiet" disabled={disabled} onClick={() => onEdit(portfolio)}>Edit details</button><button type="button" className="pf-button" disabled={disabled} onClick={() => onPublish(portfolio)}>{portfolio.status === 'published' ? 'Unpublish' : 'Publish'}</button></div>
      {busy && <p className="pf-operation" role="status"><span className="pf-spinner" aria-hidden="true" />{busy}</p>}
      {pending && <p className="pf-operation">{job?.error?.message || 'Publishing and uploads are locked. Follow the deletion job below.'}</p>}
      {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`pf-card-message ${message.kind === 'error' ? 'pf-card-message-error' : ''}`}>{message.text}</p>}
      <button type="button" className="pf-delete-link" disabled={disabled || !deletionEnabled} title={!deletionEnabled ? 'Deletion requests are disabled pending explicit approval.' : undefined} onClick={() => onDelete(portfolio)}>Delete Portfolio Permanently</button>
    </div>
  </article>
}

export default function AdminPortfolios() {
  const adminRequest = useAdminApi()
  const [portfolios, setPortfolios] = useState([]), [jobs, setJobs] = useState({}), [capabilities, setCapabilities] = useState(defaultCapabilities)
  const [files, setFiles] = useState({}), [operations, setOperations] = useState({}), [messages, setMessages] = useState({})
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [historyError, setHistoryError] = useState('')
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [page, setPage] = useState(0), [nextCursor, setNextCursor] = useState(null)
  const [editor, setEditor] = useState(null), [form, setForm] = useState(emptyForm), [formError, setFormError] = useState(''), [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null), [confirmation, setConfirmation] = useState('')
  const locks = useRef(new Set()), formLock = useRef(false), fileCache = useRef(new Map())
  const messageFor = (id, kind, text) => setMessages(current => ({ ...current, [id]: { kind, text } }))
  const loadOverview = useCallback(async () => {
    const [list, settings, history] = await Promise.all([
      adminRequest('/api/admin/portfolios'), adminRequest('/api/admin/portfolio-deletion-capabilities').catch(() => null),
      adminRequest('/api/admin/portfolio-deletion-jobs').catch(() => null),
    ])
    if (!list) return []
    if (!list.response.ok || !list.data?.success) throw new Error(list.data?.message || 'Could not load portfolios.')
    const records = list.data.portfolios || []
    setPortfolios(records)
    setCapabilities(settings?.response?.ok && settings.data?.success ? settings.data : defaultCapabilities)
    if (history?.response?.ok && history.data?.success) {
      setJobs(current => mergeJobEvidence(current, history.data.jobs))
      setNextCursor(history.data.nextCursor)
      setHistoryError('')
    } else {
      // The production backend has not enabled deletion. Its absent history endpoint
      // must not be displayed as a broken admin feature.
      setHistoryError(settings?.response?.ok && settings?.data?.requestsEnabled
        ? 'Deletion history is temporarily unavailable.' : '')
      setJobs({})
      setNextCursor(null)
    }
    setError('')
    return records
  }, [adminRequest])
  useEffect(() => {
    let mounted = true
    Promise.resolve().then(() => mounted ? loadOverview() : null).catch(() => { if (mounted) setError('Could not load portfolios. Please try refreshing.') }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [loadOverview])
  const filtered = useMemo(() => portfolios.filter(portfolio => {
    const term = search.trim().toLowerCase()
    const matches = !term || [portfolio.name, portfolio.slug, portfolio.profession].some(value => value?.toLowerCase().includes(term))
    const pending = portfolio.deletion_requested_at != null
    return matches && (filter === 'all' || (filter === 'pending' ? pending : !pending && portfolio.status === filter))
  }), [portfolios, search, filter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / 6)), currentPage = Math.min(page, pageCount - 1)
  const visible = useMemo(() => filtered.slice(currentPage * 6, currentPage * 6 + 6), [filtered, currentPage])
  useEffect(() => {
    let canceled = false
    mapLimited(visible.filter(portfolio => portfolio.deletion_requested_at == null), 3, async portfolio => {
      const signature = portfolio.storage_prefix + ':' + portfolio.updated_at
      if (fileCache.current.get(portfolio.id) === signature) return
      fileCache.current.set(portfolio.id, signature)
      let value = null
      try {
        const result = await adminRequest(`/api/admin/portfolios/${portfolio.id}/file-check`)
        if (result?.response?.ok && result.data?.success) value = result.data.fileExists === true
      } catch { /* Unknown is distinct from a missing website. */ }
      if (fileCache.current.get(portfolio.id) === signature) setFiles(current => ({ ...current, [portfolio.id]: value }))
    })
    mapLimited(visible.filter(portfolio => portfolio.deletion_job_id), 3, async portfolio => {
      try {
        const result = await adminRequest(`/api/admin/portfolio-deletion-jobs/${portfolio.deletion_job_id}`)
        if (!canceled && result?.response?.ok && result.data?.job) setJobs(current => mergeJobEvidence(current, [result.data.job]))
      } catch { /* Existing evidence stays visible until the next refresh. */ }
    })
    return () => { canceled = true }
  }, [adminRequest, visible])
  const hasPending = portfolios.some(portfolio => portfolio.deletion_requested_at != null)
  useEffect(() => {
    if (!hasPending) return undefined
    const timer = setInterval(() => { if (document.visibilityState === 'visible') loadOverview().catch(() => setHistoryError('Could not refresh deletion progress. The last confirmed state is shown.')) }, 15000)
    return () => clearInterval(timer)
  }, [hasPending, loadOverview])
  async function refresh() {
    fileCache.current.clear()
    setFiles({})
    try { await loadOverview() } catch { setError('Refresh failed. The last loaded data is still shown.') }
  }
  async function runOperation(portfolio, label, action, success, onSuccess) {
    if (locks.current.has(portfolio.id)) return
    locks.current.add(portfolio.id)
    setOperations(current => ({ ...current, [portfolio.id]: label }))
    setMessages(current => ({ ...current, [portfolio.id]: null }))
    try {
      const result = await action()
      if (!result) return
      if (result.response.status === 409) {
        let text = 'Another operation changed this portfolio or its active website version. This operation was not applied.'
        try { await loadOverview(); text += ' Data has been refreshed. Review it before retrying.' }
        catch { text += ' Refresh failed; reload before retrying.' }
        messageFor(portfolio.id, 'error', text)
        return
      }
      if (!result.response.ok || !result.data?.success) throw new Error(result.data?.message || 'The operation could not be confirmed. Refresh before retrying.')
      onSuccess?.(result.data)
      const successText = typeof success === 'function' ? success(result.data) : success
      messageFor(portfolio.id, 'success', successText)
      try { await loadOverview() } catch { messageFor(portfolio.id, 'success', successText + ' Refresh is unavailable; reload to see the latest state.') }
    } catch (failure) {
      messageFor(portfolio.id, 'error', failure.message || 'The operation failed. Please retry.')
      try { await loadOverview() } catch { /* Preserve the error and last known state. */ }
    } finally {
      locks.current.delete(portfolio.id)
      setOperations(current => ({ ...current, [portfolio.id]: null }))
    }
  }
  function canUpload(portfolio) {
    return !locks.current.has(portfolio.id) && portfolio.deletion_requested_at == null && window.confirm(portfolio.status === 'published'
      ? `Replace the published website for ${portfolio.name}? The new version becomes live immediately after a successful upload.`
      : `Upload a website version for ${portfolio.name}? If this website is published by another administrator, the new version becomes live immediately.`)
  }
  async function uploadHTML(portfolio, file) {
    if (!canUpload(portfolio)) return
    const body = new FormData(); body.append('file', file)
    await runOperation(portfolio, 'Uploading HTML and preserving assets…', () => adminRequest(`/api/admin/portfolios/${portfolio.id}/upload`, { method: 'POST', body }),
      'HTML activated successfully. Existing CSS, JavaScript, and images were preserved.', () => setFiles(current => ({ ...current, [portfolio.id]: true })))
  }
  async function uploadFolder(portfolio, selected) {
    if (!canUpload(portfolio)) return
    try {
      const body = folderUploadData(selected)
      await runOperation(portfolio, 'Uploading and validating website folder…', () => adminRequest(`/api/admin/portfolios/${portfolio.id}/upload-folder`, { method: 'POST', body }),
        'Website folder uploaded and activated successfully.', () => setFiles(current => ({ ...current, [portfolio.id]: true })))
    } catch (failure) { messageFor(portfolio.id, 'error', failure.message) }
  }
  async function togglePublication(portfolio) {
    if (locks.current.has(portfolio.id) || portfolio.deletion_requested_at != null) return
    const next = portfolio.status === 'published' ? 'draft' : 'published'
    if (!window.confirm(`${next === 'published' ? 'Publish' : 'Unpublish'} ${portfolio.name}?`)) return
    await runOperation(portfolio, next === 'published' ? 'Publishing website…' : 'Unpublishing website…', () => adminRequest(`/api/admin/portfolios/${portfolio.id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
    }), next === 'published' ? 'Website published successfully.' : 'Website unpublished successfully.')
  }
  function editPortfolio(portfolio) {
    if (portfolio && (locks.current.has(portfolio.id) || portfolio.deletion_requested_at != null)) return
    setEditor(portfolio || {})
    setForm(portfolio ? { name: portfolio.name || '', slug: portfolio.slug || '', profession: portfolio.profession || '', description: portfolio.description || '' } : emptyForm)
    setFormError('')
  }
  async function savePortfolio(event) {
    event.preventDefault()
    if (formLock.current || (editor.id && locks.current.has(editor.id))) return
    formLock.current = true
    if (editor.id) {
      locks.current.add(editor.id)
      setOperations(current => ({ ...current, [editor.id]: 'Saving portfolio details…' }))
    }
    setSaving(true); setFormError('')
    try {
      const result = await adminRequest(editor.id ? `/api/admin/portfolios/${editor.id}` : '/api/admin/portfolios', {
        method: editor.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      if (!result) return
      if (!result.response.ok || !result.data?.success) {
        if (result.response.status === 409) await loadOverview()
        throw new Error(result.data?.message || 'Could not save this portfolio.')
      }
      setEditor(null)
      try { await loadOverview() } catch { setError('Portfolio details were saved, but refresh failed. Please reload.') }
    } catch (failure) { setFormError(failure.message || 'Could not save this portfolio.') }
    finally {
      formLock.current = false
      if (editor.id) { locks.current.delete(editor.id); setOperations(current => ({ ...current, [editor.id]: null })) }
      setSaving(false)
    }
  }
  async function confirmDeletion(event) {
    event.preventDefault()
    if (!capabilities.requestsEnabled || !deletionConfirmed(deleting, confirmation)) return
    await runOperation(deleting, 'Requesting permanent deletion…', () => adminRequest(`/api/admin/portfolios/${deleting.id}`, {
      method: 'DELETE', headers: { 'X-Portfolio-Delete-Confirm': String(deleting.id) },
    }), 'Deletion requested. The website is offline; storage cleanup may continue asynchronously.', data => {
      setPortfolios(current => current.map(portfolio => portfolio.id === deleting.id ? { ...portfolio, status: 'draft', deletion_requested_at: Date.now() / 1000, deletion_job_id: data.job.id } : portfolio))
      setJobs(current => mergeJobEvidence(current, [data.job]))
      setDeleting(null); setConfirmation('')
    })
  }
  function beginDeletion(portfolio) {
    if (!capabilities.requestsEnabled || locks.current.has(portfolio.id) || portfolio.deletion_requested_at != null) return
    setMessages(current => ({ ...current, [portfolio.id]: null }))
    setDeleting(portfolio)
    setConfirmation('')
  }
  async function retryJob(job) {
    await runOperation({ id: job.portfolio_id }, 'Queuing verification retry…', () => adminRequest(`/api/admin/portfolio-deletion-jobs/${job.id}/retry`, { method: 'POST' }),
      data => data.message || 'Retry requested. Ownership and writer safety checks will run again.')
  }
  async function olderJobs() {
    if (!nextCursor) return
    try {
      const result = await adminRequest(`/api/admin/portfolio-deletion-jobs?before=${encodeURIComponent(nextCursor)}`)
      if (!result?.response?.ok || !result.data?.success) throw new Error()
      setJobs(current => mergeJobEvidence(current, result.data.jobs))
      setNextCursor(result.data.nextCursor)
    } catch { setHistoryError('Could not load older deletion jobs.') }
  }
  const published = portfolios.filter(portfolio => portfolio.status === 'published' && portfolio.deletion_requested_at == null).length
  const pending = portfolios.filter(portfolio => portfolio.deletion_requested_at != null).length
  const jobList = Object.values(jobs).sort((one, two) => two.created_at - one.created_at || two.id.localeCompare(one.id))
  return <main className="pf-admin">
    <header className="pf-hero"><div><p className="pf-eyebrow"><ForestMark /> Bitreca / PortfolioForest</p><h1>A home for every portfolio.</h1><p>Manage your customers’ websites, publish new work, and keep every version under control.</p></div><button type="button" className="pf-button pf-button-primary" onClick={() => editPortfolio(null)}>＋ Add Portfolio</button></header>
    <section className="pf-stats" aria-label="Portfolio overview">{[['All portfolios', portfolios.length], ['Published', published], ['Drafts', portfolios.length - published - pending], ['Pending deletion', pending]].map(([label, count]) => <div className="pf-stat" key={label}><span>{label}</span><strong>{count}</strong>{label === 'Published' && <small>Live websites</small>}</div>)}</section>
    {!capabilities.requestsEnabled && <p className="pf-notice"><span aria-hidden="true">ⓘ</span><span><strong>Permanent deletion is disabled.</strong> {capabilities.message}</span></p>}
    {capabilities.requestsEnabled && !capabilities.cleanupEnabled && <p className="pf-notice"><span><strong>Automatic cleanup is paused.</strong> Deletion requests take websites offline immediately. Storage remains until execution is separately authorized.</span></p>}
    {capabilities.environment === 'staging' && <p className="pf-notice" role="status">Staging environment. Website previews open only on the approved staging host.</p>}
    {error && <p role="alert" className="pf-notice pf-notice-error">{error}</p>}
    <div className="pf-toolbar"><label className="pf-search"><span className="pf-sr">Search portfolios</span><input type="search" placeholder="Search customer, subdomain, or profession…" value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} /></label><label><span className="pf-sr">Filter publication status</span><select value={filter} onChange={event => { setFilter(event.target.value); setPage(0) }}><option value="all">All portfolios</option><option value="published">Published</option><option value="draft">Drafts</option><option value="pending">Pending deletion</option></select></label><button type="button" className="pf-button pf-button-quiet" onClick={refresh}>↻ Refresh</button></div>
    {loading ? <div className="pf-empty" role="status"><span className="pf-spinner" aria-hidden="true" /><p>Loading your portfolios…</p></div> : !filtered.length ? <div className="pf-empty"><ForestMark /><h2>{portfolios.length ? 'No matching portfolios' : 'Your next customer starts here'}</h2><p>{portfolios.length ? 'Try another name or change the status filter.' : 'Create a portfolio, upload its website, then publish when it is ready.'}</p>{!portfolios.length && <button type="button" className="pf-button pf-button-primary" onClick={() => editPortfolio(null)}>Add your first portfolio</button>}</div> : <section className="pf-grid" aria-label="Customer portfolios">{visible.map(portfolio => <PortfolioCard key={portfolio.id} portfolio={portfolio} job={jobs[portfolio.deletion_job_id]} busy={operations[portfolio.id]} message={messages[portfolio.id]} fileStatus={files[portfolio.id]} deployment={capabilities} deletionEnabled={capabilities.requestsEnabled} onUploadHTML={uploadHTML} onUploadFolder={uploadFolder} onPublish={togglePublication} onEdit={editPortfolio} onDelete={beginDeletion} />)}</section>}
    {!loading && filtered.length > 0 && <div className="pf-pagination"><span>Showing {currentPage * 6 + 1}–{Math.min((currentPage + 1) * 6, filtered.length)} of {filtered.length} portfolios</span><div><button type="button" className="pf-button pf-button-quiet" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="pf-button pf-button-quiet" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}
    <section className="pf-jobs" aria-label="Deletion activity"><div className="pf-section-heading"><div><h2>Deletion activity</h2><p>Verified progress, retained receipts, and anything that needs your attention.</p></div></div>{historyError && <p className="pf-notice pf-notice-error" role="alert">{historyError}</p>}{!jobList.length && !historyError && <p className="pf-notice">No deletion jobs. Your active portfolios are shown above.</p>}{jobList.map(job => <article className="pf-job" key={job.id}><div className="pf-job-heading"><strong>Portfolio #{job.portfolio_id}</strong><span className={`pf-badge pf-badge-${job.phase === 'finalized' ? 'finalized' : job.phase === 'blocked' ? 'blocked' : 'pending'}`}>{deletionPhaseText[job.phase] || 'Waiting for verification'}</span></div><p>{job.phase === 'finalized' ? 'Permanent deletion is complete. Ownership tombstones and deletion evidence are retained.' : job.error?.message || 'The website is offline. Cleanup can resume only after all safety checks pass.'}</p>{job.progress && <p>{job.progress.empty_prefixes || 0} of {job.progress.allocations || 0} storage allocations verified empty · {job.progress.confirmed_objects || 0} unique object keys confirmed removed</p>}{job.phase !== 'finalized' && <button type="button" className="pf-button pf-button-quiet" disabled={Boolean(operations[job.portfolio_id])} onClick={() => retryJob(job)}>Recheck / retry safely</button>}{messages[job.portfolio_id] && <p role={messages[job.portfolio_id].kind === 'error' ? 'alert' : 'status'}>{messages[job.portfolio_id].text}</p>}</article>)}{nextCursor && <button type="button" className="pf-button pf-button-quiet" onClick={olderJobs}>Load older jobs</button>}</section>
    {editor && <Dialog title={editor.id ? 'Edit portfolio details' : 'Create a portfolio'} onClose={() => setEditor(null)} busy={saving}><form onSubmit={savePortfolio}>{formError && <p role="alert" className="pf-notice pf-notice-error">{formError}</p>}{[['name', 'Customer / portfolio name', 200], ['slug', 'Portfolio subdomain', 100], ['profession', 'Profession', 200]].map(([name, label, maxLength]) => <div className="pf-field" key={name}><label htmlFor={`pf-${name}`}>{label}</label><input id={`pf-${name}`} name={name} value={form[name]} maxLength={maxLength} required={name !== 'profession'} disabled={saving} pattern={name === 'slug' ? '[a-z0-9-]+' : undefined} onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))} />{name === 'slug' && <small>{form.slug || 'customer'}.bitreca.com · lowercase letters, numbers, and hyphens</small>}</div>)}<div className="pf-field"><label htmlFor="pf-description">Description</label><textarea id="pf-description" name="description" rows="3" maxLength="2000" value={form.description} disabled={saving} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></div><div className="pf-modal-actions"><button type="button" className="pf-button pf-button-quiet" disabled={saving} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="pf-button pf-button-primary" disabled={saving}>{saving ? 'Saving…' : editor.id ? 'Save changes' : 'Create portfolio'}</button></div></form></Dialog>}
    {deleting && <Dialog title="Permanently delete this portfolio?" onClose={() => setDeleting(null)} busy={Boolean(operations[deleting.id])}><form onSubmit={confirmDeletion}><p>This immediately takes the website offline and locks uploads and publishing. Cleanup of all verified owned versions runs asynchronously when authorized. Once cleanup starts, deleted files cannot be recovered. There is no cancellation.</p><div className="pf-deletion-identity"><strong>{deleting.name}</strong><span>{portfolioDisplayAddress(deleting, capabilities)} · Portfolio #{deleting.id}</span></div><div className="pf-field"><label htmlFor="pf-delete-confirm">Type the exact portfolio ID <code>{deleting.id}</code> to confirm</label><input id="pf-delete-confirm" autoComplete="off" inputMode="numeric" value={confirmation} disabled={Boolean(operations[deleting.id])} onChange={event => setConfirmation(event.target.value)} /></div>{messages[deleting.id]?.kind === 'error' && <p role="alert" className="pf-notice pf-notice-error">{messages[deleting.id].text}</p>}<div className="pf-modal-actions"><button type="button" className="pf-button pf-button-quiet" disabled={Boolean(operations[deleting.id])} onClick={() => setDeleting(null)}>Keep portfolio</button><button type="submit" className="pf-button pf-button-danger" disabled={!capabilities.requestsEnabled || !deletionConfirmed(deleting, confirmation) || Boolean(operations[deleting.id])}>{operations[deleting.id] ? 'Requesting deletion…' : 'Delete Portfolio Permanently'}</button></div></form></Dialog>}
  </main>
}
