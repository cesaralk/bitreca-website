import { useEffect, useState } from 'react'
import { readStoreCategory, readStoreProduct } from '../utils/publicStore'

export default function usePublicStore(path, kind, valid = true) {
  const [attempt, setAttempt] = useState(0), [result, setResult] = useState({ key: '', status: 'loading', data: null })
  const key = `${path}:${attempt}`
  useEffect(() => {
    if (!valid) return
    let active = true
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000)
    async function load() {
      try {
        const response = await fetch(path, { cache: 'no-store', signal: controller.signal })
        if (response.status === 404) { if (active) setResult({ key, status: 'not-found', data: null }); return }
        if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) throw Error('request')
        const body = await response.json()
        if (body?.success !== true) throw Error('response')
        let data
        if (kind === 'product') {
          data = readStoreProduct(body.product, true)
          if (`/api/store/products/${data.slug}` !== path) throw Error('mismatch')
        } else {
          if (!Array.isArray(body[kind]) || !(body.nextCursor === null || typeof body.nextCursor === 'string' && body.nextCursor.length <= 300 && /^[A-Za-z0-9_-]+$/.test(body.nextCursor))) throw Error('response')
          const rows = body[kind].map(row => kind === 'categories' ? readStoreCategory(row) : readStoreProduct(row))
          if (new Set(rows.map(row => row.slug)).size !== rows.length) throw Error('duplicates')
          data = { rows, nextCursor: body.nextCursor, category: kind === 'products' && body.category !== null ? readStoreCategory(body.category) : null }
        }
        if (active) setResult({ key, status: 'ready', data })
      } catch { if (active) setResult({ key, status: 'error', data: null }) }
      finally { clearTimeout(timer) }
    }
    load()
    return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [key, path, kind, valid])
  return { ...(!valid ? { status: 'not-found', data: null } : result.key === key ? result : { status: 'loading', data: null }), retry: () => setAttempt(value => value + 1) }
}
