import { Link } from 'react-router-dom'
import PublicProjectImage from './PublicProjectImage'

function ProjectCard({ title, category, description, tags, imageUrl, slug, appearance }) {
  // The public listing opts in; the approved Homepage keeps its legacy markup.
  if (appearance === 'public') {
    return (
      <article className="public-project-card" aria-labelledby={`project-${slug}-title`}>
        <PublicProjectImage imageUrl={imageUrl} title={title} />
        <div className="public-project-card-content">
          <p className="public-project-card-category">{category}</p>
          <h3 id={`project-${slug}-title`}>{title}</h3>
          <p className="public-project-card-description">{description}</p>
          <Link className="public-project-card-link" to={`/projects/${encodeURIComponent(slug)}`}>View project<span className="public-projects-sr-only">: {title}</span> <span aria-hidden="true">↗</span></Link>
        </div>
      </article>
    )
  }
  return (
    <article className="project-card">

      <div className="project-visual">
        <div className="project-browser">
          <div className="project-browser-bar">
            <span></span>
            <span></span>
            <span></span>
          </div>

          <div className="project-preview">
  {imageUrl ? (
    <img
      src={imageUrl}
      alt={title}
      className="project-preview-image"
    />
  ) : (
    <span>{title}</span>
  )}
</div>
        </div>
      </div>

      <div className="project-content">

        <p className="project-category">
          {category}
        </p>

        <h3>{title}</h3>

        <p className="project-description">
          {description}
        </p>

        <div className="project-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <Link
  to={`/projects/${slug}`}
  className="project-link"
>
  View Project <span>→</span>
</Link>

      </div>

    </article>
  )
}

export default ProjectCard
