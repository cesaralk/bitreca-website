import { NavLink, useNavigate } from 'react-router-dom'

import './AdminLayout.css'

function AdminLayout({ children }) {
 const navigate = useNavigate()

async function handleLogout() {
  try {
    const response = await fetch('/api/admin/logout', {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Logout failed.')
    }

    navigate('/admin/login', {
      replace: true,
    })
  } catch (error) {
    console.error('Logout failed:', error)
    alert('Could not log out. Please try again.')
  }
}
 
    return (
    <div className="admin-layout">

      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>BITRECA</span>
          <small>ADMIN</small>
        </div>

        <nav className="admin-nav">
          <NavLink to="/admin">
            Dashboard
          </NavLink>

          <NavLink to="/admin/projects">
            Projects
          </NavLink>

          <NavLink to="/admin/services">
            Services
          </NavLink>

          <NavLink to="/admin/products">
            Products
          </NavLink>

          <NavLink to="/admin/store">
            Store
          </NavLink>

          <NavLink to="/admin/messages">
            Messages
          </NavLink>

          <NavLink to="/admin/settings">
            Settings
          </NavLink>
        </nav>
      </aside>

      <div className="admin-main">

        <header className="admin-header">
          <div>
            <strong>Bitreca Admin</strong>
          </div>

          <div className="admin-user-area">
  <span>Administrator</span>

  <button
    type="button"
    className="admin-logout-button"
    onClick={handleLogout}
  >
    Logout
  </button>
</div>
        </header>

        <div className="admin-content">
          {children}
        </div>

      </div>

    </div>
  )
}

export default AdminLayout