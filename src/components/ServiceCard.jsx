import { Link } from 'react-router-dom'

function ServiceCard({ title, description, to = '/services' }) {
  return (
    <article className="service-card">
      <h3>{title}</h3>
      <p>{description}</p>

      <Link to={to} className="service-link" aria-label={`Learn more about ${title}`}>
  Learn More <span>→</span>
</Link>
    </article>
  )
}

export default ServiceCard
