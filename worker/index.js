
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
    `bitreca_admin_session=${token}`,
    'HttpOnly',
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
    'bitreca_admin_session'
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
          'bitreca_admin_session=',
          'HttpOnly',
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
          status,
          featured
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        title,
        slug,
        category,
        description,
        image_url || null,
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
      status,
      featured,
    } = body

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

    if (!['draft', 'published'].includes(status)) {
      return Response.json(
        {
          success: false,
          message: 'Invalid project status.',
        },
        { status: 400 }
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