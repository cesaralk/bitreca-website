import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom'

import Navbar from './components/Navbar'
import Footer from './components/Footer'
import PageMetadata from './components/PageMetadata'

import Home from './pages/Home'
import Services from './pages/Services'
import Products from './pages/Products'
import Store from './pages/Store'
import StoreProduct from './pages/StoreProduct'
import StoreRequest from './pages/StoreRequest'
import Projects from './pages/Projects'
import PortfolioForest from './pages/PortfolioForest'
import ProjectDetails from './pages/ProjectDetails'
import About from './pages/About'
import Contact from './pages/Contact'

// NEW ADMIN PAGE
import AdminProjects from './pages/AdminProjects'
import AdminPortfolios from './pages/AdminPortfolios'
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './components/AdminLayout'
import ProtectedAdminRoute from './components/ProtectedAdminRoute'
import AdminDashboard from './pages/AdminDashboard'
import AdminEnquiries from './pages/AdminEnquiries'
import AdminStore from './pages/AdminStore'
import AdminStoreRequests from './pages/AdminStoreRequests'
import PortfolioTemplate from './pages/PortfolioTemplate'

function AppContent() {
  const location = useLocation()

  const isAdmin = location.pathname.startsWith('/admin')
  const isPortfolio = location.pathname.startsWith('/portfolio/')

  return (
    <>
    {(!isPortfolio || location.pathname === '/portfolio/demo') && <PageMetadata />}
    {!isAdmin && !isPortfolio && <Navbar />}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/products" element={<Products />} />
        <Route path="/store" element={<Store />} />
        <Route path="/store/:slug" element={<StoreProduct />} />
        <Route path="/store/request/review" element={<StoreRequest />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/portfolioforest" element={<PortfolioForest />} />
        <Route path="/portfolio/demo" element={<PortfolioTemplate />} />
        <Route
  path="/projects/:slug"
  element={<ProjectDetails />}
/>
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/admin/enquiries" element={<ProtectedAdminRoute><AdminLayout><AdminEnquiries /></AdminLayout></ProtectedAdminRoute>} />
        <Route path="/admin/store" element={<ProtectedAdminRoute><AdminLayout><AdminStore /></AdminLayout></ProtectedAdminRoute>} />
        <Route path="/admin/store/requests" element={<ProtectedAdminRoute><AdminLayout><AdminStoreRequests /></AdminLayout></ProtectedAdminRoute>} />

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

<Route
  path="/admin/portfolios"
  element={
    <ProtectedAdminRoute>
      <AdminLayout>
        <AdminPortfolios />
      </AdminLayout>
    </ProtectedAdminRoute>
  }
/>

      </Routes>

      {!isAdmin && !isPortfolio && <Footer />}
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
