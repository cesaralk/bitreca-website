import { newPortfolioStorage, getPortfolioReadStorage, requirePortfolioWriteStorage, portfolioMutationsFrozen } from '../shared/portfolio-storage.js'
import { deletionEligibility, eligibilityColumns } from './portfolio-deletion-eligibility.js'
import { handlePublicPortfolioDirectory } from './portfolio-public-directory.js'
import { deletionRequestsEnabled, authorizePortfolioWriter, inventoryTrustFromEnvironment } from './portfolio-deletion-config.js'
import { stagingLoginLimitResponse } from './portfolio-login-limiter.js'
import { getPortfolioDeletionAdminStatus, handlePortfolioDeletionAdmin } from './portfolio-deletion-api.js'
import { schedulePortfolioDeletions } from './portfolio-deletion-workflow.js'
import { loadLegacyReconciliation } from './portfolio-legacy-reconciliation.js'
import { legacyDeletionEnabled, handleLegacyDelete, retryLegacyDelete } from './portfolio-legacy-deletion.js'
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

const ADMIN_ID = 'primary-admin'
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60
const SESSION_COOKIE_NAME = '__Host-bitreca_admin_session'

function hasValidAdminConfiguration(env) {
  return [env?.ADMIN_USERNAME, env?.ADMIN_PASSWORD, env?.SESSION_SECRET]
    .every(isNonEmptyString) &&
    typeof env?.ADMIN_AUTH_VERSION === 'string' &&
    /^[1-9][0-9]*$/.test(env.ADMIN_AUTH_VERSION) &&
    Number.isSafeInteger(Number(env.ADMIN_AUTH_VERSION))
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createSessionToken() {
  return 'v2.' + bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

function isValidSessionToken(token) {
  return typeof token === 'string' && /^v2\.[0-9a-f]{64}$/.test(token)
}

async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return bytesToHex(new Uint8Array(digest))
}

async function createConfigurationFingerprint(env) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC', key,
    encoder.encode(JSON.stringify(['bitreca-admin-config-v2', env.ADMIN_USERNAME, env.ADMIN_PASSWORD]))
  )
  return bytesToHex(new Uint8Array(signature))
}

function createSessionCookie(token, maxAge = SESSION_LIFETIME_SECONDS) {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly', 'Secure', 'Path=/', 'SameSite=Strict', `Max-Age=${maxAge}`,
  ].join('; ')
}

