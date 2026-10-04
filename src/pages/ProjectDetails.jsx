import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

function ProjectDetails() {
  const { slug } = useParams()

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadProject() {
      try {
        const response = await fetch(
  `/api/projects/${encodeURIComponent(slug)}`
)

const data = await response.json()

if (response.status === 404) {
  setError('Project not found.')
  return
}

if (!response.ok || !data.success) {
  throw new Error('Could not load project.')
}

setProject(data.project)
      } catch (error) {
        console.error('Failed to load project:', error)
        setError('Could not load this project right now.')
      } finally {
        setLoading(false)
      }
    }

    loadProject()
  }, [slug])

  if (loading) {
    return (
      <main>
        <p>Loading project...</p>
      </main>
    )
  }

  if (error) {
    return (
      <main>
        <h1>{error}</h1>

        <Link to="/projects">
          ← Back to Projects
        </Link>
      </main>
    )
  }

  return (
    <main>

      <p>{project.category}</p>

      <h1>{project.title}</h1>

      <p>{project.description}</p>

      {project.image_url && (
        <img
          src={project.image_url}
          alt={project.title}
        />
      )}

      <Link to="/projects">
        ← Back to Projects
      </Link>

    </main>
  )
}

export default ProjectDetails