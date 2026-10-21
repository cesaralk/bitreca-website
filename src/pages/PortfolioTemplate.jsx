
import PortfolioNavbar from '../components/PortfolioNavbar'
import './PortfolioTemplate.css'


const portfolioHighlights = [
  {
    title: 'Creative Thinking',
    description: 'Bringing fresh ideas and perspectives',
  },
  {
    title: 'Professional Experience',
    description: 'Applying knowledge to real-world challenges',
  },
  {
    title: 'Communication',
    description: 'Connecting and collaborating with people',
  },
]


const portfolioSkills = [
  {
    category: 'Professional Skills',
    items: [
      'Communication',
      'Problem Solving',
      'Teamwork',
      'Time Management',
    ],
  },
  {
    category: 'Areas of Expertise',
    items: [
      'Creative Thinking',
      'Project Planning',
      'Research',
      'Collaboration',
    ],
  },
]


const portfolioExperience = [
  {
    id: 1,
    title: 'Professional Role',
    organization: 'Example Organization',
    period: '2023 – Present',
    description:
      'Contributed to projects, collaborated with teams, and developed practical professional experience.',
  },
  {
    id: 2,
    title: 'Previous Position',
    organization: 'Previous Organization',
    period: '2020 – 2023',
    description:
      'Developed professional skills and gained valuable experience through everyday responsibilities.',
  },
]

const portfolioEducation = [
  {
    id: 1,
    title: 'Bachelor’s Degree',
    organization: 'Example University',
    period: '2016 – 2020',
    description:
      'Completed academic studies and developed foundational knowledge in the chosen field.',
  },
]


const portfolioWorks = [
  {
    id: 1,
    title: 'Creative Project',
    category: 'Featured Work',
    description:
      'A selected piece of work demonstrating creativity, planning, and professional execution.',
  },
  {
    id: 2,
    title: 'Collaborative Project',
    category: 'Teamwork',
    description:
      'A project completed through collaboration, communication, and shared goals.',
  },
  {
    id: 3,
    title: 'Personal Achievement',
    category: 'Achievement',
    description:
      'An important accomplishment reflecting dedication, learning, and professional growth.',
  },
]

function PortfolioTemplate() {
  return (
    <main className="portfolio-template">
      <PortfolioNavbar />


<section className="portfolio-hero" id="home">
  <div className="portfolio-availability">
    <span className="portfolio-status-dot"></span>
    Available for opportunities
  </div>

  <p>SOFTWARE DEVELOPER</p>

  <h1>
    Hi, I'm <span>Alex Morgan.</span>
  </h1>

  <p>
    I design and develop modern websites,
    applications, and digital experiences
    that make a difference.
  </p>

  <div className="portfolio-hero-actions">
    <a href="#projects" className="portfolio-primary-btn">
      View My Work →
    </a>

    <a href="#contact" className="portfolio-secondary-btn">
      Get In Touch
    </a>
  </div>
</section>

<section className="portfolio-about" id="about">
  <div className="portfolio-about-container">
    <div className="portfolio-about-heading">
      <span className="portfolio-section-label">
        GET TO KNOW ME
      </span>

      <h2>
        About <span>Me.</span>
      </h2>
    </div>

    <div className="portfolio-about-grid">
      <div className="portfolio-about-content">
        <h3>
          Passionate about building meaningful
          digital experiences.
        </h3>

        <p>
          I'm Alex Morgan, a software developer
          who enjoys turning ideas into functional,
          modern digital products.
        </p>

        <p>
          I focus on clean design, thoughtful user
          experiences, and reliable technology.
          My goal is to create solutions that
          make people's lives easier.
        </p>

        <a href="#contact" className="portfolio-primary-btn">
          Let's Work Together →
        </a>
      </div>

      <div className="portfolio-about-highlights">

<div className="portfolio-about-highlights">
  {portfolioHighlights.map((highlight) => (
    <div
      className="portfolio-highlight-card"
      key={highlight.title}
    >
      <strong>{highlight.title}</strong>
      <span>{highlight.description}</span>
    </div>
  ))}
</div>

      </div>
    </div>
  </div>
</section>

<section className="portfolio-skills" id="skills">
  <div className="portfolio-skills-container">
    <div className="portfolio-skills-heading">
      <span className="portfolio-section-label">
        WHAT I BRING
      </span>

      <h2>
        Skills &amp; <span>Expertise.</span>
      </h2>

      <p>
        A collection of abilities, strengths, and
        knowledge developed through experience.
      </p>
    </div>

    <div className="portfolio-skills-grid">
      {portfolioSkills.map((group) => (
        <div
          className="portfolio-skill-group"
          key={group.category}
        >
          <h3>{group.category}</h3>

          <div className="portfolio-skill-tags">
            {group.items.map((skill) => (
              <span
                className="portfolio-skill-tag"
                key={skill}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
</section>

<section className="portfolio-journey" id="experience">
  <div className="portfolio-journey-container">
    <div className="portfolio-journey-heading">
      <span className="portfolio-section-label">
        MY JOURNEY
      </span>

      <h2>
        Experience &amp; <span>Education.</span>
      </h2>

      <p>
        The professional experiences and learning
        opportunities that have shaped my journey.
      </p>
    </div>

    <div className="portfolio-journey-grid">
      <div className="portfolio-journey-column">
        <h3>Experience</h3>

        {portfolioExperience.map((item) => (
          <article
            className="portfolio-timeline-card"
            key={item.id}
          >
            <span className="portfolio-timeline-period">
              {item.period}
            </span>

            <h4>{item.title}</h4>
            <strong>{item.organization}</strong>
            <p>{item.description}</p>
          </article>
        ))}
      </div>

      <div className="portfolio-journey-column">
        <h3>Education</h3>

        {portfolioEducation.map((item) => (
          <article
            className="portfolio-timeline-card"
            key={item.id}
          >
            <span className="portfolio-timeline-period">
              {item.period}
            </span>

            <h4>{item.title}</h4>
            <strong>{item.organization}</strong>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
    </div>
  </div>
</section>

<section className="portfolio-work" id="projects">
  <div className="portfolio-work-container">
    <div className="portfolio-work-heading">
      <span className="portfolio-section-label">
        MY PORTFOLIO
      </span>

      <h2>
        Selected <span>Work.</span>
      </h2>

      <p>
        A selection of projects, achievements,
        and experiences that reflect my work.
      </p>
    </div>

    <div className="portfolio-work-grid">
      {portfolioWorks.map((work) => (
        <article className="portfolio-work-card" key={work.id}>
          <div className="portfolio-work-visual">
            <span>{work.category}</span>
          </div>

          <div className="portfolio-work-info">
            <span className="portfolio-work-category">
              {work.category}
            </span>

            <h3>{work.title}</h3>
            <p>{work.description}</p>
          </div>
        </article>
      ))}
    </div>
  </div>
</section>

    </main>
  )
}

export default PortfolioTemplate
