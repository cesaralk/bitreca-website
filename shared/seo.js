export const siteOrigin = 'https://bitreca.com'
export const socialImage = `${siteOrigin}/social/bitreca.png`
export const publicPages = {
  '/': ['BITRECA | Software, Websites & Applications', 'Bitreca builds websites, web, desktop and mobile applications, custom business software and PortfolioForest portfolio websites. Discuss your project.'],
  '/services': ['Software & Website Development Services | BITRECA', 'Explore website development, web, desktop and mobile applications, custom business systems and portfolio websites with Bitreca. Start with your requirements.'],
  '/about': ['About BITRECA | Software Built Around Real Needs', 'Learn what Bitreca builds and how we approach websites, applications, custom software and digital products: understand the need, define the scope, build and review.'],
  '/projects': ['Software & Website Projects | BITRECA', 'Explore published Bitreca projects, their owner-provided descriptions and technologies. Discuss a website, application or custom software project of your own.'],
  '/products': ['Stockly POS & Software Products | BITRECA', 'Explore Stockly POS, Bitreca’s retail point-of-sale and business management software. Ask about features, fit, availability and next steps for your business.'],
  '/portfolioforest': ['PortfolioForest | Portfolio Websites by BITRECA', 'Discover PortfolioForest, Bitreca’s published portfolio website directory. Explore individual work and stories, or discuss a portfolio website of your own.'],
  '/contact': ['Contact BITRECA | Discuss Your Software Project', 'Discuss a website, application, custom business system or portfolio website with Bitreca. Send a private project enquiry or use our WhatsApp and email options.'],
  '/store': ['Store Catalogue | BITRECA', 'Browse Bitreca’s Store directory and owner-published product information. Software and digital services are Bitreca’s current commercial launch focus.'],
}
export const projectSlug = value => typeof value === 'string' && value.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
export const normalizeSeoPath = path => path === '/' ? '/' : path.replace(/\/+$/, '')
export const projectPath = path => /^\/projects\/([^/]+)$/.exec(normalizeSeoPath(path))
export const privateSeoPath = path => /^\/admin(?:\/|$)|^\/store\/request(?:\/|$)|^\/portfolio\/demo\/?$/.test(path)
export function pageSeo(path) {
  path = normalizeSeoPath(path)
  const entry = publicPages[path]
  return { path, title: entry?.[0] || (privateSeoPath(path) ? 'Private Workspace | BITRECA' : 'Page Unavailable | BITRECA'), description: entry?.[1] || 'This page is not included in Bitreca’s public search results.', noindex: !entry }
}
const plain = (value, limit) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : ''
export function projectSeo(project) {
  if (!project || !projectSlug(project.slug) || !plain(project.title, 100) || !plain(project.description, 180)) throw Error('Invalid published metadata')
  return { path: `/projects/${project.slug}`, title: `${plain(project.title, 100)} | BITRECA Projects`, description: plain(project.description, 180), noindex: false }
}
export function projectStateSeo(path, status) {
  return { path, title: `${status === 'not-found' ? 'Project Not Found' : status === 'error' ? 'Project Unavailable' : 'Project Details'} | BITRECA`, description: status === 'loading' ? 'Explore this published Bitreca project.' : 'This project is unavailable. Browse Bitreca’s published projects or contact us about your idea.', noindex: status !== 'loading' }
}
export const canonicalUrl = seo => siteOrigin + seo.path
export const robotsValue = seo => seo.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'
export function structuredData(seo) {
  if (seo.noindex) return null
  const organization = { '@type': 'Organization', '@id': `${siteOrigin}/#organization`, name: 'BITRECA', url: siteOrigin + '/', email: 'info@bitreca.com' }
  const website = { '@type': 'WebSite', '@id': `${siteOrigin}/#website`, name: 'BITRECA', url: siteOrigin + '/', publisher: { '@id': organization['@id'] } }
  const page = { '@type': seo.path === '/contact' ? 'ContactPage' : seo.path === '/about' ? 'AboutPage' : 'WebPage', '@id': canonicalUrl(seo) + '#webpage', url: canonicalUrl(seo), name: seo.title, description: seo.description, isPartOf: { '@id': website['@id'] }, about: { '@id': organization['@id'] } }
  return { '@context': 'https://schema.org', '@graph': [organization, website, page] }
}
export const escapeMarkup = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
export const safeJsonLd = data => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
export function seoTags(seo) {
  const meta = (attribute, name, content) => `<meta ${attribute}="${name}" content="${escapeMarkup(content)}" data-bitreca-seo>`
  const graph = structuredData(seo)
  return `<title>${escapeMarkup(seo.title)}</title>${meta('name', 'description', seo.description)}${meta('name', 'robots', robotsValue(seo))}<link rel="canonical" href="${escapeMarkup(canonicalUrl(seo))}" data-bitreca-seo>${meta('property', 'og:type', 'website')}${meta('property', 'og:site_name', 'BITRECA')}${meta('property', 'og:title', seo.title)}${meta('property', 'og:description', seo.description)}${meta('property', 'og:url', canonicalUrl(seo))}${meta('property', 'og:image', socialImage)}${meta('property', 'og:image:width', '1200')}${meta('property', 'og:image:height', '630')}${meta('property', 'og:image:alt', 'BITRECA — websites, applications, custom software and portfolio websites')}${meta('name', 'twitter:card', 'summary_large_image')}${meta('name', 'twitter:title', seo.title)}${meta('name', 'twitter:description', seo.description)}${meta('name', 'twitter:image', socialImage)}${meta('name', 'twitter:image:alt', 'BITRECA software and digital services')}${graph ? `<script type="application/ld+json" data-bitreca-seo>${safeJsonLd(graph)}</script>` : ''}`
}
