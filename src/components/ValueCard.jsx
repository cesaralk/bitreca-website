function ValueCard({ title, description }) {
  return (
    <article className="value-card">
      <div className="value-card-line"></div>

      <h3>{title}</h3>

      <p>{description}</p>
    </article>
  )
}

export default ValueCard