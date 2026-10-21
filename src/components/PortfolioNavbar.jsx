
function PortfolioNavbar() {
  return (
    <nav className="personal-portfolio-nav">
      <a className="personal-portfolio-logo" href="#home">
        AM<span>.</span>
      </a>

      <div className="personal-portfolio-links">
        <a href="#about">About</a>
        <a href="#skills">Skills</a>
        <a href="#projects">Projects</a>
        <a href="#contact">Contact</a>
      </div>

      <a className="personal-portfolio-hire" href="mailto:hello@example.com">
        Let's Talk
      </a>
    </nav>
  )
}

export default PortfolioNavbar
