import { Link } from 'react-router-dom'

function ProjectCard({ title, category, description, tags, imageUrl }) {
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

        <Link to="/projects" className="project-link">
          View Project <span>→</span>
        </Link>

      </div>

    </article>
  )
}

export default ProjectCard