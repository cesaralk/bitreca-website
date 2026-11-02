// Explicit staging-only, fixed-portfolio preview. No request-controlled slug,
// wildcard domain, Host-header override or production hostname is accepted.
export function stagingPortfolioPreview(env) {
  if (env?.PORTFOLIO_ENVIRONMENT !== 'staging' || env.PORTFOLIO_STAGING_PREVIEW_ENABLED !== 'true') return null
  const hostname = env.PORTFOLIO_STAGING_HOSTNAME, slug = env.PORTFOLIO_STAGING_PREVIEW_SLUG
  if (typeof hostname !== 'string' ||
      !/^(?:bitreca-portfolio-hosting-staging|bitreca-hosting-delete-sandbox-20261025)\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev$/.test(hostname) ||
      typeof slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(slug)) return null
  return { hostname, slug, origin: `https://${hostname}` }
}
