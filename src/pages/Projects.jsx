import { useEffect, useState } from 'react'
import ProjectCard from '../components/ProjectCard'
import './Projects.css'

function Projects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadProjects() {
      try {
        const response = await fetch('/api/projects')
        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error('Could not load projects.')
        }

        setProjects(data.projects)
      } catch (error) {
        console.error('Failed to load projects:', error)
        setError('Could not load projects right now.')
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [])

  return (
    <main className="projects-page">

      <section className="projects-page-hero">
        <div className="projects-page-container">

          <p className="section-label">
            OUR WORK
          </p>

          <h1>
            Technology built around
            <span> real needs.</span>
          </h1>

          <p className="projects-page-intro">
            Explore software, digital products and technology
            solutions developed by Bitreca.
          </p>

        </div>
      </section>

      <section className="projects-page-content">
        <div className="projects-page-container">

          {loading && (
            <p className="projects-page-message">
              Loading projects...
            </p>
          )}

          {!loading && error && (
            <p className="projects-page-message">
              {error}
            </p>
          )}

          {!loading && !error && projects.length === 0 && (
            <p className="projects-page-message">
              No projects are available yet.
            </p>
          )}

          {!loading && !error && projects.length > 0 && (
            <div className="projects-grid">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  title={project.title}
                  category={project.category}
                  description={project.description}
                  tags={[]}
                  imageUrl={project.image_url}
                  slug={project.slug}
                />
              ))}
            </div>
          )}

        </div>
      </section>

    </main>
  )
}

export default Projects