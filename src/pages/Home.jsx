import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './Home.css'
import ServiceCard from '../components/ServiceCard'
import ProductCard from '../components/ProductCard'
import StoreCategory from '../components/StoreCategory'
import ProjectCard from '../components/ProjectCard'
import ValueCard from '../components/ValueCard'
import TestimonialCard from '../components/TestimonialCard'
import Reveal from '../components/Reveal'

function Home() {

  const [projects, setProjects] = useState([])

useEffect(() => {
  async function loadProjects() {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()

      if (data.success) {
        setProjects(data.projects)
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }

  loadProjects()
}, [])
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
  <Link to="/services" className="btn btn-primary">
    Explore Our Services
  </Link>

  <Link to="/contact" className="btn btn-secondary">
    Start a Project
  </Link>
</div>
<div className="hero-visual" aria-hidden="true">

  <div className="hero-orbit hero-orbit-one">
    <span className="orbit-marker"></span>
  </div>

  <div className="hero-orbit hero-orbit-two">
    <span className="orbit-marker"></span>
  </div>

  <div className="hero-orbit hero-orbit-three">
    <span className="orbit-marker"></span>
  </div>

  <div className="hero-core">
    <span>B</span>
  </div>

  <div className="hero-node hero-node-one"></div>
  <div className="hero-node hero-node-two"></div>
  <div className="hero-node hero-node-three"></div>

</div>
        </div>

      </section>
<section className="intro">

<Reveal>
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
</Reveal>
</section>
<section className="services-section">

  <div className="services-container">

    <Reveal>
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
    </Reveal>


    <div className="services-grid">

      <Reveal delay={0}>
        <ServiceCard
          title="Website Development"
          description="Modern, responsive websites designed around your brand, audience and business goals."
        />
      </Reveal>

      <Reveal delay={100}>
        <ServiceCard
          title="Applications"
          description="Web, desktop and mobile applications built to make work simpler and experiences better."
        />
      </Reveal>

      <Reveal delay={200}>
        <ServiceCard
          title="Custom Software"
          description="Software designed around real workflows, from business systems to specialized digital tools."
        />
      </Reveal>

      <Reveal delay={300}>
        <ServiceCard
          title="Game Development"
          description="Interactive games and digital experiences built with creativity, technology and engaging ideas."
        />
      </Reveal>

    </div>

  </div>

</section>
<section className="products-section">

  <div className="products-container">

    <div className="products-heading">

      <div>
        <p className="section-label">
          OUR PRODUCTS
        </p>

        <h2>
          Software built by
          <span> Bitreca.</span>
        </h2>
      </div>

      <p className="products-intro">
        We don't only build technology for clients.
        We create our own software products designed
        to solve real business problems.
      </p>

    </div>

    <ProductCard
      name="Stockly POS"
      category="Business Software"
      status="Available"
      description="A complete point-of-sale and business management system designed for retail businesses, combining sales, inventory, purchases, services, reporting and daily operations in one platform."
    />

  </div>

</section>

<section className="store-section">

  <div className="store-container">

    <div className="store-heading">

      <div>
        <p className="section-label">
          TECHNOLOGY STORE
        </p>

        <h2>
          Hardware for the
          <span> technology around you.</span>
        </h2>
      </div>

      <div className="store-heading-right">
        <p>
          Explore computer components, upgrades and accessories
          selected for work, gaming and everyday technology.
        </p>

        <a href="/store" className="store-view-all">
          Explore Store <span>→</span>
        </a>
      </div>

    </div>

    <div className="store-grid">

      <StoreCategory
        icon="◈"
        title="Storage"
        description="SSD and HDD solutions for speed, capacity and reliability."
      />

      <StoreCategory
        icon="▤"
        title="Memory"
        description="RAM upgrades for smoother multitasking and better performance."
      />

      <StoreCategory
        icon="◇"
        title="Graphics"
        description="Graphics hardware for gaming, creative work and demanding applications."
      />

      <StoreCategory
        icon="▣"
        title="Displays"
        description="Monitors for productivity, entertainment and gaming."
      />

      <StoreCategory
        icon="⌁"
        title="Peripherals"
        description="Keyboards, mice and accessories for your complete setup."
      />

    </div>

  </div>

</section>

<section className="projects-section">

  <div className="projects-container">

    <div className="projects-heading">

      <div>
        <p className="section-label">
          FEATURED PROJECTS
        </p>

        <h2>
          Built to solve
          <span> real problems.</span>
        </h2>
      </div>

      <div className="projects-heading-right">
        <p>
          A selection of software and digital solutions developed
          around real workflows, ideas and business needs.
        </p>

        <Link to="/projects" className="projects-view-all">
          View All Projects <span>→</span>
        </Link>
      </div>

    </div>

    <div className="projects-grid">

  {projects
    .filter((project) => project.featured === 1)
    .map((project) => (
      <ProjectCard
        key={project.id}
        title={project.title}
        category={project.category}
        description={project.description}
        tags={[]}
        imageUrl={project.image_url}
      />
    ))}

</div>

  </div>

</section>

<section className="why-section">

  <div className="why-container">

    <div className="why-heading">

      <p className="section-label">
        WHY BITRECA
      </p>

      <h2>
        Technology should do more than
        <span> simply work.</span>
      </h2>

      <p className="why-intro">
        We believe good technology should feel intuitive, look refined
        and solve the problem it was created for. Every Bitreca project
        starts with understanding what actually needs to be built.
      </p>

    </div>

    <div className="values-grid">

      <ValueCard
        title="Built Around Real Needs"
        description="We start with the problem, the people and the workflow before deciding how technology should solve it."
      />

      <ValueCard
        title="Quality in the Details"
        description="From interface design to performance and responsiveness, the small details are part of the product—not an afterthought."
      />

      <ValueCard
        title="Technology Without Limits"
        description="Websites are only one part of what we build. Bitreca works across applications, custom software, digital products and interactive technology."
      />

      <ValueCard
        title="Built for What Comes Next"
        description="We design solutions with growth in mind, creating foundations that can evolve as businesses, ideas and technology change."
      />

    </div>

  </div>

</section>

<section className="testimonials-section">

  <div className="testimonials-container">

    <div className="testimonials-heading">

      <div>
        <p className="section-label">
          CLIENT EXPERIENCES
        </p>

        <h2>
          Built together.
          <span> Trusted afterward.</span>
        </h2>
      </div>

      <p className="testimonials-intro">
        Every project is a collaboration. We focus on understanding
        the need, building the right solution and creating technology
        our clients can rely on.
      </p>

    </div>

    <div className="testimonials-grid">

      <TestimonialCard
        quote="Customer testimonial will be added here."
        name="Client"
        role="Business Owner"
        company=""
      />

      <TestimonialCard
        quote="Customer testimonial will be added here."
        name="Client"
        role="Business Owner"
        company=""
      />

    </div>

  </div>

</section>

<section className="final-cta">

  <div className="final-cta-container">

    <p className="section-label">
      LET'S BUILD SOMETHING
    </p>

    <h2>
      Have an idea?
      <span> Let's build what comes next.</span>
    </h2>

    <p className="final-cta-description">
      From websites and applications to custom software and digital
      products, tell us what you want to build and let's turn the idea
      into something real.
    </p>

    <div className="final-cta-actions">

      <Link to="/contact" className="btn btn-primary">
        Start a Project
      </Link>

      <Link to="/services" className="btn btn-secondary">
        Explore Services
      </Link>

    </div>

  </div>

</section>

    </main>
  )
}

export default Home