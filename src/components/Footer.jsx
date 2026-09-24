import { Link } from 'react-router-dom'
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
          </div>

          <div className="footer-links">

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
            </div>

            <div className="footer-column">
              <h3>Services</h3>

              <Link to="/services">Web Development</Link>
              <Link to="/services">Applications</Link>
              <Link to="/services">Custom Software</Link>
              <Link to="/services">Game Development</Link>
            </div>

          </div>

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