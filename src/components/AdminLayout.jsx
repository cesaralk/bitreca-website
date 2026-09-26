import { NavLink } from 'react-router-dom'

import './AdminLayout.css'

function AdminLayout({ children }) {
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

          <div className="admin-header-user">
            Administrator
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