function authenticationUnavailable() {
  return Response.json(
    { success: false, message: 'Admin authentication is unavailable. Please retry.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  )
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie')

  if (!cookieHeader) {
    return null
  }

  const cookies = cookieHeader.split(';')

  for (const cookie of cookies) {
    const [cookieName, ...cookieValue] = cookie
      .trim()
      .split('=')

    if (cookieName === name) {
      return cookieValue.join('=')
    }
  }

  return null
}

async function isAdminAuthenticated(request, env) {
  if (!hasValidAdminConfiguration(env)) {
    throw new Error('Admin authentication configuration is unavailable.')
  }
  const token = getCookie(request, SESSION_COOKIE_NAME)
  if (!isValidSessionToken(token)) return false

  // Direct D1 queries use the primary. Do not cache this authorization result
  // or move it to an unconstrained read replica: logout must take effect immediately.
  const result = await env.bitreca_db
    .prepare(`
      SELECT state.auth_version,
        EXISTS (
          SELECT 1 FROM admin_sessions AS session
          WHERE session.admin_id = state.admin_id
            AND session.auth_version = state.auth_version
            AND session.token_hash = ?
            AND session.config_fingerprint = ?
            AND session.expires_at > unixepoch()
        ) AS authenticated
      FROM admin_auth_state AS state
      WHERE state.admin_id = ?
    `)
    .bind(await hashSessionToken(token), await createConfigurationFingerprint(env), ADMIN_ID)
    .first()

  if (!result || result.auth_version !== Number(env.ADMIN_AUTH_VERSION)) {
    throw new Error('Admin authentication version is unavailable.')
  }
  return result.authenticated === 1
}

class StorageAllocationError extends Error {
  constructor(message, status = 503) {
    super(message)
    this.status = status
  }
}

function portfolioUploadFileLimit(env) {
  if (env.PORTFOLIO_UPLOAD_MAX_FILES === undefined) return 100
  if (typeof env.PORTFOLIO_UPLOAD_MAX_FILES !== 'string' || !/^[1-9][0-9]*$/.test(env.PORTFOLIO_UPLOAD_MAX_FILES) ||
      Number(env.PORTFOLIO_UPLOAD_MAX_FILES) > 100) throw new StorageAllocationError('Upload resource budget is unavailable.')
  return Number(env.PORTFOLIO_UPLOAD_MAX_FILES)
}

function pendingDeletionResponse() {
  return Response.json(
    { success: false, code: 'PORTFOLIO_PENDING_DELETION', message: 'Portfolio is pending deletion.' },
    { status: 409, headers: { 'Cache-Control': 'no-store' } }
  )
}

async function registerPortfolioAllocation(env, portfolioId, prefix, kind, sourcePrefix) {
  const authorization = await authorizePortfolioWriter(env, { verifyStorageIdentity: true })
  const bucket = await requirePortfolioWriteStorage(env, env.bitreca_db, portfolioId, { sourcePrefix })
  // New UUID destinations only; source_prefix is provenance, not an ownership claim.
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  if (!['folder', 'html'].includes(kind) ||
      !new RegExp('^portfolio-versions/' + portfolioId + '/' + uuid + '/$').test(prefix)) {
    throw new StorageAllocationError('Invalid storage allocation.', 500)
  }
  try {
    const listed = await bucket.list({ prefix, limit: 1 })
    if (!listed || !Array.isArray(listed.objects) || typeof listed.truncated !== 'boolean' ||
        (listed.delimitedPrefixes !== undefined && (!Array.isArray(listed.delimitedPrefixes) || listed.delimitedPrefixes.length > 0))) {
      throw new Error('Invalid empty-prefix verification response.')
    }
    if (listed.objects.length > 0 || listed.truncated) {
      throw new StorageAllocationError('The generated storage location is occupied. Please retry.', 409)
    }
  } catch (error) {
    if (error instanceof StorageAllocationError) throw error
    throw new StorageAllocationError('Could not verify an empty upload location. Please retry.')
  }
  const writerToken = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  try {
    const result = await env.bitreca_db.prepare(`
      INSERT INTO portfolio_storage_allocations
        (prefix, portfolio_id, allocation_kind, upload_state, source_prefix,
         writer_protocol_version, writer_token, writer_state${authorization ? ',authorization_policy_id,authorization_generation,authorization_artifact' : ''})
      VALUES (?, ?, ?, 'uploading', ?, 1, ?, 'open'${authorization ? ',?,?,?' : ''})
    `).bind(prefix, portfolioId, kind, sourcePrefix, writerToken,
      ...(authorization ? [authorization.policyId, authorization.policyGeneration, authorization.deploymentSha256] : [])).run()
    // D1 may include the immutable allocation-event trigger in meta.changes.
    // This plain INSERT still targets exactly one UNIQUE prefix; require a
    // confirmed positive count rather than assuming triggers are excluded.
    if (!result.success || !Number.isSafeInteger(result.meta?.changes) || result.meta.changes < 1) throw new Error('Registration failed.')
  } catch (error) {
    if (error.message?.includes('Portfolio is pending deletion.')) {
      throw new StorageAllocationError('Portfolio is pending deletion.', 409)
    }
    if (error.message?.includes('Storage allocation conflict.')) {
      throw new StorageAllocationError('The storage allocation is already reserved. Please retry.', 409)
    }
    throw new StorageAllocationError('Could not register the upload location. Please retry.')
  }
  return { prefix, portfolioId, writerToken, writesStopped: false, pendingWrites: 0, writeUncertain: false, writerRecorded: false }
}

async function putPortfolioObject(env, allocation, key, body, options) {
  let bucket
  try {
    const authorization = await authorizePortfolioWriter(env)
    bucket = await requirePortfolioWriteStorage(env, env.bitreca_db, allocation.portfolioId)
    if (allocation.writesStopped || allocation.writeUncertain || !key.startsWith(allocation.prefix)) {
      throw new StorageAllocationError('This upload writer cannot issue further writes.')
    }
    const permit = await env.bitreca_db.prepare(`
      SELECT portfolio.deletion_requested_at, allocation.writer_state,
             allocation.writer_protocol_version, policy.minimum_protocol_version
      FROM portfolio_storage_allocations AS allocation
      JOIN portfolios AS portfolio ON portfolio.id = allocation.portfolio_id
      JOIN portfolio_storage_writer_policy AS policy ON policy.id = 1
      WHERE allocation.portfolio_id = ? AND allocation.prefix = ? AND allocation.writer_token = ?
      ${authorization ? 'AND allocation.authorization_policy_id=? AND allocation.authorization_generation=? AND allocation.authorization_artifact=?' : ''}
    `).bind(allocation.portfolioId, allocation.prefix, allocation.writerToken,
      ...(authorization ? [authorization.policyId, authorization.policyGeneration, authorization.deploymentSha256] : [])).first()
    if (!permit) throw new StorageAllocationError('Upload writer verification is unavailable. Please retry.')
    if (permit.deletion_requested_at != null) throw new StorageAllocationError('Portfolio is pending deletion.', 409)
    if (permit.writer_state !== 'open' || permit.writer_protocol_version !== 1 ||
        !Number.isSafeInteger(permit.minimum_protocol_version) || permit.minimum_protocol_version > 1) {
      throw new StorageAllocationError('Upload writer protocol is unavailable. Please retry.')
    }
    if (allocation.writesStopped || allocation.writeUncertain) {
      throw new StorageAllocationError('This upload writer cannot issue further writes.')
    }
  } catch (error) {
    // No PUT was issued. Release an unread source/File stream without masking
    // the original failure. The outer catch may safely close this writer.
    try { await body.cancel() } catch { /* The source may already be canceled. */ }
    throw error
  }
  // A mark can commit after the check. Keep the writer open until this PUT is
  // acknowledged; a rejected/ambiguous PUT must never produce a closed writer.
  allocation.pendingWrites++
  try {
    await bucket.put(key, body, options)
  } catch (error) {
    allocation.writeUncertain = true
    throw error
  } finally {
    allocation.pendingWrites--
  }
}

async function settlePortfolioWriter(env, allocation) {
  if (!allocation || allocation.writerRecorded) return
  // Stop local issuance before recording closure, including if D1 loses its reply.
  allocation.writesStopped = true
  const state = allocation.writeUncertain || allocation.pendingWrites > 0 ? 'uncertain' : 'closed'
  const result = await env.bitreca_db.prepare(`
    UPDATE portfolio_storage_allocations
    SET writer_state = ?, writer_closed_at = CASE WHEN ? = 'closed' THEN unixepoch() ELSE NULL END,
        updated_at = unixepoch()
    WHERE prefix = ? AND portfolio_id = ? AND writer_token = ? AND writer_state = 'open'
  `).bind(state, state, allocation.prefix, allocation.portfolioId, allocation.writerToken).run()
  if (!result.success || ![0, 1].includes(result.meta?.changes)) {
    throw new StorageAllocationError('Could not confirm upload writer settlement. Please retry.')
  }
  if (result.meta.changes === 0) {
    const recorded = await env.bitreca_db.prepare(`
      SELECT writer_state FROM portfolio_storage_allocations
      WHERE prefix = ? AND portfolio_id = ? AND writer_token = ?
    `).bind(allocation.prefix, allocation.portfolioId, allocation.writerToken).first()
    if (recorded?.writer_state !== state) {
      throw new StorageAllocationError('Could not confirm upload writer settlement. Please retry.')
    }
  }
  allocation.writerRecorded = true
}

async function activatePortfolioAllocation(env, allocation, originalPrefix) {
  await authorizePortfolioWriter(env)
  // One transaction records the outcome together with the existing prefix CAS.
  const results = await env.bitreca_db.batch([
    env.bitreca_db.prepare(`
      UPDATE portfolios
      SET storage_prefix = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND storage_prefix = ? AND EXISTS (
        SELECT 1 FROM portfolio_storage_allocations
        WHERE prefix = ? AND portfolio_id = ? AND upload_state = 'uploading'
          AND writer_protocol_version = 1 AND writer_token = ? AND writer_state = 'closed'
      ) AND deletion_requested_at IS NULL
    `).bind(allocation.prefix, allocation.portfolioId, originalPrefix, allocation.prefix, allocation.portfolioId, allocation.writerToken),
    env.bitreca_db.prepare(`
      UPDATE portfolio_storage_allocations
      SET upload_state = CASE WHEN EXISTS (
        SELECT 1 FROM portfolios
        WHERE id = ? AND storage_prefix = ? AND deletion_requested_at IS NULL
      ) THEN 'completed' ELSE 'conflicted' END, updated_at = unixepoch()
      WHERE prefix = ? AND portfolio_id = ? AND upload_state = 'uploading'
    `).bind(allocation.portfolioId, allocation.prefix, allocation.prefix, allocation.portfolioId),
  ])
  if (results.length !== 2 || results.some(result => !result.success) ||
      ![0, 1].includes(results[0].meta?.changes) || results[1].meta?.changes !== 1) {
    throw new Error('Could not record website activation.')
  }
  return results[0].meta.changes === 1
}

async function recordAllocationFailure(env, allocation, stage) {
  if (!allocation) return
  try {
    // A failed PUT or activation response may have committed remotely. Never
    // treat these as proof that the prefix is inactive or safe to delete.
    const state = ['write', 'activation'].includes(stage) ? 'uncertain' : 'failed'
    const result = await env.bitreca_db.prepare(`
      UPDATE portfolio_storage_allocations
      SET upload_state = ?, updated_at = unixepoch()
      WHERE prefix = ? AND portfolio_id = ? AND upload_state = 'uploading'
    `).bind(state, allocation.prefix, allocation.portfolioId).run()
    if (!result.success) throw new Error('Tracking failed.')
  } catch {
    // If D1 is unavailable, leave the durable uploading row unresolved.
    console.error('Could not record storage allocation failure.')
  }
}

export default {
  async scheduled(_event, env) {
    // No Cron is configured. This remains a no-op unless BOTH explicit runtime
    // flags and the authoritative D1 authorization have been approved.
    return schedulePortfolioDeletions(env)
  },
  async fetch(request, env) {
    const url = new URL(request.url)

    // Reject cross-origin requests that modify admin data.
if (
  url.pathname.startsWith('/api/admin/') &&
  !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
) {
  const origin = request.headers.get('Origin')

  if (origin !== url.origin) {
    return Response.json(
      {
        success: false,
        message: 'Cross-origin admin requests are not allowed.',
      },
      { status: 403 }
    )
  }
}

    // Production clean-scope fence: the separately enabled, authenticated
    // protocol-evidence endpoint may import a signature while data stays frozen.
    if (url.pathname.startsWith('/api/admin/portfolio') &&
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && portfolioMutationsFrozen(env) &&
        !(url.pathname === '/api/admin/portfolio-protocol-evidence' && request.method === 'POST')) {
      return Response.json({ success: false, message: 'Portfolio mutations are temporarily unavailable.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
    // Staging-only PortfolioForest maintenance freeze.
    // No request header or user input can override this gate.
    if (
      env.PORTFOLIO_ENVIRONMENT === 'staging' &&
      env.PORTFOLIO_STAGING_MUTATIONS_FROZEN === 'true' &&
      url.pathname.startsWith('/api/admin/portfolio') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    ) {
      return Response.json(
        {
          success: false,
          message: 'Portfolio mutations are temporarily unavailable.',
        },
        {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        }
      )
    }

    // Health check
    if (url.pathname === '/api/health') {
      return Response.json({
        success: true,
        message: 'Bitreca API is running',
      })
    }

// Admin login
if (url.pathname === '/api/admin/login' && request.method === 'POST') {
  try {
    if (!hasValidAdminConfiguration(env)) return authenticationUnavailable()
    const loginLimitResponse = await stagingLoginLimitResponse(request, env)
    if (loginLimitResponse) return loginLimitResponse
    const body = await request.json().catch(() => null)
    const username = body?.username
    const password = body?.password
    if (
      !isNonEmptyString(username) || !isNonEmptyString(password) ||
      username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD
    ) {
      return Response.json(
        { success: false, message: 'Invalid username or password.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const token = createSessionToken()
    // The conditional insert also fences a login already in flight during rotation.
    const result = await env.bitreca_db
      .prepare(`
        INSERT INTO admin_sessions
          (token_hash, admin_id, auth_version, config_fingerprint, created_at, expires_at)
        SELECT ?, admin_id, auth_version, ?, unixepoch(), unixepoch() + ?
        FROM admin_auth_state
        WHERE admin_id = ? AND auth_version = ?
      `)
      .bind(
        await hashSessionToken(token), await createConfigurationFingerprint(env),
        SESSION_LIFETIME_SECONDS, ADMIN_ID, Number(env.ADMIN_AUTH_VERSION)
      )
      .run()
    if (!result.success || result.meta?.changes !== 1) return authenticationUnavailable()

    return Response.json(
      { success: true, message: 'Login successful.' },
      { headers: { 'Set-Cookie': createSessionCookie(token), 'Cache-Control': 'no-store' } }
    )
  } catch {
    console.error('Admin login failed.')
    return authenticationUnavailable()
  }
}

// Revoke before clearing the browser cookie. Keep the cookie on a D1 error
// so logout can be retried; expired sessions can be revoked too.
if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
  try {
    if (!hasValidAdminConfiguration(env)) return authenticationUnavailable()
    const token = getCookie(request, SESSION_COOKIE_NAME)
    if (isValidSessionToken(token)) {
      const result = await env.bitreca_db
        .prepare('DELETE FROM admin_sessions WHERE token_hash = ? AND admin_id = ?')
        .bind(await hashSessionToken(token), ADMIN_ID)
        .run()
      if (!result.success) return authenticationUnavailable()
    }
    return Response.json(
      { success: true, message: 'Logged out successfully.' },
      { headers: { 'Set-Cookie': createSessionCookie('', 0), 'Cache-Control': 'no-store' } }
    )
  } catch {
    console.error('Admin logout failed.')
    return authenticationUnavailable()
  }
}

// Check admin session and protect every other admin API route.
const isSessionCheck = url.pathname === '/api/admin/session' && request.method === 'GET'
if (url.pathname.startsWith('/api/admin/') && url.pathname !== '/api/admin/login') {
  try {
    const authenticated = await isAdminAuthenticated(request, env)
    if (!authenticated) {
      return Response.json(
        {
          success: false,
          ...(isSessionCheck ? { authenticated: false } : {}),
          message: 'Unauthorized.',
        },
        {
          status: 401,
          headers: { 'Set-Cookie': createSessionCookie('', 0), 'Cache-Control': 'no-store' },
        }
      )
    }
    if (isSessionCheck) {
      return Response.json(
        { success: true, authenticated: true },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }
  } catch {
    console.error('Admin session validation failed.')
    return authenticationUnavailable()
  }
}

// Upload media to R2
if (
  url.pathname === '/api/admin/media/upload' &&
  request.method === 'POST'
) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return Response.json(
        {
          success: false,
          message: 'Please choose an image to upload.',
        },
        { status: 400 }
      )
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]

    if (!allowedTypes.includes(file.type)) {
      return Response.json(
        {
          success: false,
          message: 'Only JPG, PNG and WebP images are allowed.',
        },
        { status: 400 }
      )
    }
// Verify the actual file signature, not just the MIME type.
const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())

const isJpeg =
  bytes[0] === 0xff &&
  bytes[1] === 0xd8 &&
  bytes[2] === 0xff

const isPng =
  bytes.length >= 8 &&
  [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value
  )

const isWebp =
  bytes.length >= 12 &&
  String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
  String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'

const validImage =
  (file.type === 'image/jpeg' && isJpeg) ||
  (file.type === 'image/png' && isPng) ||
  (file.type === 'image/webp' && isWebp)

if (!validImage) {
  return Response.json(
    {
      success: false,
      message: 'Invalid image content.',
    },
    { status: 400 }
  )
}
    const maxFileSize = 5 * 1024 * 1024

    if (file.size > maxFileSize) {
      return Response.json(
        {
          success: false,
          message: 'Image must be 5 MB or smaller.',
        },
        { status: 400 }
      )
    }

    const extensionsByType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const extension = extensionsByType[file.type]

const fileName =
  `projects/${crypto.randomUUID()}.${extension}`

    await env.bitreca_media.put(fileName, file, {
      httpMetadata: {
        contentType: file.type,
      },
    })

   return Response.json({
  success: true,
  message: 'Image uploaded successfully.',
  key: fileName,
  url: `/api/media/${fileName}`,
})

  } catch (error) {
    console.error('Media upload failed:', error)

    return Response.json(
      {
        success: false,
        message: 'Could not upload image.',
      },
      { status: 500 }
    )
  }
}


// Serve only Bitreca project images from R2
if (
  url.pathname.startsWith('/api/media/') &&
  request.method === 'GET'
) {
  try {
    const key = url.pathname.slice('/api/media/'.length)

    let decodedKey

    try {
      decodedKey = decodeURIComponent(key)
    } catch {
      return new Response('Invalid media path.', {
        status: 400,
      })
    }

    // Only allow the expected project-image key format.
    // Never expose PortfolioForest website files here.
    if (
      key !== decodedKey ||
      !/^projects\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)
    ) {
      return new Response('Not found.', {
        status: 404,
      })
    }

    const object = await env.bitreca_media.get(key)

    if (!object) {
      return new Response('Media file not found.', {
        status: 404,
      })
    }

    const headers = new Headers()

    object.writeHttpMetadata(headers)

    headers.set('etag', object.httpEtag)
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set(
      'Cache-Control',
      'public, max-age=31536000, immutable'
    )

    return new Response(object.body, {
      headers,
    })
  } catch (error) {
    console.error('Media download failed:', error)

    return new Response('Could not load media file.', {
      status: 500,
    })
  }
}


    // Public PortfolioForest directory: published metadata only, no admin authentication.
    const publicPortfolioDirectory = await handlePublicPortfolioDirectory(request, env, url)
    if (publicPortfolioDirectory) return publicPortfolioDirectory

    // Get published projects for the public website
    if (
      url.pathname === '/api/projects' &&
      request.method === 'GET'
    ) {
      const { results } = await env.bitreca_db
        .prepare(`
          SELECT
            id,
            title,
            slug,
            category,
            description,
            image_url,
            featured,
            created_at,
            updated_at
          FROM projects
          WHERE status = 'published'
          ORDER BY created_at DESC
        `)
        .all()

      return Response.json({
        success: true,
        projects: results,
      })
    }
// Get all projects for the admin panel
if (
  url.pathname === '/api/admin/projects' &&
  request.method === 'GET'
) {
  const { results } = await env.bitreca_db
    .prepare(`
      SELECT
        id,
        title,
        slug,
        category,
        description,
       image_url,
overview,
technologies,
project_url,
content,
status,
featured,
created_at,
updated_at
      FROM projects
      ORDER BY created_at DESC
    `)
    .all()

  return Response.json({
    success: true,
    projects: results,
  })
}

// Get one published project by slug
if (
  url.pathname.startsWith('/api/projects/') &&
  request.method === 'GET'
) {
  try {
    const slug = url.pathname
      .replace('/api/projects/', '')
      .trim()

    if (!slug) {
      return Response.json(
        {
          success: false,
          message: 'Project slug is required.',
        },
        { status: 400 }
      )
    }

    const project = await env.bitreca_db
      .prepare(`
        SELECT
          id,
          title,
          slug,
          category,
          description,
          image_url,
overview,
technologies,
project_url,
content,
featured,
created_at,
updated_at
        FROM projects
        WHERE slug = ?
          AND status = 'published'
        LIMIT 1
      `)
      .bind(slug)
      .first()

    if (!project) {
      return Response.json(
        {
          success: false,
          message: 'Project not found.',
        },
        { status: 404 }
      )
    }

    return Response.json({
      success: true,
      project,
    })
  } catch (error) {
    console.error('Could not load project:', error)

    return Response.json(
      {
        success: false,
        message: 'Could not load project.',
      },
      { status: 500 }
    )
  }
}

  // Reviewed legacy-only bridge; runs solely behind shared admin authentication.
  const legacyRetryMatch = url.pathname.match(/^\/api\/admin\/portfolio-deletion-jobs\/([0-9a-f-]{36})\/retry$/)
  if (legacyRetryMatch && request.method === 'POST' && legacyDeletionEnabled(env)) {
    const legacyRetry = await retryLegacyDelete(env, legacyRetryMatch[1])
    if (legacyRetry) return legacyRetry
  }
  const deletionAdminResponse = await handlePortfolioDeletionAdmin(request, env, url)
  if (deletionAdminResponse) return deletionAdminResponse
  // PortfolioForest - List all portfolios (admin only)
  if (
    url.pathname === '/api/admin/portfolios' &&
    request.method === 'GET'
  ) {
    try {
      const result = await env.bitreca_db
        .prepare(`
          SELECT
            id,
            name,
            slug,
            profession,
            description,
            thumbnail_url,
            storage_prefix,
            status,
            deletion_requested_at,
            ${eligibilityColumns},

            (SELECT id FROM portfolio_deletion_jobs WHERE portfolio_id=portfolios.id) AS deletion_job_id,
            featured,
            created_at,
            updated_at
          FROM portfolios
          ORDER BY created_at DESC, id DESC
        `)
        .all()

      return Response.json({
        success: true,
        portfolios: result.results.map(row => { const { tracked_birth, authorized_origin, reconciled_origin, uncertain_writers, ...portfolio } = row; return { ...portfolio, deletion_eligibility: deletionEligibility({ ...portfolio, tracked_birth, authorized_origin, reconciled_origin, uncertain_writers }) } }),
      }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      console.error('Could not load portfolios:', error)

      return Response.json(
        {
          success: false,
          message: 'Could not load portfolios.',
        },
        { status: 500 }
      )
    }
  }

  // PortfolioForest - Create a portfolio (admin only)
  if (
    url.pathname === '/api/admin/portfolios' &&
    request.method === 'POST'
  ) {
    try {
      const body = await request.json()

      const name = typeof body.name === 'string'
        ? body.name.trim()
        : ''

      const slug = typeof body.slug === 'string'
        ? body.slug.trim()
        : ''

      const profession = typeof body.profession === 'string'
        ? body.profession.trim()
        : ''

      const description = typeof body.description === 'string'
        ? body.description.trim()
        : ''

      if (!name || !slug) {
        return Response.json(
          {
            success: false,
            message: 'Name and slug are required.',
          },
          { status: 400 }
        )
      }
// Prevent portfolios from using reserved subdomains
const reservedSlugs = new Set([
  'www',
  'admin',
  'api',
  'mail',
  'ftp',
  'portfolioforest',
])

if (reservedSlugs.has(slug)) {
  return Response.json(
    {
      success: false,
      message: 'This subdomain is reserved and cannot be used.',
    },
    { status: 400 }
  )
}
      const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

      if (!slugPattern.test(slug)) {
        return Response.json(
          {
            success: false,
            message: 'Slug must contain lowercase letters, numbers or hyphens.',
          },
          { status: 400 }
        )
      }

      if (
        name.length > 150 ||
        slug.length > 100 ||
        profession.length > 200 ||
        description.length > 2000
      ) {
        return Response.json(
          {
            success: false,
            message: 'One or more fields are too long.',
          },
          { status: 400 }
        )
      }

      const existingPortfolio = await env.bitreca_db
        .prepare(`
          SELECT id FROM portfolios
          WHERE slug = ?
          LIMIT 1
        `)
        .bind(slug)
        .first()

      if (existingPortfolio) {
        return Response.json(
          {
            success: false,
            message: 'A portfolio with this slug already exists.',
          },
          { status: 409 }
        )
      }

      const storagePrefix = `portfolio-initial/${crypto.randomUUID()}/`

      const authorization = await authorizePortfolioWriter(env, { verifyStorageIdentity: true })
      const portfolioBucket = newPortfolioStorage(env)

      try {
        const objects = await portfolioBucket.list({ prefix: storagePrefix, limit: 1 })
        if (!objects || !Array.isArray(objects.objects) || typeof objects.truncated !== 'boolean' ||
            (objects.delimitedPrefixes !== undefined && (!Array.isArray(objects.delimitedPrefixes) || objects.delimitedPrefixes.length > 0))) {
          throw new Error('Invalid empty-prefix verification response.')
        }
        if (objects.objects.length > 0 || objects.truncated) {
          return Response.json(
            { success: false, message: 'The generated storage location is occupied. Please retry.' },
            { status: 409 }
          )
        }
      } catch {
        return Response.json(
          { success: false, message: 'Could not verify an empty storage location. Please retry.' },
          { status: 503 }
        )
      }

      const writerToken = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
      const results = await env.bitreca_db.batch([
        env.bitreca_db
          .prepare(`
            INSERT INTO portfolios (
              name,
              slug,
              profession,
              description,
              storage_prefix,
              status,
              featured,
              storage_birth_token
            )
            VALUES (?, ?, ?, ?, ?, 'draft', 0, ?)
          `)
          .bind(
            name,
            slug,
            profession || null,
            description || null,
            storagePrefix,
            writerToken
          ),
        env.bitreca_db.prepare(`
          INSERT INTO portfolio_storage_allocations
            (prefix, portfolio_id, allocation_kind, upload_state, source_prefix,
             writer_protocol_version, writer_token, writer_state, writer_closed_at${authorization ? ',authorization_policy_id,authorization_generation,authorization_artifact' : ''})
          SELECT storage_prefix, id, 'initial', 'completed', NULL, 1, ?, 'closed', unixepoch()${authorization ? ',?,?,?' : ''}
          FROM portfolios WHERE storage_prefix = ?
        `).bind(writerToken, ...(authorization ? [authorization.policyId, authorization.policyGeneration, authorization.deploymentSha256] : []), storagePrefix),
      ])
      // Birth/event/seal triggers add changes without inserting extra portfolios.
      if (results.length !== 2 || results.some(item => !item.success || !Number.isSafeInteger(item.meta?.changes) || item.meta.changes < 1)) {
        throw new Error('Could not register portfolio storage.')
      }
      const result = results[0]

      return Response.json(
        {
          success: true,
          message: 'Portfolio created successfully.',
          portfolioId: result.meta.last_row_id,
        },
        { status: 201 }
      )
    } catch (error) {
      console.error('Could not create portfolio:', error)

      if (
        error?.message?.includes('UNIQUE constraint failed') ||
        error?.message?.includes('Storage allocation conflict.')
      ) {
        return Response.json(
          {
            success: false,
            message: 'Portfolio slug or storage location already exists.',
          },
          { status: 409 }
        )
      }

      return Response.json(
        {
          success: false,
          message: 'Could not create portfolio.',
        },
        { status: 500 }
      )
    }
  }
  // Read-only progress. Authentication is enforced by the shared admin gate.
  if (/^\/api\/admin\/portfolio-deletion-jobs\/[0-9a-f-]{36}$/.test(url.pathname) && request.method === 'GET') {
    const headers = { 'Cache-Control': 'no-store' }
    try {
      const job = await getPortfolioDeletionAdminStatus(env, url.pathname.split('/').pop())
      return job
        ? Response.json({ success: true, job }, { headers })
        : Response.json({ success: false, message: 'Deletion job not found.' }, { status: 404, headers })
    } catch {
      return Response.json({ success: false, message: 'Deletion progress is unavailable. Please retry.' }, { status: 503, headers })
    }
  }
  // Mark only. Execution is separately gated and dispatched by the scheduler.
  if (
    /^\/api\/admin\/portfolios\/[0-9]+$/.test(url.pathname) &&
    request.method === 'DELETE'
  ) {
    const id = Number(url.pathname.split('/').pop())
    if (!Number.isSafeInteger(id) || id <= 0) {
      return Response.json({ success: false, message: 'Invalid portfolio ID.' }, { status: 400 })
    }
    if (legacyDeletionEnabled(env)) {
      const legacyResponse = await handleLegacyDelete(env, id, request.headers.get('X-Portfolio-Delete-Confirm'))
      if (legacyResponse) return legacyResponse
    }
    if (!deletionRequestsEnabled(env)) {
      return Response.json({ success: false, message: 'Permanent deletion requests are disabled pending explicit approval.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
    // Protect legacy customers in main staging from deletion tests.
    if (env.PORTFOLIO_ENVIRONMENT === 'staging') {
      if (typeof env.PORTFOLIO_STORAGE_SCOPE !== 'string' ||
          !env.PORTFOLIO_STORAGE_SCOPE.startsWith('portfolioforest/staging/')) {
        return Response.json({
          success: false,
          message: 'Staging deletion scope could not be verified.'
        }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
      }
      try {
        const eligible = await env.bitreca_db.prepare(`
          SELECT p.id
          FROM portfolios p
          JOIN portfolio_storage_origins o ON o.portfolio_id = p.id
          JOIN portfolio_storage_protocol_verifications e ON e.id = o.epoch_id
          WHERE p.id = ?
            AND substr(p.slug, 1, 12) = 'delete-test-'
            AND p.storage_birth_token = o.birth_token
            AND o.minimum_at_birth = 1
            AND e.storage_scope = ?
        `).bind(id, env.PORTFOLIO_STORAGE_SCOPE).first()

        if (!eligible) {
          return Response.json({
            success: false,
            message: 'Only newly verified disposable staging test portfolios can be deleted.'
          }, { status: 403 })
        }
      } catch {
        return Response.json({
          success: false,
          message: 'Staging deletion eligibility could not be verified.'
        }, { status: 503 })
      }
    }
    if (request.headers.get('X-Portfolio-Delete-Confirm') !== String(id)) {
      return Response.json({ success: false, message: 'Confirm the exact portfolio ID before requesting permanent deletion.' }, { status: 400 })
    }
    try {
      // Reconciliation imports never mark a portfolio. At the separately enabled
      // request boundary, verify the current signature before changing publication.
      const legacy = await env.bitreca_db.prepare('SELECT minimum_at_birth FROM portfolio_storage_origins WHERE portfolio_id=?').bind(id).first()
      if (legacy?.minimum_at_birth === 0) {
        const pending = await env.bitreca_db.prepare('SELECT deletion_requested_at FROM portfolios WHERE id=?').bind(id).first()
        if (pending?.deletion_requested_at == null) await loadLegacyReconciliation(env.bitreca_db, await inventoryTrustFromEnvironment(env), id)
      }
      const results = await env.bitreca_db.batch([
        env.bitreca_db.prepare(`
          UPDATE portfolios
          SET deletion_requested_at = unixepoch(), status = 'draft',
              publication_revision = publication_revision + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND deletion_requested_at IS NULL
        `).bind(id),
        env.bitreca_db.prepare(`
          INSERT INTO portfolio_deletion_jobs (id, portfolio_id, requested_by)
          SELECT ?, id, ? FROM portfolios
          WHERE id = ? AND deletion_requested_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_jobs WHERE portfolio_id = ?)
          ON CONFLICT (portfolio_id) DO NOTHING
        `).bind(crypto.randomUUID(), ADMIN_ID, id, id),
      ])
      if (results.length !== 2 || results.some(result =>
        !result.success || !Number.isSafeInteger(result.meta?.changes) || result.meta.changes < 0)) {
        throw new Error('Could not confirm deletion marking.')
      }
      const job = await env.bitreca_db.prepare(`
        SELECT id, portfolio_id, state, created_at
        FROM portfolio_deletion_jobs WHERE portfolio_id = ?
      `).bind(id).first()
      if (!job) {
        if (results[0].meta.changes !== 0) throw new Error('Deletion job is unavailable.')
        return Response.json({ success: false, message: 'Portfolio not found.' }, { status: 404 })
      }
      return Response.json(
        { success: true, message: 'Portfolio is pending deletion. Storage cleanup has not started.', job },
        { status: 202, headers: { 'Cache-Control': 'no-store' } }
      )
    } catch {
      console.error('Could not confirm portfolio deletion marking.')
      return Response.json(
        { success: false, message: 'Deletion marking could not be confirmed. Please retry to retrieve the existing job.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      )
    }
  }
  // PortfolioForest - Update a portfolio (admin only)
  if (
    /^\/api\/admin\/portfolios\/[0-9]+$/.test(url.pathname) &&
    request.method === 'PUT'
  ) {
    try {
      const id = Number(url.pathname.split('/').pop())
      const body = await request.json()

      const name = typeof body.name === 'string'
        ? body.name.trim()
        : ''

      const slug = typeof body.slug === 'string'
        ? body.slug.trim()
        : ''

      const profession = typeof body.profession === 'string'
        ? body.profession.trim()
        : ''

      const description = typeof body.description === 'string'
        ? body.description.trim()
        : ''

      if (!name || !slug) {
        return Response.json(
          {
            success: false,
            message: 'Name and slug are required.',
          },
          { status: 400 }
        )
      }

// Prevent existing portfolios from using reserved subdomains
const reservedSlugs = new Set([
  'www',
  'admin',
  'api',
  'mail',
  'ftp',
  'portfolioforest',
])

if (reservedSlugs.has(slug)) {
  return Response.json(
    {
      success: false,
      message: 'This subdomain is reserved and cannot be used.',
    },
    { status: 400 }
  )
}
      const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

      if (!slugPattern.test(slug)) {
        return Response.json(
          {
            success: false,
            message: 'Invalid portfolio slug.',
          },
          { status: 400 }
        )
      }

      if (
        name.length > 150 ||
        slug.length > 100 ||
        profession.length > 200 ||
        description.length > 2000
      ) {
        return Response.json(
          {
            success: false,
            message: 'One or more fields are too long.',
          },
          { status: 400 }
        )
      }

      const existing = await env.bitreca_db
        .prepare(`
          SELECT id, slug, storage_prefix, deletion_requested_at
          FROM portfolios
          WHERE id = ?
        `)
        .bind(id)
        .first()

      if (!existing) {
        return Response.json(
          {
            success: false,
            message: 'Portfolio not found.',
          },
          { status: 404 }
        )
      }

      if (existing.deletion_requested_at != null) return pendingDeletionResponse()

      // Keep the storage location unchanged when editing a slug.
      // This prevents breaking future R2 file references.
      const duplicate = await env.bitreca_db
        .prepare(`
          SELECT id
          FROM portfolios
          WHERE slug = ? AND id != ?
          LIMIT 1
        `)
        .bind(slug, id)
        .first()

      if (duplicate) {
        return Response.json(
          {
            success: false,
            message: 'This portfolio slug is already in use.',
          },
          { status: 409 }
        )
      }

      const updateResult = await env.bitreca_db
        .prepare(`
          UPDATE portfolios
          SET
            name = ?,
            slug = ?,
            profession = ?,
            description = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND deletion_requested_at IS NULL
        `)
        .bind(
          name,
          slug,
          profession || null,
          description || null,
          id
        )
        .run()

      if (updateResult.success && updateResult.meta?.changes === 0) return pendingDeletionResponse()
      if (!updateResult.success || updateResult.meta?.changes !== 1) {
        throw new Error('Could not update portfolio.')
      }

      return Response.json({
        success: true,
        message: 'Portfolio updated successfully.',
      })
    } catch (error) {
      console.error('Could not update portfolio:', error)

      if (error?.message?.includes('UNIQUE constraint failed')) {
        return Response.json(
          {
            success: false,
            message: 'Portfolio slug already exists.',
          },
          { status: 409 }
        )
      }

      return Response.json(
        {
          success: false,
          message: 'Could not update portfolio.',
        },
        { status: 500 }
      )
    }
  }

// PortfolioForest - Upload a website file (admin only)
if (
  /^\/api\/admin\/portfolios\/[0-9]+\/upload$/.test(url.pathname) &&
  request.method === 'POST'
) {
  let allocation = null
  let allocationStage = 'read'
  try {
    const id = Number(url.pathname.split('/')[4])

    const portfolio = await env.bitreca_db
      .prepare('SELECT id, storage_prefix, deletion_requested_at FROM portfolios WHERE id = ?')
      .bind(id)
      .first()

    if (!portfolio) {
      return Response.json(
        { success: false, message: 'Portfolio not found.' },
        { status: 404 }
      )
    }

    if (portfolio.deletion_requested_at != null) return pendingDeletionResponse()

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return Response.json(
        { success: false, message: 'Please select a file.' },
        { status: 400 }
      )
    }

    // First version: only allow index.html
    if (file.name !== 'index.html') {
      return Response.json(
        { success: false, message: 'Only index.html is supported for now.' },
        { status: 400 }
      )
    }

    // Limit uploads to 2 MB
    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      return Response.json(
        { success: false, message: 'File must be between 1 byte and 2 MB.' },
        { status: 400 }
      )
    }

    const fileLimit = portfolioUploadFileLimit(env)
    const originalPrefix = portfolio.storage_prefix
    await authorizePortfolioWriter(env, { verifyStorageIdentity: true })
    const sourceBucket = await requirePortfolioWriteStorage(env, env.bitreca_db, id, { sourcePrefix: originalPrefix })
    const versionPrefix = `portfolio-versions/${id}/${crypto.randomUUID()}/`
    const assets = []
    const seenKeys = new Set()
    const seenCursors = new Set()
    let cursor
    let totalSize = file.size
    let listedFiles = 0

    // Bound the snapshot before copying: at most 100 files and 20 MB,
    // including the replacement HTML. Copy streams sequentially below.
    for (let page = 0; ; page++) {
      if (page >= 100) {
        return Response.json(
          { success: false, message: 'Website listing exceeds the safe page limit.' },
          { status: 413 }
        )
      }

      const result = await sourceBucket.list({
        prefix: originalPrefix,
        limit: 100,
        ...(cursor ? { cursor } : {}),
      })

      for (const object of result.objects) {
        listedFiles++
        if (listedFiles > fileLimit) {
          return Response.json(
            { success: false, message: `Website exceeds the ${fileLimit}-file copy limit.` },
            { status: 413 }
          )
        }
        if (!object.key.startsWith(originalPrefix) || seenKeys.has(object.key)) {
          throw new Error('Invalid or duplicate object in website listing.')
        }
        seenKeys.add(object.key)
        const relativePath = object.key.slice(originalPrefix.length)
        if (!relativePath) {
          throw new Error('Website object has no relative path.')
        }
        if (relativePath === 'index.html') continue

        if (!Number.isSafeInteger(object.size) || object.size < 0) {
          throw new Error('Invalid website object size.')
        }
        totalSize += object.size
        if (object.size > 5 * 1024 * 1024 || totalSize > 20 * 1024 * 1024 || assets.length >= fileLimit - 1) {
          return Response.json(
            { success: false, message: `Website exceeds the safe copy limits (${fileLimit} files, 5 MB per asset, 20 MB total).` },
            { status: 413 }
          )
        }
        assets.push({ key: object.key, relativePath, size: object.size, etag: object.etag })
      }

      if (!result.truncated) break
      if (!result.cursor || seenCursors.has(result.cursor)) {
        throw new Error('Website listing did not advance.')
      }
      seenCursors.add(result.cursor)
      cursor = result.cursor
    }

    allocation = await registerPortfolioAllocation(env, id, versionPrefix, 'html', originalPrefix)

    for (const asset of assets) {
      allocationStage = 'read'
      const source = await sourceBucket.get(asset.key)
      if (!source || source.size !== asset.size || source.etag !== asset.etag) {
        if (source) await source.body.cancel()
        throw new Error('Website asset disappeared or changed during copying.')
      }
      allocationStage = 'write'
      await putPortfolioObject(env, allocation, `${versionPrefix}${asset.relativePath}`, source.body, {
        httpMetadata: source.httpMetadata,
        customMetadata: source.customMetadata,
      })
    }

    const key = `${versionPrefix}index.html`

    allocationStage = 'write'
    await putPortfolioObject(env, allocation, key, file.stream(), {
      httpMetadata: {
        contentType: 'text/html; charset=utf-8',
      },
    })

    await settlePortfolioWriter(env, allocation)
    allocationStage = 'activation'
    const activated = await activatePortfolioAllocation(env, allocation, originalPrefix)
    if (!activated) {
      return Response.json(
        { success: false, message: 'The active website version changed during upload. Please retry.' },
        { status: 409 }
      )
    }

    return Response.json({
      success: true,
      message: 'Portfolio HTML uploaded successfully.',
      key,
    })
  } catch (error) {
    try { await settlePortfolioWriter(env, allocation) }
    catch { console.error('Could not record upload writer settlement.') }
    await recordAllocationFailure(env, allocation, allocationStage)
    if (error instanceof StorageAllocationError) {
      return Response.json({ success: false, message: error.message }, { status: error.status })
    }
    console.error('Portfolio upload failed:', error)

    return Response.json(
      { success: false, message: 'Could not upload portfolio file.' },
      { status: 500 }
    )
  }
}
// PortfolioForest - Upload a complete website folder (admin only)
if (
  /^\/api\/admin\/portfolios\/[0-9]+\/upload-folder$/.test(url.pathname) &&
  request.method === 'POST'
) {
  let allocation = null
  let allocationStage = 'read'
  try {
    const id = Number(url.pathname.split('/')[4])

    const portfolio = await env.bitreca_db
      .prepare('SELECT storage_prefix, deletion_requested_at FROM portfolios WHERE id = ?')
      .bind(id)
      .first()

    if (!portfolio) {
      return Response.json(
        { success: false, message: 'Portfolio not found.' },
        { status: 404 }
      )
    }

    if (portfolio.deletion_requested_at != null) return pendingDeletionResponse()

    const formData = await request.formData()
    const files = formData.getAll('files')
    const paths = formData.getAll('paths')

    if (
      files.length === 0 ||
      files.length !== paths.length ||
      files.length > portfolioUploadFileLimit(env)
    ) {
      return Response.json(
        { success: false, message: 'Invalid website folder or too many files.' },
        { status: 400 }
      )
    }

    const allowedTypes = {
      html: 'text/html; charset=utf-8',
      css: 'text/css; charset=utf-8',
      js: 'text/javascript; charset=utf-8',
      json: 'application/json',
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
    const versionPrefix = `portfolio-versions/${id}/${crypto.randomUUID()}/`
    const uploads = []
    const seenPaths = new Set()
    let totalSize = 0
    let hasIndex = false

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = paths[i]

      if (!(file instanceof File) || typeof path !== 'string') {
        return Response.json(
          { success: false, message: 'Invalid file or path.' },
          { status: 400 }
        )
      }

      const parts = path.split('/')
      const extension = path.split('.').pop().toLowerCase()

      if (
        !path ||
        path.length > 250 ||
        path.includes('\\') ||
        parts.some(
          (part) =>
            !part ||
            part === '.' ||
            part === '..' ||
            part.startsWith('.')
        ) ||
        !/^[a-zA-Z0-9 _./-]+$/.test(path) ||
        !Object.hasOwn(allowedTypes, extension) ||
        file.size === 0 ||
        file.size > 5 * 1024 * 1024 ||
        seenPaths.has(path)
      ) {
        return Response.json(
          { success: false, message: `Invalid website file: ${path}` },
          { status: 400 }
        )
      }

      seenPaths.add(path)
      totalSize += file.size

      if (path === 'index.html') {
        hasIndex = true
      }

      if (totalSize > 20 * 1024 * 1024) {
        return Response.json(
          { success: false, message: 'Website exceeds the 20 MB limit.' },
          { status: 400 }
        )
      }

      uploads.push({
        file,
        key: `${versionPrefix}${path}`,
        contentType: allowedTypes[extension],
      })
    }

    if (!hasIndex) {
      return Response.json(
        { success: false, message: 'Website folder must contain index.html.' },
        { status: 400 }
      )
    }

    allocation = await registerPortfolioAllocation(env, id, versionPrefix, 'folder', portfolio.storage_prefix)

    for (const upload of uploads) {
      allocationStage = 'write'
      await putPortfolioObject(env, allocation, upload.key, upload.file.stream(), {
        httpMetadata: { contentType: upload.contentType },
      })
    }

    await settlePortfolioWriter(env, allocation)
    allocationStage = 'activation'
    const activated = await activatePortfolioAllocation(env, allocation, portfolio.storage_prefix)
    if (!activated) {
      return Response.json(
        { success: false, message: 'The active website version changed during upload. Please retry.' },
        { status: 409 }
      )
    }

    return Response.json({
      success: true,
      message: 'Website folder uploaded successfully.',
      uploadedFiles: uploads.length,
    })
  } catch (error) {
    try { await settlePortfolioWriter(env, allocation) }
    catch { console.error('Could not record upload writer settlement.') }
    await recordAllocationFailure(env, allocation, allocationStage)
    if (error instanceof StorageAllocationError) {
      return Response.json({ success: false, message: error.message }, { status: error.status })
    }
    console.error('Portfolio folder upload failed:', error)

    return Response.json(
      { success: false, message: 'Could not upload website folder.' },
      { status: 500 }
    )
  }
}
// PortfolioForest - List uploaded website files (admin only)
if (
  /^\/api\/admin\/portfolios\/[0-9]+\/files-check$/.test(url.pathname) &&
  request.method === 'GET'
) {
  try {
    const id = Number(url.pathname.split('/')[4])

    const portfolio = await env.bitreca_db
      .prepare('SELECT storage_prefix, deletion_requested_at FROM portfolios WHERE id = ?')
      .bind(id)
      .first()

    if (!portfolio) {
      return Response.json(
        { success: false, message: 'Portfolio not found.' },
        { status: 404 }
      )
    }

    if (portfolio.deletion_requested_at != null) return pendingDeletionResponse()

    const storage = await getPortfolioReadStorage(env, env.bitreca_db, id)
    const result = await storage.list({
      prefix: portfolio.storage_prefix,
      limit: 100,
    })

    return Response.json({
      success: true,
      files: result.objects.map((object) => ({
        path: object.key.slice(portfolio.storage_prefix.length),
        size: object.size,
      })),
      truncated: result.truncated,
    })
  } catch (error) {
    console.error('Portfolio files check failed:', error)

    return Response.json(
      { success: false, message: 'Could not check website files.' },
      { status: 500 }
    )
  }
}
// PortfolioForest - Verify uploaded HTML (admin only)
if (
  /^\/api\/admin\/portfolios\/[0-9]+\/file-check$/.test(url.pathname) &&
  request.method === 'GET'
) {
  try {
    const id = Number(url.pathname.split('/')[4])

    const portfolio = await env.bitreca_db
      .prepare('SELECT storage_prefix, deletion_requested_at FROM portfolios WHERE id = ?')
      .bind(id)
      .first()

    if (!portfolio) {
      return Response.json(
        { success: false, message: 'Portfolio not found.' },
        { status: 404 }
      )
    }

    if (portfolio.deletion_requested_at != null) return pendingDeletionResponse()

    const key = `${portfolio.storage_prefix}index.html`
    const storage = await getPortfolioReadStorage(env, env.bitreca_db, id)
    const object = await storage.head(key)

    return Response.json({
      success: true,
      fileExists: object !== null,
      key,
      size: object?.size ?? null,
    })
  } catch (error) {
    console.error('Portfolio file check failed:', error)

    return Response.json(
      { success: false, message: 'Could not check portfolio file.' },
      { status: 500 }
    )
  }
}
  // PortfolioForest - Publish or unpublish a portfolio (admin only)
if (
  /^\/api\/admin\/portfolios\/[0-9]+\/status$/.test(url.pathname) &&
  request.method === 'PATCH'
) {
  try {
    const id = Number(url.pathname.split('/')[4])
    const body = await request.json()

    const status = body.status

    if (!['draft', 'published'].includes(status)) {
      return Response.json(
        { success: false, message: 'Invalid portfolio status.' },
        { status: 400 }
      )
    }

    const existing = await env.bitreca_db
      .prepare('SELECT id, storage_prefix, publication_revision, deletion_requested_at FROM portfolios WHERE id = ?')
      .bind(id)
      .first()

    if (!existing) {
      return Response.json(
        { success: false, message: 'Portfolio not found.' },
        { status: 404 }
      )
    }

    if (existing.deletion_requested_at != null) return pendingDeletionResponse()

    if (status === 'published') {
      try {
        const storage = await getPortfolioReadStorage(env, env.bitreca_db, id)
        const html = await storage.get(`${existing.storage_prefix}index.html`)
        if (!html) {
          return Response.json(
            { success: false, message: 'Cannot publish: the selected website is missing index.html.' },
            { status: 422 }
          )
        }
        // Read the full stream without buffering it, so read failures prevent publishing.
        await html.body.pipeTo(new WritableStream({ write() {} }))
      } catch (error) {
        console.error('Could not read portfolio HTML before publishing:', error)
        return Response.json(
          { success: false, message: 'Cannot publish: index.html could not be read. Please retry.' },
          { status: 503 }
        )
      }
    }

    // Increment even for draft -> draft so a completed Unpublish invalidates
    // every status operation that read the previous revision.
    const updateResult = await env.bitreca_db
      .prepare(`
        UPDATE portfolios
        SET status = ?, publication_revision = publication_revision + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND storage_prefix = ? AND publication_revision = ?
          AND deletion_requested_at IS NULL
      `)
      .bind(status, id, existing.storage_prefix, existing.publication_revision)
      .run()

    if (updateResult.success && updateResult.meta?.changes === 0) {
      return Response.json(
        { success: false, message: 'The website version or publication state changed. Please review and retry.' },
        { status: 409 }
      )
    }
    if (!updateResult.success || updateResult.meta?.changes !== 1) {
      throw new Error('Could not update the selected website publication state.')
    }

    return Response.json({
      success: true,
      message: `Portfolio ${status === 'published' ? 'published' : 'unpublished'} successfully.`,
    })
  } catch (error) {
    console.error('Could not update portfolio status:', error)

    return Response.json(
      { success: false, message: 'Could not update portfolio status.' },
      { status: 500 }
    )
  }
}

   // Create a new project
if (
  url.pathname === '/api/admin/projects' &&
  request.method === 'POST'
) {
  try {
    const body = await request.json()

    const {
  title,
  slug,
  category,
  description,
  image_url,
  overview,
  technologies,
  project_url,
  content,
  status = 'draft',
  featured = 0,
} = body

    // Basic validation
    if (!title || !slug || !category || !description) {
      return Response.json(
        {
          success: false,
          message:
            'Title, slug, category and description are required.',
        },
        { status: 400 }
      )
    }

// Validate slug format
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

if (!slugPattern.test(slug)) {
  return Response.json(
    {
      success: false,
      message:
        'Slug can only contain lowercase letters, numbers and hyphens.',
    },
    { status: 400 }
  )
}

// Validate project status
if (!['draft', 'published'].includes(status)) {
  return Response.json(
    {
      success: false,
      message: 'Status must be either draft or published.',
    },
    { status: 400 }
  )
}

    // Check whether the slug is already being used
    const existingProject = await env.bitreca_db
      .prepare(`
        SELECT id
        FROM projects
        WHERE slug = ?
        LIMIT 1
      `)
      .bind(slug)
      .first()

    if (existingProject) {
      return Response.json(
        {
          success: false,
          message: 'A project with this slug already exists.',
        },
        { status: 409 }
      )
    }

    const result = await env.bitreca_db
  .prepare(`
    INSERT INTO projects (
      title,
      slug,
      category,
      description,
      image_url,
      overview,
      technologies,
      project_url,
      content,
      status,
      featured
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  .bind(
    title,
    slug,
    category,
    description,
    image_url || null,
    overview || null,
    technologies || null,
    project_url || null,
    content || null,
    status,
    featured ? 1 : 0
  )
  .run()

    return Response.json(
      {
        success: true,
        message: 'Project created successfully.',
        projectId: result.meta.last_row_id,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error(error)

    return Response.json(
      {
        success: false,
        message: 'Could not create project.',
      },
      { status: 500 }
    )
  }
}

// Update an existing project
if (
  url.pathname.startsWith('/api/admin/projects/') &&
  request.method === 'PUT'
) {
  try {
    const id = url.pathname.split('/').pop()
    const body = await request.json()

    const {
  title,
  slug,
  category,
  description,
  image_url,
  overview,
  technologies,
  project_url,
  content,
  status,
  featured,
} = body
    // Basic validation
    if (!title || !slug || !category || !description) {
      return Response.json(
        {
          success: false,
          message:
            'Title, slug, category and description are required.',
        },
        { status: 400 }
      )
    }

    // Validate slug format
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

    if (!slugPattern.test(slug)) {
      return Response.json(
        {
          success: false,
          message:
            'Slug can only contain lowercase letters, numbers and hyphens.',
        },
        { status: 400 }
      )
    }

    // Validate project status
    if (!['draft', 'published'].includes(status)) {
      return Response.json(
        {
          success: false,
          message: 'Invalid project status.',
        },
        { status: 400 }
      )
    }

    // Check whether another project already uses this slug
    const existingProject = await env.bitreca_db
      .prepare(`
        SELECT id
        FROM projects
        WHERE slug = ?
          AND id != ?
        LIMIT 1
      `)
      .bind(slug, id)
      .first()

    if (existingProject) {
      return Response.json(
        {
          success: false,
          message: 'A project with this slug already exists.',
        },
        { status: 409 }
      )
    }

    
const result = await env.bitreca_db
  .prepare(`
    UPDATE projects
    SET
      title = ?,
      slug = ?,
      category = ?,
      description = ?,
      image_url = ?,
      overview = ?,
      technologies = ?,
      project_url = ?,
      content = ?,
      status = ?,
      featured = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
  .bind(
    title,
    slug,
    category,
    description,
    image_url || null,
    overview || null,
    technologies || null,
    project_url || null,
    content || null,
    status,
    featured ? 1 : 0,
    id
  )
  .run()


    if (result.meta.changes === 0) {
      return Response.json(
        {
          success: false,
          message: 'Project not found.',
        },
        { status: 404 }
      )
    }

    return Response.json({
      success: true,
      message: 'Project updated successfully.',
    })
  } catch (error) {
    console.error(error)

    return Response.json(
      {
        success: false,
        message: 'Could not update project.',
      },
      { status: 500 }
    )
  }
}

// Delete an existing project
if (
  url.pathname.startsWith('/api/admin/projects/') &&
  request.method === 'DELETE'
) {
  try {
    const id = url.pathname.split('/').pop()

    const result = await env.bitreca_db
      .prepare(`
        DELETE FROM projects
        WHERE id = ?
      `)
      .bind(id)
      .run()

    if (result.meta.changes === 0) {
      return Response.json(
        {
          success: false,
          message: 'Project not found.',
        },
        { status: 404 }
      )
    }

    return Response.json({
      success: true,
      message: 'Project deleted successfully.',
    })
  } catch (error) {
    console.error(error)

    return Response.json(
      {
        success: false,
        message: 'Could not delete project.',
      },
      { status: 500 }
    )
  }
}
    return new Response('Not Found', {
      status: 404,
    })
  },
}
