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
import ProjectDetails from './pages/ProjectDetails'
import About from './pages/About'
import Contact from './pages/Contact'

// NEW ADMIN PAGE
import AdminProjects from './pages/AdminProjects'
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './components/AdminLayout'
import ProtectedAdminRoute from './components/ProtectedAdminRoute'
import AdminDashboard from './pages/AdminDashboard'

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
        <Route
  path="/projects/:slug"
  element={<ProjectDetails />}
/>
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />

<Route
  path="/admin/login"
  element={<AdminLogin />}
/>
<Route
  path="/admin"
  element={
    <ProtectedAdminRoute>
      <AdminLayout>
        <AdminDashboard />
      </AdminLayout>
    </ProtectedAdminRoute>
  }
/>
    <Route
  path="/admin/projects"
  element={
    <ProtectedAdminRoute>
      <AdminLayout>
        
        <AdminProjects />
      </AdminLayout>
    </ProtectedAdminRoute>
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