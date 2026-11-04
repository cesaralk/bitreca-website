import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ContactTurnstile from '../components/ContactTurnstile'
import { contactInterests as interests, contactRecipient, contactWhatsAppUrl, formatContactBrief, validateContact as validate } from '../../shared/contact-enquiry'
import './Contact.css'

const emptyFields = { name: '', email: '', service: '', message: '' }

function Contact() {
  const [fields, setFields] = useState(emptyFields)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ kind: 'idle', text: '' })
  const [manualBrief, setManualBrief] = useState('')
  const formRef = useRef(null)
  const copying = useRef(false)
  const [delivery, setDelivery] = useState({ enabled: false, loading: true })
  const [turnstileToken, setTurnstileToken] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [accepted, setAccepted] = useState(false)
  const requestId = useRef(null)
  const busy = status.kind === 'copying' || status.kind === 'sending'

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 6000)
    let active = true
    fetch('/api/contact/config', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const config = response.ok && response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null
        if (active) setDelivery({ loading: false, enabled: config?.enabled === true && typeof config.siteKey === 'string' && Boolean(config.siteKey), siteKey: config?.siteKey })
      }).catch(() => { if (active) setDelivery({ loading: false, enabled: false }) })
      .finally(() => window.clearTimeout(timer))
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [])

  function updateField(event) {
    const { name, value } = event.target
    setFields((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
    setStatus({ kind: 'idle', text: '' })
    setManualBrief('')
    setAccepted(false)
    requestId.current = null
  }

  function checkField(event) {
    const { name } = event.target
    setErrors((current) => ({ ...current, [name]: validate(fields)[name] }))
  }

  async function prepareBrief(event) {
    event.preventDefault()
    if (copying.current) return
    const nextErrors = validate(fields)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setStatus({ kind: 'invalid', text: 'Please check the highlighted fields before continuing.' })
      formRef.current.elements.namedItem(Object.keys(nextErrors)[0]).focus()
      return
    }

    const brief = formatContactBrief(fields)

    copying.current = true
    setManualBrief('')
    setStatus({ kind: 'copying', text: 'Copying your project brief… This action does not send email.' })
    let timeout
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await Promise.race([
        navigator.clipboard.writeText(brief),
        new Promise((_, reject) => { timeout = window.setTimeout(() => reject(new Error('Clipboard timeout')), 10000) }),
      ])
      setStatus({ kind: 'copied', text: 'Project brief copied to your clipboard. Copying does not send it to Bitreca.' })
    } catch {
      setManualBrief(brief)
      setStatus({ kind: 'error', text: 'Your browser could not confirm the copy. Select the prepared text below and copy it manually. This action does not send email.' })
    } finally {
      window.clearTimeout(timeout)
      copying.current = false
    }
  }

  async function sendEnquiry(event) {
    event.preventDefault()
    if (copying.current || accepted) return
    const nextErrors = validate(fields)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setStatus({ kind: 'invalid', text: 'Please check the highlighted fields before sending.' })
      formRef.current.elements.namedItem(Object.keys(nextErrors)[0]).focus()
      return
    }
    if (!delivery.enabled || !turnstileToken) {
      setStatus({ kind: 'error', text: delivery.enabled ? 'Complete the security check before sending.' : 'Online sending is unavailable. Use WhatsApp, email or copy your brief below.' })
      return
    }
    copying.current = true
    requestId.current ||= crypto.randomUUID()
    setStatus({ kind: 'sending', text: 'Sending your enquiry for acceptance…' })
    try {
      const response = await fetch('/api/enquiries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, turnstileToken, requestId: requestId.current }),
        signal: AbortSignal.timeout(25000),
      })
      const result = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null
      if (response.status === 202 && result?.status === 'accepted' && typeof result.reference === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.reference)) {
        setAccepted(true)
        setStatus({ kind: 'accepted', text: `Your enquiry was accepted for email delivery to ${contactRecipient}. Inbox receipt is not yet confirmed. Reference: ${result.reference}` })
      } else if (response.status === 422 && result?.status === 'invalid' && result.errors) {
        const safeErrors = Object.fromEntries(Object.entries(result.errors).filter(([key, value]) => Object.hasOwn(emptyFields, key) && typeof value === 'string'))
        setErrors(safeErrors)
        setStatus({ kind: 'invalid', text: 'Please check your details and try again.' })
        if (Object.keys(safeErrors).length) window.requestAnimationFrame(() => formRef.current?.elements.namedItem(Object.keys(safeErrors)[0])?.focus())
      } else {
        const message = response.status === 429 ? 'Too many attempts. Please wait at least a minute before trying again.'
          : result?.status === 'invalid_challenge' ? 'The security check expired or was not valid. Complete a fresh check and try again.'
            : response.status === 503 ? 'Online sending is unavailable. Please use WhatsApp, direct email or copy your brief.'
              : 'Email acceptance could not be confirmed. Your entries are preserved. Retry with a fresh security check or use the contact options below.'
        setStatus({ kind: 'error', text: message })
      }
    } catch {
      setStatus({ kind: 'error', text: 'Email acceptance could not be confirmed. Your entries are preserved. Retry with a fresh security check or use WhatsApp or email. A timed-out request may still have been accepted.' })
    } finally {
      copying.current = false
      setTurnstileToken('')
      setResetKey((value) => value + 1)
    }
  }

  return (
    <main className="contact-page">
      <div className="contact-container">
        <header className="contact-heading">
          <p className="contact-eyebrow">BITRECA / CONTACT</p>
          <h1>Big idea or first question.<br /><span>Start here.</span></h1>
          <p className="contact-intro">Tell us what you want to make possible. A clear problem, an early idea or a few questions are all good starting points.</p>
        </header>

        <div className="contact-layout">
          <aside className="contact-guide" aria-labelledby="contact-guide-title">
            <p className="contact-eyebrow">SHAPE YOUR PROJECT</p>
            <h2 id="contact-guide-title">A little context.<br />A clearer next step.</h2>
            <p>You do not need a finished specification. Focus on what matters to you.</p>
            <ol>
              <li><h3>What do you want to build?</h3><p>A website, application, software tool or game. If you are still deciding, that is fine too.</p></li>
              <li><h3>Who will use it?</h3><p>Describe the people it is for and the problem you want it to solve.</p></li>
              <li><h3>What should we keep in mind?</h3><p>Include any priorities, existing tools, target budget or deadline you would like to discuss.</p></li>
            </ol>
            <Link to="/services" className="contact-text-link">Explore our services <span aria-hidden="true">↗</span></Link>
            <div className="contact-direct">
              <a className="contact-text-link" href={contactWhatsAppUrl(fields)} target="_blank" rel="noopener noreferrer">WhatsApp: +961 70 864 221 <span aria-hidden="true">↗</span></a>
              <p>Review the prefilled project introduction and send it yourself in WhatsApp. Your form details are not included automatically.</p>
              <a className="contact-text-link" href={`mailto:${contactRecipient}`}>{contactRecipient}</a>
            </div>
          </aside>

          <section className="contact-form-panel" aria-labelledby="contact-form-title">
            <h2 id="contact-form-title">Your project enquiry</h2>
            <p className="contact-form-intro">All fields are required. Choose “Not sure yet” if you need help finding a starting point.</p>
            <div className="contact-availability" id="contact-availability">
              <strong>{delivery.loading ? 'Checking email availability…' : delivery.enabled ? 'Send your enquiry to info@bitreca.com.' : 'Online sending is currently unavailable.'}</strong>
              <p>{delivery.enabled ? 'Complete the security check, then send. You can also contact us directly or copy your brief.' : 'Use WhatsApp or info@bitreca.com, or prepare and copy your project brief below. Copying does not send a message.'}</p>
            </div>

            <form ref={formRef} onSubmit={sendEnquiry} noValidate aria-describedby="contact-availability contact-privacy">
              <fieldset disabled={busy}>
                <legend className="contact-sr-only">Your details and project</legend>
                <div className="contact-field-row">
                  <div className="contact-field">
                    <label htmlFor="contact-name">Name <span>(required)</span></label>
                    <input id="contact-name" name="name" autoComplete="name" required maxLength={100} value={fields.name} onChange={updateField} onBlur={checkField} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'contact-name-error' : undefined} />
                    {errors.name && <p className="contact-field-error" id="contact-name-error">{errors.name}</p>}
                  </div>
                  <div className="contact-field">
                    <label htmlFor="contact-email">Email <span>(required)</span></label>
                    <input id="contact-email" name="email" type="email" autoComplete="email" inputMode="email" spellCheck={false} required maxLength={254} value={fields.email} onChange={updateField} onBlur={checkField} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'contact-email-error' : undefined} />
                    {errors.email && <p className="contact-field-error" id="contact-email-error">{errors.email}</p>}
                  </div>
                </div>
                <div className="contact-field">
                  <label htmlFor="contact-service">Service interest <span>(required)</span></label>
                  <select id="contact-service" name="service" required value={fields.service} onChange={updateField} onBlur={checkField} aria-invalid={Boolean(errors.service)} aria-describedby={errors.service ? 'contact-service-error' : undefined}>
                    <option value="">Select a service</option>
                    {interests.map((interest) => <option key={interest} value={interest}>{interest}</option>)}
                  </select>
                  {errors.service && <p className="contact-field-error" id="contact-service-error">{errors.service}</p>}
                </div>
                <div className="contact-field">
                  <label htmlFor="contact-message">Project message <span>(required)</span></label>
                  <p className="contact-field-hint" id="contact-message-hint">What would you like to build or improve? Use 20–5,000 characters.</p>
                  <textarea id="contact-message" name="message" rows={7} required minLength={20} maxLength={5000} value={fields.message} onChange={updateField} onBlur={checkField} aria-invalid={Boolean(errors.message)} aria-describedby={`contact-message-hint contact-message-count${errors.message ? ' contact-message-error' : ''}`} />
                  <p className="contact-character-count" id="contact-message-count">{fields.message.length.toLocaleString('en-US')} / 5,000 characters</p>
                  {errors.message && <p className="contact-field-error" id="contact-message-error">{errors.message}</p>}
                </div>
                <p className="contact-privacy" id="contact-privacy">Please leave out passwords, payment details and other sensitive information. Sending shares these details with Bitreca through Resend. The security check uses Cloudflare Turnstile. Copying only puts your brief on your clipboard.</p>
                {delivery.enabled && <ContactTurnstile siteKey={delivery.siteKey} onToken={setTurnstileToken} resetKey={resetKey} />}
                <div className="contact-actions">
                  <button className="contact-button" type="submit" disabled={busy || !delivery.enabled || accepted} aria-busy={status.kind === 'sending'}>{status.kind === 'sending' ? 'Sending enquiry…' : accepted ? 'Accepted for delivery' : 'Send enquiry'} <span aria-hidden="true">↗</span></button>
                  <button className="contact-secondary-link contact-copy-button" type="button" onClick={prepareBrief} disabled={busy} aria-busy={status.kind === 'copying'}>{status.kind === 'copying' ? 'Copying brief…' : 'Copy project brief'}</button>
                </div>
              </fieldset>
              <div className={`contact-status contact-status-${status.kind}`} role="status" aria-live="polite" aria-atomic="true">{status.text}</div>
              {manualBrief && <div className="contact-manual-copy"><label htmlFor="contact-prepared-brief">Prepared brief — copy manually</label><textarea id="contact-prepared-brief" value={manualBrief} readOnly rows={9} onFocus={(event) => event.target.select()} /><p>Your entries are still above if you want to edit and try again.</p></div>}
            </form>
          </section>
        </div>

        <section className="contact-next" aria-labelledby="contact-next-title">
          <div><p className="contact-eyebrow">STILL EXPLORING?</p><h2 id="contact-next-title">Find the right starting point.</h2><p>See how website development, applications, custom software and games can fit your idea.</p></div>
          <Link to="/services" className="contact-secondary-link">View services <span aria-hidden="true">↗</span></Link>
        </section>
      </div>
    </main>
  )
}

export default Contact
