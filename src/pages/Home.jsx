import './Home.css'
import ServiceCard from '../components/ServiceCard'

function Home() {
  return (
    <main>

      <section className="hero">

        <div className="hero-content">

          <p className="hero-label">
            SOFTWARE • DIGITAL • TECHNOLOGY
          </p>

          <h1>
            Technology Built
            <span> for What's Next.</span>
          </h1>

          <p className="hero-description">
            Bitreca creates websites, applications, software,
            games and technology solutions built around real ideas
            and real business needs.
          </p>

          <div className="hero-buttons">

            <a href="/services" className="btn btn-primary">
              Explore Our Services
            </a>

            <a href="/contact" className="btn btn-secondary">
              Start a Project
            </a>

          </div>

        </div>

      </section>
<section className="intro">

  <div className="intro-content">

    <p className="section-label">
      WHO WE ARE
    </p>

    <h2>
      One technology company.
      <br />
      Many possibilities.
    </h2>

    <p>
      Bitreca brings software development and technology together.
      From websites and business applications to custom software,
      games and computer hardware, we build and provide technology
      designed to solve real needs.
    </p>

  </div>

</section>
<section className="services-section">

  <div className="services-container">

    <div className="services-heading">

      <div>
        <p className="section-label">WHAT WE DO</p>

        <h2>
          From idea to
          <span> digital reality.</span>
        </h2>
      </div>

      <p className="services-intro">
        We design and develop technology that helps businesses,
        organizations and ideas move forward.
      </p>

    </div>


    <div className="services-grid">

      <ServiceCard
        title="Website Development"
        description="Modern, responsive websites designed around your brand, audience and business goals."
      />

      <ServiceCard
        title="Applications"
        description="Web, desktop and mobile applications built to make work simpler and experiences better."
      />

      <ServiceCard
        title="Custom Software"
        description="Software designed around real workflows, from business systems to specialized digital tools."
      />

      <ServiceCard
        title="Game Development"
        description="Interactive games and digital experiences built with creativity, technology and engaging ideas."
      />

    </div>

  </div>

</section>

    </main>
  )
}

export default Home