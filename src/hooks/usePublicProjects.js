import { useEffect, useState } from 'react'
import { readPublicProject, validProjectSlug } from '../utils/publicProjects'

// The existing Worker remains the authority for published-project visibility.
export default function usePublicProjects(slug) {
  const detail = slug !== undefined
  const valid = !detail || validProjectSlug(slug)
  const path = detail ? `/api/projects/${encodeURIComponent(slug)}` : '/api/projects'
  const [attempt, setAttempt] = useState(0)
  const key = `${path}:${attempt}`
  const [result, setResult] = useState({ key: '', status: 'loading', data: null })

  useEffect(() => {
    if (!valid) return
    let active = true
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 15000)
    async function load() {
      try {
        const response = await fetch(path, { signal: controller.signal, cache: 'no-store' })
        if (detail && response.status === 404) {
          if (active) setResult({ key, status: 'not-found', data: null })
          return
        }
        if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Project request failed')
        const body = await response.json()
        if (body?.success !== true || (!detail && !Array.isArray(body.projects))) throw new Error('Invalid project response')
        const data = detail ? readPublicProject(body.project) : body.projects.map(readPublicProject)
        if (detail && data.slug !== slug) throw new Error('Project slug mismatch')
        if (!detail && new Set(data.map((project) => project.slug)).size !== data.length) throw new Error('Duplicate project slugs')
        if (active) setResult({ key, status: 'ready', data })
      } catch {
        if (active) setResult({ key, status: 'error', data: null })
      } finally { window.clearTimeout(timer) }
    }
    load()
    return () => { active = false; controller.abort(); window.clearTimeout(timer) }
  }, [path, key, detail, slug, valid])

  const current = !valid ? { status: 'not-found', data: null }
    : result.key === key ? result : { status: 'loading', data: null }
  return { ...current, retry: () => setAttempt((value) => value + 1) }
}
