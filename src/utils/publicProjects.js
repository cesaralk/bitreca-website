export const validProjectSlug = (slug) => typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)

export function safeProjectUrl(value, allowRelative = false) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const text = value.trim()
  if ([...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || text.includes('\\')) return ''
  try {
    if (allowRelative && text.startsWith('/') && !text.startsWith('//')) {
      const url = new URL(text, 'https://project-image.invalid')
      return url.origin === 'https://project-image.invalid' ? `${url.pathname}${url.search}${url.hash}` : ''
    }
    const url = new URL(text)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}

export function readPublicProject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !validProjectSlug(value.slug) ||
      ['title', 'category', 'description'].some((key) => typeof value[key] !== 'string' || !value[key].trim())) {
    throw new Error('Invalid project response')
  }
  const project = { id: value.id, slug: value.slug }
  for (const key of ['title', 'category', 'description', 'image_url', 'overview', 'technologies', 'project_url', 'content']) {
    if (value[key] != null && typeof value[key] !== 'string') throw new Error('Invalid project field')
    project[key] = value[key]?.trim() || ''
  }
  return project
}
