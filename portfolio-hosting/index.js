export default {

 async fetch(request, env) {

    const rawPath = request.url.split('?')[0].replace(/^[a-z]+:\/\/[^/]+/i, '')

if (/(^|\/)(?:\.|%2e){2}(?:\/|%2f|$)/i.test(rawPath)) {
  return new Response('Invalid path.', {
    status: 404,
  })
}
    const url = new URL(request.url)
    // PortfolioForest - Identify customer portfolio subdomains
const hostname = url.hostname.toLowerCase()

const portfolioDomain = '.bitreca.com'
let portfolioSlug = null

if (hostname.endsWith(portfolioDomain)) {
  const subdomain = hostname.slice(0, -portfolioDomain.length)

  const reservedSubdomains = new Set([
  'www',
  'admin',
  'api',
  'mail',
  'ftp',
  'portfolioforest',
])

if (
  /^[a-z0-9-]+$/.test(subdomain) &&
  !reservedSubdomains.has(subdomain)
) {
  portfolioSlug = subdomain
}
}

// Serve customer websites only on approved portfolio hostnames.
if (
  request.method === 'GET' &&
  portfolioSlug
) {
  try {

    const parts = url.pathname.split('/').slice(1)

const slug = portfolioSlug

    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return new Response('Not found.', { status: 404 })
    }

  // Allow the trailing slash on a portfolio homepage
if (parts.length === 1 && parts[0] === '') {
  parts.pop()
}

const relativePath = parts.join('/') || 'index.html'
// Only allow safe portfolio file paths
if (
  relativePath.length > 250 ||
  !/^[a-zA-Z0-9 _./-]+$/.test(relativePath)
) {
  return new Response('Invalid file path.', {
    status: 404,
  })
}
   if (
  parts.some(
    (part) =>
      !part ||
      part.startsWith('.') ||
      part === '..'
  ) ||
  relativePath.includes('\\')
) {
  return new Response('Not found.', { status: 404 })
}

    const portfolio = await env.PORTFOLIO_DB
      .prepare(`
        SELECT storage_prefix
        FROM portfolios
        WHERE slug = ? AND status = 'published'
      `)
      .bind(slug)
      .first()

    if (!portfolio) {
      return new Response('Portfolio not found.', { status: 404 })
    }

    const contentTypes = {
      html: 'text/html; charset=utf-8',
      css: 'text/css; charset=utf-8',
      js: 'text/javascript; charset=utf-8',
      json: 'application/json; charset=utf-8',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      txt: 'text/plain; charset=utf-8',
      woff: 'font/woff',
      woff2: 'font/woff2',
    }

    const extension = relativePath.split('.').pop().toLowerCase()
    const contentType = contentTypes[extension]

    if (!contentType) {
      return new Response('Not found.', { status: 404 })
    }

    const file = await env.PORTFOLIO_FILES.get(
      `${portfolio.storage_prefix}${relativePath}`
    )

    if (!file) {
      return new Response('Website file not found.', { status: 404 })
    }

    return new Response(file.body, {
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; script-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      },
    })
  } catch (error) {
    console.error('Portfolio preview failed:', error)
    return new Response('Could not load portfolio.', { status: 500 })
  }
}


    // PortfolioForest hosting health check
    if (
      url.pathname === '/health' &&
      request.method === 'GET'
    ) {
      return Response.json({
        success: true,
        service: 'PortfolioForest Hosting',
        message: 'Hosting Worker is running.',
      })
    }

    return new Response('Not found.', {
  status: 404,
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  },
})
  },
}
