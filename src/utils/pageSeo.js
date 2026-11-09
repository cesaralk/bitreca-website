import { canonicalUrl, robotsValue, socialImage, structuredData, safeJsonLd } from '../../shared/seo'

export function applyPageSeo(seo) {
  document.title = seo.title
  function tag(selector, name, attributes) {
    const tags = [...document.head.querySelectorAll(selector)]
    const element = tags.shift() || document.createElement(name)
    for (const duplicate of tags) duplicate.remove()
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
    if (!element.parentNode) document.head.appendChild(element)
    return element
  }
  for (const [name, content] of Object.entries({ description: seo.description, robots: robotsValue(seo), 'twitter:card': 'summary_large_image', 'twitter:title': seo.title, 'twitter:description': seo.description, 'twitter:image': socialImage, 'twitter:image:alt': 'BITRECA software and digital services' })) tag(`meta[name="${name}"]`, 'meta', { name, content })
  for (const [property, content] of Object.entries({ 'og:type': 'website', 'og:site_name': 'BITRECA', 'og:title': seo.title, 'og:description': seo.description, 'og:url': canonicalUrl(seo), 'og:image': socialImage, 'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': 'BITRECA — websites, applications, custom software and portfolio websites' })) tag(`meta[property="${property}"]`, 'meta', { property, content })
  tag('link[rel="canonical"]', 'link', { rel: 'canonical', href: canonicalUrl(seo) })
  document.querySelectorAll('script[data-bitreca-seo]').forEach(element => element.remove())
  const graph = structuredData(seo)
  if (graph) { const script = document.createElement('script'); script.type = 'application/ld+json'; script.dataset.bitrecaSeo = ''; script.textContent = safeJsonLd(graph); document.head.appendChild(script) }
}
