function TestimonialCard({ quote, name, company, role }) {
  return (
    <article className="testimonial-card">

      <div className="testimonial-quote-mark">
        “
      </div>

      <blockquote>
        {quote}
      </blockquote>

      <div className="testimonial-person">
        <div className="testimonial-avatar">
          {name.charAt(0)}
        </div>

        <div>
          <h3>{name}</h3>

          <p>
            {role}
            {company && <span> • {company}</span>}
          </p>
        </div>
      </div>

    </article>
  )
}

export default TestimonialCard