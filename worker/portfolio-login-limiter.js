// Staging-only, fail-closed login throttle. Production code paths are unchanged.
// Cloudflare's rate-limiting counters are approximate and location-scoped;
// Cloudflare Access must protect the staging Worker BEFORE enabling workers.dev.
export async function stagingLoginLimitResponse(request, env) {
  if (env?.PORTFOLIO_ENVIRONMENT !== 'staging' || env.PORTFOLIO_LOGIN_RATE_LIMIT_ENABLED !== 'true') {
    return null
  }
  const limiter = env.STAGING_ADMIN_LOGIN_LIMITER
  if (typeof limiter?.limit !== 'function') {
    return Response.json(
      { success: false, message: 'Staging login protection is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  // CF-Connecting-IP is supplied by Cloudflare at its edge. It may be missing in
  // local tests; unknown clients share one conservative fallback key.
  const clientIp = request.headers.get('cf-connecting-ip') || 'unknown'
  const key = `bitreca-staging-admin-login:${clientIp}`
  try {
    const result = await limiter.limit({ key })
    if (result?.success === true) return null
    return Response.json(
      { success: false, message: 'Too many login attempts. Try again in a minute.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } }
    )
  } catch {
    return Response.json(
      { success: false, message: 'Staging login protection is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
