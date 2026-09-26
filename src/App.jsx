import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom'

import Navbar from './components/Navbar'
import Footer from './components/Footer'

import Home from './pages/Home'
import Services from './pages/Services'
import Products from './pages/Products'
import Store from './pages/Store'
import Projects from './pages/Projects'
import About from './pages/About'
import Contact from './pages/Contact'

// NEW ADMIN PAGE
import AdminProjects from './pages/AdminProjects'
import AdminLayout from './components/AdminLayout'


function AppContent() {
  const location = useLocation()

  const isAdmin = location.pathname.startsWith('/admin')

  return (
    <>
      {!isAdmin && <Navbar />}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/products" element={<Products />} />
        <Route path="/store" element={<Store />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />

        <Route
  path="/admin/projects"
  element={
    <AdminLayout>
      <AdminProjects />
    </AdminLayout>
  }
/>
      </Routes>

      {!isAdmin && <Footer />}
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App