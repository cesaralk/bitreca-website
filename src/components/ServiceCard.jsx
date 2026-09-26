import { Link } from 'react-router-dom'

function ServiceCard({ title, description }) {
  return (
    <article className="service-card">
      <h3>{title}</h3>
      <p>{description}</p>

      <Link to="/services" className="service-link">
  Learn More <span>→</span>
</Link>
    </article>
  )
}

export default ServiceCard