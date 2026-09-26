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
            featured
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

    return new Response('Not Found', {
      status: 404,
    })
  },
}