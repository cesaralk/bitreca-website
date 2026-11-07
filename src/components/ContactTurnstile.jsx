import { useEffect, useRef, useState } from 'react'

let loading
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    const timer = window.setTimeout(() => fail(), 12000)
    function fail() {
      window.clearTimeout(timer)
      script.remove()
      loading = undefined
      reject(new Error('Verification could not load'))
    }
    script.onerror = fail
    script.onload = () => {
      window.clearTimeout(timer)
      if (window.turnstile) resolve(window.turnstile)
      else fail()
    }
    document.head.append(script)
  })
  return loading
}

export default function ContactTurnstile({ siteKey, onToken, resetKey, action = 'contact_enquiry' }) {
  const container = useRef(null)
  const [failure, setFailure] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    let widget
    onToken('')
    loadTurnstile().then((api) => {
      if (!active) return
      widget = api.render(container.current, {
        sitekey: siteKey, action, theme: 'dark', size: 'compact',
        callback: (token) => { if (active) { onToken(token); setFailure('') } },
        'expired-callback': () => { if (active) { onToken(''); setFailure('Verification expired. Please verify again.') } },
        'error-callback': () => { if (active) { onToken(''); setFailure('Verification is unavailable. Retry, or use WhatsApp or email below.') } },
      })
    }).catch(() => { if (active) setFailure('Verification could not load. Retry, or use WhatsApp or email below.') })
    return () => { active = false; if (widget !== undefined) window.turnstile?.remove(widget) }
  }, [siteKey, onToken, resetKey, retry, action])
  return (
    <div className="contact-verification">
      <p className="contact-field-hint">Complete the security check before sending.</p>
      <div ref={container} />
      {failure && <><p role="status" className="contact-field-error">{failure}</p><button type="button" className="contact-text-link contact-retry" onClick={() => { setFailure(''); setRetry((value) => value + 1) }}>Retry verification</button></>}
    </div>
  )
}
