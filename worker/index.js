
async function createSessionToken(secret) {
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode('bitreca-admin')
  )

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function createSessionCookie(token) {
  return [
    `__Host-bitreca_admin_session=${token}`,
    'HttpOnly',
    'Secure',
    'Path=/',
    'SameSite=Strict',
    'Max-Age=28800',
  ].join('; ')
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
  const sessionCookie = getCookie(
    request,
    '__Host-bitreca_admin_session'
  )

  if (!sessionCookie) {
    return false
  }

  const expectedToken = await createSessionToken(
    env.SESSION_SECRET
  )

  return sessionCookie === expectedToken
}

export default {
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

    // Health check
    if (url.pathname === '/api/health') {
      return Response.json({
        success: true,
        message: 'Bitreca API is running',
      })
    }

// Admin login
if (
  url.pathname === '/api/admin/login' &&
  request.method === 'POST'
) {
  try {
    const body = await request.json()

    const { username, password } = body

    if (
      username !== env.ADMIN_USERNAME ||
      password !== env.ADMIN_PASSWORD
    ) {
      return Response.json(
        {
          success: false,
          message: 'Invalid username or password.',
        },
        { status: 401 }
      )
    }

    const sessionToken = await createSessionToken(
  env.SESSION_SECRET
)

return Response.json(
  {
    success: true,
    message: 'Login successful.',
  },
  {
    headers: {
      'Set-Cookie': createSessionCookie(sessionToken),
    },
  }
)
  } catch (error) {
    console.error(error)

    return Response.json(
      {
        success: false,
        message: 'Could not process login.',
      },
      { status: 500 }
    )
  }
}

// Admin logout
if (
  url.pathname === '/api/admin/logout' &&
  request.method === 'POST'
) {
  return Response.json(
    {
      success: true,
      message: 'Logged out successfully.',
    },
    {
      headers: {
        'Set-Cookie': [
  '__Host-bitreca_admin_session=',
  'HttpOnly',
  'Secure',
  'Path=/',
  'SameSite=Strict',
  'Max-Age=0',
].join('; '),
      },
    }
  )
}

// Check admin session
if (
  url.pathname === '/api/admin/session' &&
  request.method === 'GET'
) {
  const authenticated = await isAdminAuthenticated(
    request,
    env
  )

  if (!authenticated) {
    return Response.json(
      {
        success: false,
        authenticated: false,
      },
      { status: 401 }
    )
  }

  return Response.json({
    success: true,
    authenticated: true,
  })
}

// Protect all admin API routes except login
if (
  url.pathname.startsWith('/api/admin/') &&
  url.pathname !== '/api/admin/login'
) {
  const authenticated = await isAdminAuthenticated(
    request,
    env
  )

  if (!authenticated) {
    return Response.json(
      {
        success: false,
        message: 'Unauthorized.',
      },
      { status: 401 }
    )
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
            featured,
            created_at,
            updated_at
          FROM portfolios
          ORDER BY created_at DESC, id DESC
        `)
        .all()

      return Response.json({
        success: true,
        portfolios: result.results,
      })
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

      const storagePrefix = `portfolios/${slug}/`

      const result = await env.bitreca_db
        .prepare(`
          INSERT INTO portfolios (
            name,
            slug,
            profession,
            description,
            storage_prefix,
            status,
            featured
          )
          VALUES (?, ?, ?, ?, ?, 'draft', 0)
        `)
        .bind(
          name,
          slug,
          profession || null,
          description || null,
          storagePrefix
        )
        .run()

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
        error?.message?.includes('UNIQUE constraint failed')
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
          SELECT id, slug, storage_prefix
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

      await env.bitreca_db
        .prepare(`
          UPDATE portfolios
          SET
            name = ?,
            slug = ?,
            profession = ?,
            description = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(
          name,
          slug,
          profession || null,
          description || null,
          id
        )
        .run()

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
  try {
    const id = Number(url.pathname.split('/')[4])

    const portfolio = await env.bitreca_db
      .prepare('SELECT id, storage_prefix FROM portfolios WHERE id = ?')
      .bind(id)
      .first()

    if (!portfolio) {
      return Response.json(
        { success: false, message: 'Portfolio not found.' },
        { status: 404 }
      )
    }

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

    const key = `${portfolio.storage_prefix}index.html`

    await env.bitreca_media.put(key, file.stream(), {
      httpMetadata: {
        contentType: 'text/html; charset=utf-8',
      },
    })

    return Response.json({
      success: true,
      message: 'Portfolio HTML uploaded successfully.',
      key,
    })
  } catch (error) {
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
  try {
    const id = Number(url.pathname.split('/')[4])

    const portfolio = await env.bitreca_db
      .prepare('SELECT storage_prefix FROM portfolios WHERE id = ?')
      .bind(id)
      .first()

    if (!portfolio) {
      return Response.json(
        { success: false, message: 'Portfolio not found.' },
        { status: 404 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files')
    const paths = formData.getAll('paths')

    if (
      files.length === 0 ||
      files.length !== paths.length ||
      files.length > 100
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
        key: `${portfolio.storage_prefix}${path}`,
        contentType: allowedTypes[extension],
      })
    }

    if (!hasIndex) {
      return Response.json(
        { success: false, message: 'Website folder must contain index.html.' },
        { status: 400 }
      )
    }

    for (const upload of uploads) {
      await env.bitreca_media.put(upload.key, upload.file.stream(), {
        httpMetadata: { contentType: upload.contentType },
      })
    }

    return Response.json({
      success: true,
      message: 'Website folder uploaded successfully.',
      uploadedFiles: uploads.length,
    })
  } catch (error) {
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
      .prepare('SELECT storage_prefix FROM portfolios WHERE id = ?')
      .bind(id)
      .first()

    if (!portfolio) {
      return Response.json(
        { success: false, message: 'Portfolio not found.' },
        { status: 404 }
      )
    }

    const result = await env.bitreca_media.list({
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
      .prepare('SELECT storage_prefix FROM portfolios WHERE id = ?')
      .bind(id)
      .first()

    if (!portfolio) {
      return Response.json(
        { success: false, message: 'Portfolio not found.' },
        { status: 404 }
      )
    }

    const key = `${portfolio.storage_prefix}index.html`
    const object = await env.bitreca_media.head(key)

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
      .prepare('SELECT id FROM portfolios WHERE id = ?')
      .bind(id)
      .first()

    if (!existing) {
      return Response.json(
        { success: false, message: 'Portfolio not found.' },
        { status: 404 }
      )
    }

    await env.bitreca_db
      .prepare(`
        UPDATE portfolios
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(status, id)
      .run()

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