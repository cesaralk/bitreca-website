import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import ProjectCard from '../components/ProjectCard'
import usePublicProjects from '../hooks/usePublicProjects'
import './Projects.css'

function Projects() {
  const { data: projects, status, retry } = usePublicProjects()
  const heading = useRef(null)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    heading.current?.focus({ preventScroll: true })
  }, [])

  return (
    <main className="projects-page">
      <header className="projects-page-hero">
        <div className="projects-page-container">
          <p className="projects-eyebrow">BITRECA / PROJECTS</p>
          <h1 ref={heading} tabIndex={-1}>Technology built around<br /><span>real needs.</span></h1>
          <p className="projects-page-intro">Explore published projects from Bitreca. Open a project for its overview, imagery and available technical details.</p>
        </div>
      </header>

      <section className="projects-page-content projects-page-container" aria-labelledby="projects-list-title" aria-busy={status === 'loading'}>
        <div className="projects-list-heading"><div><p className="projects-eyebrow">PUBLISHED WORK</p><h2 id="projects-list-title">Explore the projects.</h2></div>{status === 'ready' && projects.length > 0 && <p>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</p>}</div>
        {status === 'loading' && <div className="projects-state" role="status"><span className="projects-state-mark" aria-hidden="true">…</span><p>Loading published projects…</p></div>}
        {status === 'error' && <div className="projects-state" role="alert"><h3>Projects could not be loaded.</h3><p>Please try again. You can also contact Bitreca directly.</p><div className="projects-actions"><button className="projects-button projects-primary" type="button" onClick={retry}>Try again</button><Link className="projects-button projects-secondary" to="/contact">Contact Bitreca</Link></div></div>}
        {status === 'ready' && projects.length === 0 && <div className="projects-state" role="status"><h3>No published projects yet.</h3><p>Published work will appear here when available. If you have an idea to discuss, get in touch.</p><Link className="projects-button projects-primary" to="/contact">Discuss your project <span aria-hidden="true">↗</span></Link></div>}
        {status === 'ready' && projects.length > 0 && <div className="public-project-grid">{projects.map((project) => <ProjectCard key={project.slug} appearance="public" title={project.title} category={project.category} description={project.description} imageUrl={project.image_url} slug={project.slug} />)}</div>}
      </section>

      {status === 'ready' && projects.length > 0 && <section className="projects-page-container projects-contact" aria-labelledby="projects-contact-title"><div><p className="projects-eyebrow">WHAT COMES NEXT?</p><h2 id="projects-contact-title">Have a project in mind?</h2><p>Tell us about your idea, the people it is for and what you need to achieve.</p></div><Link className="projects-button projects-primary" to="/contact">Start a conversation <span aria-hidden="true">↗</span></Link></section>}
    </main>
  )
}

export default Projects
