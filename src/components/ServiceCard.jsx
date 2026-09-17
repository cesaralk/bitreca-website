function ServiceCard({ title, description }) {
  return (
    <article className="service-card">
      <h3>{title}</h3>
      <p>{description}</p>

      <a href="/services" className="service-link">
        Learn More <span>→</span>
      </a>
    </article>
  )
}

export default ServiceCard