import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import PublicProjectImage from '../components/PublicProjectImage'
import usePublicProjects from '../hooks/usePublicProjects'
import { safeProjectUrl } from '../utils/publicProjects'
import './Projects.css'
import './ProjectDetails.css'

function ProjectDetails() {
  const { slug } = useParams()
  const { data: project, status, retry } = usePublicProjects(slug)
  const heading = useRef(null)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    heading.current?.focus({ preventScroll: true })
  }, [slug, status])
  const website = safeProjectUrl(project?.project_url)
  const technologies = [...new Set((project?.technologies || '').split(',').map((value) => value.trim()).filter(Boolean))]
  const title = status === 'ready' ? project.title : status === 'loading' ? 'Loading project…' : status === 'not-found' ? 'Project not found.' : 'Project unavailable.'
  const hasNarrative = Boolean(project?.overview || project?.content)

  return (
    <main className="projects-page project-details-page">
      <div className="projects-page-container">
        <nav className="project-details-navigation" aria-label="Project navigation"><Link className="projects-back-link" to="/projects"><span aria-hidden="true">←</span> All projects</Link></nav>
        <header className="project-details-header">
          <p className="projects-eyebrow">{status === 'ready' ? project.category : 'BITRECA / PROJECT DETAILS'}</p>
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          {status === 'ready' && <p className="project-details-description">{project.description}</p>}
        </header>

        {status === 'loading' && <div className="projects-state" role="status" aria-busy="true"><p>Loading the published project…</p></div>}
        {status === 'not-found' && <div className="projects-state" role="status"><p>This project could not be found. It may be unavailable or unpublished.</p><Link className="projects-button projects-primary" to="/projects">Browse published projects</Link></div>}
        {status === 'error' && <div className="projects-state" role="alert"><p>We could not load this project right now. Please try again or return to the project listing.</p><div className="projects-actions"><button className="projects-button projects-primary" type="button" onClick={retry}>Try again</button><Link className="projects-button projects-secondary" to="/projects">Back to projects</Link></div></div>}

        {status === 'ready' && <>
          {project.image_url && <section className="project-details-showcase" aria-label="Project image"><PublicProjectImage imageUrl={project.image_url} title={project.title} eager /></section>}
          <div className={`project-details-body${hasNarrative ? '' : ' project-details-body-compact'}`}>
            {hasNarrative && <div className="project-details-narrative">
              {project.overview && <section aria-labelledby="project-overview-title"><p className="projects-eyebrow">THE PROJECT</p><h2 id="project-overview-title">Overview</h2><p>{project.overview}</p></section>}
              {project.content && <section aria-labelledby="project-content-title"><h2 id="project-content-title">Project details</h2><p>{project.content}</p></section>}
            </div>}
            <aside className="project-details-info" aria-labelledby="project-information-title">
              <h2 id="project-information-title">At a glance</h2>
              <dl><dt>Category</dt><dd>{project.category}</dd></dl>
              {technologies.length > 0 && <section aria-labelledby="project-technologies-title"><h3 id="project-technologies-title">Technologies</h3><ul className="project-details-technologies" role="list">{technologies.map((technology) => <li key={technology}>{technology}</li>)}</ul></section>}
              {website && <a className="projects-button projects-primary" href={website} target="_blank" rel="noopener noreferrer">Visit project website <span aria-hidden="true">↗</span><span className="public-projects-sr-only"> (opens in a new tab)</span></a>}
            </aside>
          </div>
          <section className="projects-contact" aria-labelledby="project-next-title"><div><p className="projects-eyebrow">YOUR NEXT IDEA</p><h2 id="project-next-title">Let’s talk about your project.</h2><p>Share the problem you want to solve and what matters most to you.</p></div><Link className="projects-button projects-primary" to="/contact">Contact Bitreca <span aria-hidden="true">↗</span></Link></section>
          <nav className="project-details-bottom-navigation" aria-label="Return to projects"><Link className="projects-back-link" to="/projects"><span aria-hidden="true">←</span> Back to all projects</Link></nav>
        </>}
      </div>
    </main>
  )
}

export default ProjectDetails
