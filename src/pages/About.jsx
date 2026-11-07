import { Link } from 'react-router-dom'
import './About.css'

const disciplines = [
  { name: 'Websites', text: 'A clear online presence, with content and interactions that help people take the next step.', target: 'websites' },
  { name: 'Applications', text: 'Digital products, dashboards and tools shaped around the people using them.', target: 'applications' },
  { name: 'Custom software', text: 'Purpose-built workflows and integrations for needs that ready-made tools do not quite fit.', target: 'custom-software' },
  { name: 'Games', text: 'Playable concepts and interactive experiences, starting with the core idea and how it feels to use.', target: 'game-development' },
]

const approach = [
  ['Understand before building', 'Start with the problem, the people and the workflow. A clear need gives the project a useful direction.'],
  ['Make the scope clear', 'Define priorities and a focused first release. Discuss features, constraints and expectations before expanding the idea.'],
  ['Build, review and refine', 'Review the experience against the goal. Give usability, responsiveness and the details of the interface a place in the work.'],
]

function About() {
  return (
    <main className="about-page">
      <section className="about-hero" aria-labelledby="about-title">
        <div className="about-container about-hero-grid">
          <div>
            <p className="about-eyebrow">BITRECA / ABOUT</p>
            <h1 id="about-title">Technology with<br /><span>a reason to exist.</span></h1>
            <p className="about-lead">Bitreca brings software development and technology together. We build websites, applications, custom software and games around real needs.</p>
            <div className="about-actions">
              <Link className="about-button about-primary" to="/contact">Tell us what you have in mind <span aria-hidden="true">↗</span></Link>
              <Link className="about-text-link" to="/projects">Explore our projects <span aria-hidden="true">→</span></Link>
            </div>
          </div>
          <aside className="about-perspective" aria-labelledby="about-perspective-title">
            <p className="about-eyebrow">OUR STARTING POINT</p>
            <h2 id="about-perspective-title">A real need.<br />A thoughtful response.</h2>
            <p>Good technology should feel intuitive, look refined and solve the problem it was created for.</p>
            <div className="about-idea-path" aria-hidden="true"><span>Understand</span><span>Build</span><span>Refine</span></div>
            <p className="about-perspective-foot">The goal gives the technology its direction.</p>
          </aside>
        </div>
      </section>

      <section className="about-container about-section" aria-labelledby="about-build-title">
        <div className="about-section-heading">
          <div><p className="about-eyebrow">WHAT WE BUILD</p><h2 id="about-build-title">Different forms.<br />The same purpose.</h2></div>
          <p>A business presence, a simpler process or an interactive idea. The right starting point depends on what you want to make possible.</p>
        </div>
        <div className="about-disciplines">
          {disciplines.map((item, index) => (
            <article className="about-discipline" key={item.target}>
              <span className="about-number" aria-hidden="true">0{index + 1}</span>
              <div><h3>{item.name}</h3><p>{item.text}</p><Link className="about-text-link" to={`/services#${item.target}`}>Explore {item.name.toLowerCase()} <span aria-hidden="true">↗</span></Link></div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-approach-wrap" aria-labelledby="about-approach-title">
        <div className="about-container about-section">
          <div className="about-section-heading">
            <div><p className="about-eyebrow">HOW WE APPROACH THE WORK</p><h2 id="about-approach-title">Clarity first.<br />Care in the details.</h2></div>
            <p>Our approach keeps decisions connected to the problem, from the first conversation to reviewing what has been built.</p>
          </div>
          <ol className="about-steps">
            {approach.map(([title, description], index) => <li key={title}><span className="about-step-number" aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{description}</p></li>)}
          </ol>
          <Link className="about-text-link" to="/services">See our services and process <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className="about-container about-section about-ambition" aria-labelledby="about-ambition-title">
        <div><p className="about-eyebrow">WHERE WE WANT TO GO</p><h2 id="about-ambition-title">Build useful things.<br /><span>Keep possibilities open.</span></h2><p>Our ambition is to create technology that earns its place in everyday life: tools that make work clearer, products that answer a need and experiences worth interacting with.</p><p>That direction includes both project work and software products. Different ideas can take different forms; usefulness remains the starting point.</p><Link className="about-text-link" to="/projects">View our project work <span aria-hidden="true">→</span></Link></div>
        <article className="about-product" aria-labelledby="about-product-title"><p className="about-eyebrow">A BITRECA SOFTWARE PRODUCT</p><h3 id="about-product-title">Stockly POS</h3><p>Point-of-sale and business management software for retail, bringing sales, inventory, purchases, services, reporting and daily operations together.</p><Link className="about-text-link" to="/products#stockly-pos">Explore Stockly POS <span aria-hidden="true">↗</span></Link></article>
      </section>

      <section className="about-container about-contact" aria-labelledby="about-contact-title">
        <div><p className="about-eyebrow">START A CONVERSATION</p><h2 id="about-contact-title">What should your<br />technology make possible?</h2><p>Bring an idea, an existing project or a problem you want to solve. We can start with the questions.</p></div>
        <Link className="about-button about-primary" to="/contact">Let’s discuss your project <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  )
}

export default About
