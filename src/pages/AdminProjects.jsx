import { useEffect, useState } from 'react'

function AdminProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProjects() {
      try {
        const response = await fetch('/api/admin/projects')
        const data = await response.json()

        if (data.success) {
          setProjects(data.projects)
        }
      } catch (error) {
        console.error('Failed to load admin projects:', error)
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [])

  if (loading) {
    return <p>Loading projects...</p>
  }

  return (
    <main>
      <h1>Projects</h1>

      <p>Manage Bitreca projects.</p>

      {projects.map((project) => (
        <div key={project.id}>
          <h2>{project.title}</h2>

          <p>{project.category}</p>

          <p>
            Status: <strong>{project.status}</strong>
          </p>

          <p>
            Featured: {project.featured === 1 ? 'Yes' : 'No'}
          </p>
        </div>
      ))}
    </main>
  )
}

export default AdminProjects