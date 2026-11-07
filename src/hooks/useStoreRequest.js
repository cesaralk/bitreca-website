import { useEffect, useState } from 'react'
import { orderLimits, orderSlug } from '../../shared/store-order-request'

const storageKey = 'bitreca.store.request.v1', changed = 'bitreca-store-request-changed'
function readSelection() {
  try {
    const rows = JSON.parse(sessionStorage.getItem(storageKey) || '[]')
    return Array.isArray(rows) && rows.length <= orderLimits.lines && rows.every(row => row && Object.keys(row).every(key => ['slug', 'quantity'].includes(key)) && orderSlug(row.slug) && Number.isSafeInteger(row.quantity) && row.quantity >= 1 && row.quantity <= orderLimits.perLine) && new Set(rows.map(row => row.slug)).size === rows.length && rows.reduce((n, row) => n + row.quantity, 0) <= orderLimits.totalQuantity ? rows : []
  } catch { return [] }
}
export function useStoreSelection() {
  const [items, setItems] = useState(readSelection)
  useEffect(() => { const update = () => setItems(readSelection()); window.addEventListener(changed, update); return () => window.removeEventListener(changed, update) }, [])
  function save(rows) {
    if (rows.length > orderLimits.lines || rows.some(row => !orderSlug(row.slug) || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > orderLimits.perLine) || rows.reduce((n, row) => n + row.quantity, 0) > orderLimits.totalQuantity) throw Error('Choose up to 10 products, 10 units per product and 50 units total.')
    try { sessionStorage.setItem(storageKey, JSON.stringify(rows)) } catch { throw Error('This browser cannot retain a selection. Enable session storage or contact Bitreca directly.') }
    setItems(rows); window.dispatchEvent(new Event(changed))
  }
  return { items, add: (slug, quantity) => { const rows = readSelection(), existing = rows.find(row => row.slug === slug); save(existing ? rows.map(row => row.slug === slug ? { ...row, quantity: row.quantity + quantity } : row) : [...rows, { slug, quantity }]) }, quantity: (slug, quantity) => save(readSelection().map(row => row.slug === slug ? { ...row, quantity } : row)), remove: slug => save(readSelection().filter(row => row.slug !== slug)), clear: () => save([]) }
}

export function useStoreRequestConfig() {
  const [attempt, setAttempt] = useState(0), [result, setResult] = useState({ key: -1, state: 'loading', enabled: false })
  useEffect(() => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000)
    let active = true
    async function load() {
      try {
        const response = await fetch('/api/store/order-requests/config', { cache: 'no-store', signal: controller.signal })
        const data = response.ok && response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null
        if (!data || typeof data.enabled !== 'boolean' || data.enabled && (typeof data.siteKey !== 'string' || !data.siteKey)) throw Error('config')
        if (active) setResult({ key: attempt, state: 'ready', enabled: data.enabled, siteKey: data.enabled ? data.siteKey : null })
      } catch { if (active) setResult({ key: attempt, state: 'error', enabled: false }) }
      finally { clearTimeout(timer) }
    }
    load(); return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [attempt])
  return { ...(result.key === attempt ? result : { state: 'loading', enabled: false }), retry: () => setAttempt(n => n + 1) }
}
