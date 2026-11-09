import { canonicalUrl, escapeMarkup, normalizeSeoPath, pageSeo, privateSeoPath, projectPath, projectSeo, projectSlug, publicPages, robotsValue, seoTags, siteOrigin } from '../shared/seo.js'

// Only public metadata reads. No mutation, auth, catalogue, hosting or deletion calls.
export async function handleSeo(request, env) {
  if (!['GET', 'HEAD'].includes(request.method)) return null
  const url = new URL(request.url), path = normalizeSeoPath(url.pathname), match = projectPath(path)
  const production = ['bitreca.com', 'www.bitreca.com'].includes(url.hostname)
  if (path === '/robots.txt') return new Response(request.method === 'HEAD' ? null : production
    ? `User-agent: *\nAllow: /\nDisallow: /api/admin/\nDisallow: /api/enquiries\nDisallow: /api/store/order-requests\n\n# Private HTML pages use noindex; public APIs remain crawlable for rendering.\nSitemap: ${siteOrigin}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
  if (path === '/sitemap.xml') {
    try {
      const result = await env.bitreca_db.prepare("SELECT slug FROM projects WHERE status = 'published' ORDER BY slug").all()
      if (result.success !== true || !Array.isArray(result.results) || result.results.length > 45000) throw Error('sitemap')
      const paths = [...Object.keys(publicPages), ...result.results.filter(row => projectSlug(row.slug)).map(row => '/projects/' + row.slug)]
      const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(paths)].map(path => `<url><loc>${escapeMarkup(siteOrigin + path)}</loc></url>`).join('')}</urlset>`
      return new Response(request.method === 'HEAD' ? null : body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
    } catch { return new Response(request.method === 'HEAD' ? null : 'Sitemap temporarily unavailable.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '300' } }) }
  }
  // Store metadata stays factual and generic. No changes to its publication or intake.
  const storeDetail = /^\/store\/[^/]+$/.test(path)
  if (!Object.hasOwn(publicPages, path) && !privateSeoPath(path) && !match && !storeDetail) return null
  let seo = pageSeo(path), status = 200
  if (storeDetail) seo = { ...pageSeo('/store'), path, title: 'Store Product Information | BITRECA' }
  if (match) {
    try {
      const project = projectSlug(match[1]) ? await env.bitreca_db.prepare("SELECT slug,title,description FROM projects WHERE slug = ? AND status = 'published' LIMIT 1").bind(match[1]).first() : null
      if (project) seo = projectSeo(project)
      else { seo = { ...seo, title: 'Project Not Found | BITRECA' }; status = 404 }
    } catch { seo = { ...seo, title: 'Project Unavailable | BITRECA' }; status = 503 }
  }
  if (!production) seo = { ...seo, noindex: true }
  const asset = await env.ASSETS.fetch(new Request(new URL('/', url), { method: 'GET', headers: { Accept: 'text/html' } }))
  if (!asset.ok || !asset.headers.get('Content-Type')?.includes('text/html')) return new Response('Page temporarily unavailable.', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const headers = new Headers(asset.headers)
  for (const name of ['Content-Length', 'Content-Encoding', 'ETag', 'Last-Modified']) headers.delete(name)
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Robots-Tag', robotsValue(seo))
  headers.set('Link', `<${canonicalUrl(seo)}>; rel="canonical"`)
  if (status === 503) headers.set('Retry-After', '300')
  const response = new globalThis.HTMLRewriter()
    .on('title, meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], [data-bitreca-seo]', { element(element) { element.remove() } })
    .on('head', { element(element) { element.append(seoTags(seo), { html: true }) } })
    .transform(new Response(asset.body, { status, headers }))
  return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response
}
