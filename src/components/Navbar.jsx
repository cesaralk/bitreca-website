import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigationType } from 'react-router-dom'
import './Navbar.css'

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigation = useRef(null), toggle = useRef(null), links = useRef(null)
  const location = useLocation(), navigationType = useNavigationType()

  const closeMenu = () => {
    setMenuOpen(false)
  }
  const toggleMenu = () => {
    if (!menuOpen) links.current?.scrollTo({ top: 0, behavior: 'instant' })
    setMenuOpen(open => !open)
  }

  useEffect(() => {
    if (!menuOpen) return
    const outside = event => { if (!navigation.current?.contains(event.target)) setMenuOpen(false) }
    const escape = event => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); toggle.current?.focus() }
    }
    const history = () => setMenuOpen(false)
    const desktop = window.matchMedia('(max-width: 1024px)')
    const resize = event => { if (!event.matches) setMenuOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('click', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('popstate', history)
    desktop.addEventListener('change', resize)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('click', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('popstate', history)
      desktop.removeEventListener('change', resize)
    }
  }, [menuOpen])

  useEffect(() => {
    // Forward navigation starts at the new page; Back keeps browser restoration.
    // Hash destinations also work across routes and on direct entry.
    if (!location.hash && navigationType === 'POP') return
    let target
    try { target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : document.querySelector('main h1') }
    catch { return }
    if (target) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    }
    if (location.hash) target?.scrollIntoView({ block: 'start', behavior: 'auto' })
    else window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.key, location.hash, navigationType])

  return (
    <nav className="navbar" aria-label="Primary navigation" ref={navigation}
      onBlurCapture={event => { if (menuOpen && !event.currentTarget.contains(event.relatedTarget)) closeMenu() }}>

      <Link to="/" className="navbar-logo" onClick={closeMenu} aria-label="Bitreca home">
        BITRECA
      </Link>

      <button
        className={`menu-toggle ${menuOpen ? 'active' : ''}`}
        type="button"
        ref={toggle}
        onClick={toggleMenu}
        aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-controls="primary-navigation-links"
        aria-expanded={menuOpen}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div id="primary-navigation-links" className={`navbar-links ${menuOpen ? 'open' : ''}`} ref={links}>
        <NavLink to="/" end onClick={closeMenu}>Home</NavLink>
        <NavLink to="/services" onClick={closeMenu}>Services</NavLink>
        <NavLink to="/products" onClick={closeMenu}>Products</NavLink>
        <NavLink to="/store" onClick={closeMenu}>Store</NavLink>
        <NavLink to="/projects" onClick={closeMenu}>Projects</NavLink>
        <NavLink to="/portfolioforest" onClick={closeMenu}>PortfolioForest</NavLink>
        <NavLink to="/about" onClick={closeMenu}>About</NavLink>
        <NavLink to="/contact" onClick={closeMenu}>Contact</NavLink>
      </div>

    </nav>
  )
}

export default Navbar
