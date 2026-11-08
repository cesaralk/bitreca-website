import { Link } from 'react-router-dom'
import { contactRecipient, contactWhatsAppUrl } from '../../shared/contact-enquiry'
import './Footer.css'

function Footer() {
  return (
    <footer className="footer">

      <div className="footer-container">

        <div className="footer-main">

          <div className="footer-brand">
            <Link to="/" className="footer-logo">
              BITRECA
            </Link>

            <p>
              Building websites, applications, software and technology
              designed for what comes next.
            </p>
            <address className="footer-contact">
              <a href={`mailto:${contactRecipient}`}>{contactRecipient}</a>
              <a href={contactWhatsAppUrl({})} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp +961 70 864 221 (opens a new tab)">WhatsApp: +961 70 864 221</a>
            </address>
          </div>

          <nav className="footer-links" aria-label="Footer navigation">

            <div className="footer-column">
              <h3>Company</h3>

              <Link to="/about">About</Link>
              <Link to="/projects">Projects</Link>
              <Link to="/contact">Contact</Link>
            </div>

            <div className="footer-column">
              <h3>Technology</h3>

              <Link to="/services">Services</Link>
              <Link to="/products">Products</Link>
              <Link to="/store">Store</Link>
              <Link to="/portfolioforest">PortfolioForest</Link>
            </div>

            <div className="footer-column">
              <h3>Services</h3>

              <Link to="/services#websites">Web Development</Link>
              <Link to="/services#applications">Applications</Link>
              <Link to="/services#custom-software">Custom Software</Link>
              <Link to="/services#game-development">Game Development</Link>
            </div>

          </nav>

        </div>

        <div className="footer-bottom">

          <p>
            © {new Date().getFullYear()} Bitreca. All rights reserved.
          </p>

          <p className="footer-tagline">
            Technology Built for What's Next.
          </p>

        </div>

      </div>

    </footer>
  )
}

export default Footer
