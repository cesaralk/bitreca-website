import { stagingPortfolioPreview } from '../shared/portfolio-staging.js'

const PUBLIC_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

// A customer website URL is supplied by the server only when that hostname
// is deliberately configured to serve the portfolio. Never trust URL input
// from a database row or an incoming Host header.
export function publicPortfolioUrl(env, slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(slug)) return null

  if (env?.PORTFOLIO_ENVIRONMENT === 'staging') {
    const preview = stagingPortfolioPreview(env)
    return preview && preview.slug === slug ? preview.origin : null
  }

  // Published customer websites run on the isolated portfolio-hosting Worker.
  // Advertise their URLs only for the reviewed production R2/D1 identity.
   if (
    env?.PORTFOLIO_ENVIRONMENT === 'production' &&
    env.PORTFOLIO_DATABASE_ID === '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a' &&
    (
      (
        env.PORTFOLIO_BUCKET_NAME === 'bitreca-media' &&
        env.PORTFOLIO_STORAGE_SCOPE ===
          'portfolioforest/production/bitreca-media/8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
      ) ||
      (
        env.PORTFOLIO_BUCKET_NAME === 'bitreca-portfolios-prod-20261031' &&
        env.PORTFOLIO_STORAGE_SCOPE ===
          'portfolioforest/production/bitreca-portfolios-prod-20261031/8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
      )
    ) &&
    !['www', 'admin', 'api', 'mail', 'ftp', 'portfolioforest'].includes(slug)
  ) {
    return `https://${slug}.bitreca.com`
  }

  return null
}

export async function handlePublicPortfolioDirectory(request, env, url) {
  if (url.pathname !== '/api/portfolios' || request.method !== 'GET') return null

  try {
    const { results } = await env.bitreca_db.prepare(`
      SELECT name, slug, profession, description, featured
      FROM portfolios
      WHERE status = 'published' AND deletion_requested_at IS NULL
      ORDER BY featured DESC, created_at DESC, id DESC
      LIMIT 100
    `).all()

    const staging = env.PORTFOLIO_ENVIRONMENT === 'staging'
    const portfolios = (results || []).flatMap(item => {
      const website_url = publicPortfolioUrl(env, item.slug)
      // The staging host has exactly one approved fixed slug. Never list
      // other customers as if their portfolios can be visited there.
      if (staging && !website_url) return []
      return [{
        name: item.name,
        slug: item.slug,
        profession: item.profession || '',
        description: item.description || '',
        featured: item.featured === 1,
        website_url,
      }]
    })

    return Response.json({ success: true, portfolios }, { headers: PUBLIC_HEADERS })
  } catch {
    console.error('Could not load public portfolio directory.')
    return Response.json(
      { success: false, message: 'Could not load portfolios.' },
      { status: 503, headers: PUBLIC_HEADERS }
    )
  }
}
