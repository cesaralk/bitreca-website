import './Navbar.css'

function Navbar() {
  return (
    <nav className="navbar">

      <a href="/" className="navbar-logo">
        BITRECA
      </a>

      <div className="navbar-links">
        <a href="/">Home</a>
        <a href="/services">Services</a>
        <a href="/products">Products</a>
        <a href="/store">Store</a>
        <a href="/projects">Projects</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </div>

    </nav>
  )
}

export default Navbar