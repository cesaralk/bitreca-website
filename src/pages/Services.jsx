import { Link } from 'react-router-dom'
import './Services.css'

const services = [
  { id: 'websites', label: 'Web development', title: 'A better place for your business online.', description: 'Give people a clear way to understand your business, explore what you offer and take the next step. Build a new website or rethink one that no longer fits.', items: ['Business websites and landing pages', 'Responsive layouts and accessible interfaces', 'Content structure, enquiry flows and integrations'], fit: 'For launching online or improving an existing presence.', cta: 'Discuss a website' },
  { id: 'applications', label: 'Applications', title: 'Turn everyday tasks into clear experiences.', description: 'Bring a product idea or a recurring workflow into an application people can use. Plan screens, interactions and features around the people doing the work.', items: ['Web applications and customer portals', 'Dashboards and internal team tools', 'Interactive prototypes and focused first releases'], fit: 'For a digital product, a customer experience or a tool your team needs.', cta: 'Discuss an application' },
  { id: 'custom-software', label: 'Custom software', title: 'Software shaped around how you work.', description: 'When ready-made tools leave gaps, define a solution around your processes. Connect information, reduce repetitive steps and give your team a clearer way to work.', items: ['Business workflow automation', 'System integrations and data exchange', 'Purpose-built operational tools'], fit: 'For processes that need more flexibility than an off-the-shelf product offers.', cta: 'Discuss custom software' },
  { id: 'game-development', label: 'Game development', title: 'Give your idea something people can play.', description: 'Explore the core interaction before expanding the experience. Start with a playable concept, refine the mechanics and define the scope for the intended platform.', items: ['Game concepts and playable prototypes', 'Gameplay systems and interface development', 'Interactive experiences and playtesting'], fit: 'For testing a game idea or planning an interactive experience.', cta: 'Discuss a game' },
]

const steps = [
  ['Understand the need', 'Start with the problem, the people using the solution and what a useful result looks like. Bring an idea, a brief or an existing product.'],
  ['Define the scope', 'Agree on priorities, deliverables and technical requirements. Discuss the budget and schedule around a clear first release.'],
  ['Build and review', 'Develop the agreed features and review the experience together. Use feedback to refine the details and keep decisions tied to the goal.'],
  ['Prepare for handover', 'Check the agreed requirements and plan the launch, documentation and handover. Discuss ongoing support separately.'],
]

const questions = [
  ['What if I am not sure which service I need?', 'Start with what you want to achieve or the problem you want to solve. Websites, applications and custom software can overlap; the scope should follow the need.'],
  ['How much will my project cost, and how long will it take?', 'Features, complexity, content and integrations affect the estimate. Share your priorities, target budget and any deadline so these can be discussed before work begins.'],
  ['Can a project start with a smaller first version?', 'A focused first release or prototype can help test the main idea. Identify the essential features first, then discuss what belongs in a later phase.'],
  ['Can we discuss an existing website or application?', 'Yes. Share what you have, what is working and what needs to change. Existing code, access and technical constraints need to be reviewed before agreeing on an approach.'],
]

function Services() {
  return (
    <main className="services-page">
      <section className="services-hero" aria-labelledby="services-title">
        <div className="services-container services-hero-grid">
          <div>
            <p className="services-eyebrow">BITRECA / SERVICES</p>
            <h1 id="services-title">Your next idea.<br /><span>Built with purpose.</span></h1>
            <p className="services-lead">Websites, applications, custom software and games. Start with what you need to achieve. Shape the technology around it.</p>
            <div className="services-actions">
              <Link className="services-button services-primary" to="/contact">Let’s discuss your project <span aria-hidden="true">↗</span></Link>
              <a className="services-button services-secondary" href="#services-offering">Explore the services <span aria-hidden="true">↓</span></a>
            </div>
          </div>
          <aside className="services-note" aria-labelledby="services-note-title">
            <p className="services-eyebrow">THE STARTING POINT</p>
            <h2 id="services-note-title">What do you want<br />to make possible?</h2>
            <p>A clearer online presence. A simpler workflow. A product people can use. An idea they can play.</p>
            <p className="services-note-bottom">A clear goal comes first.</p>
          </aside>
        </div>
      </section>

      <nav className="services-container services-jump-nav" aria-label="Explore service categories">
        {services.map((service, index) => <a key={service.id} href={`#${service.id}`}><span aria-hidden="true">0{index + 1}</span>{service.label}<span aria-hidden="true">↘</span></a>)}
      </nav>

      <section className="services-section services-container" id="services-offering" aria-labelledby="services-offering-title">
        <div className="services-heading">
          <div><p className="services-eyebrow">WHAT WE CAN BUILD</p><h2 id="services-offering-title">Different needs.<br />Thoughtful solutions.</h2></div>
          <p>Choose a starting point below. The features, platforms and deliverables are defined around your project.</p>
        </div>
        <div className="services-grid">
          {services.map((service, index) => (
            <article className="services-card" id={service.id} key={service.id} aria-labelledby={`${service.id}-title`}>
              <div className="services-card-top"><p className="services-eyebrow">{service.label}</p><span aria-hidden="true">0{index + 1}</span></div>
              <h3 id={`${service.id}-title`}>{service.title}</h3>
              <p>{service.description}</p>
              <ul>{service.items.map((item) => <li key={item}>{item}</li>)}</ul>
              <p className="services-fit">{service.fit}</p>
              <Link className="services-text-link" to="/contact">{service.cta} <span aria-hidden="true">↗</span></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="services-process" aria-labelledby="services-process-title">
        <div className="services-container services-section">
          <div className="services-heading">
            <div><p className="services-eyebrow">HOW WE APPROACH A PROJECT</p><h2 id="services-process-title">From the first question<br />to the next step.</h2></div>
            <p>A practical path for defining the work, making decisions and preparing a solution for use.</p>
          </div>
          <ol className="services-steps">{steps.map(([title, description], index) => <li key={title}><span aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
        </div>
      </section>

      <section className="services-section services-container services-faq" aria-labelledby="services-faq-title">
        <div><p className="services-eyebrow">BEFORE YOU START</p><h2 id="services-faq-title">A few useful answers.</h2><p>You do not need a technical brief to start a conversation.</p></div>
        <div className="services-questions">{questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
      </section>

      <section className="services-container services-contact-wrap" aria-labelledby="services-contact-title">
        <div className="services-contact">
          <div><p className="services-eyebrow">LET’S TALK ABOUT YOUR IDEA</p><h2 id="services-contact-title">Start with the problem.<br /><span>Build what comes next.</span></h2><p>Tell us what you want to build, who it is for and what matters most. If you have a budget or deadline in mind, include that too.</p></div>
          <Link className="services-button services-primary" to="/contact">Start a conversation <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>
  )
}

export default Services
