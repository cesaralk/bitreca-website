import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import './ProjectDetails.css'

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
  <main className="project-details">

    
<header className="project-hero">
  <span className="project-category">
    {project.category}
  </span>

  <h1>{project.title}</h1>

  <p className="project-hero-description">
    {project.description}
  </p>
</header>

      
{project.overview && (
  <section className="project-overview">
    <h2>Project Overview</h2>
    <p>{project.overview}</p>
  </section>
)}


{project.technologies && (
  <section className="project-technologies">
    <h2>Technologies Used</h2>

    <div className="project-technology-list">
      {project.technologies
        .split(',')
        .map((technology) => technology.trim())
        .filter(Boolean)
        .map((technology, index) => (
          <span
            className="project-technology"
            key={`${technology}-${index}`}
          >
            {technology}
          </span>
        ))}
    </div>
  </section>
)}

{project.project_url &&
  /^https?:\/\//i.test(project.project_url) && (
    <div className="project-live-link">
      <a
        href={project.project_url}
        target="_blank"
        rel="noopener noreferrer"
        className="project-visit-button"
      >
        Visit Live Project ↗
      </a>
    </div>
  )}

{project.content && (
  <section className="project-detailed-content">
    <h2>Project Details</h2>
    <p>{project.content}</p>
  </section>
)}

     
{project.image_url && (
  <section className="project-showcase">
    <div className="project-showcase-image">
      <img
        src={project.image_url}
        alt={`${project.title} showcase`}
        loading="lazy"
      />
    </div>
  </section>
)}


      
<div className="project-back-navigation">
  <Link to="/projects" className="project-back-link">
    <span aria-hidden="true">←</span>
    Back to Projects
  </Link>
</div>


    </main>
  )
}

export default ProjectDetails