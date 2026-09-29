import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './AdminDashboard.css'

function AdminDashboard() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadProjects() {
      try {
        const response = await fetch('/api/admin/projects')
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || 'Could not load projects.')
        }

        setProjects(data.projects || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [])

  const totalProjects = projects.length

  const publishedProjects = projects.filter(
    (project) => project.status === 'published'
  ).length

  const draftProjects = projects.filter(
    (project) => project.status === 'draft'
  ).length

  const featuredProjects = projects.filter(
    (project) => project.featured === 1
  ).length

  if (loading) {
    return <p>Loading dashboard...</p>
  }

  return (
    <div className="admin-dashboard">

  <div className="admin-dashboard-header">
  <h1>Dashboard</h1>
  <p>Overview of your Bitreca content.</p>
</div>

      {error && <p>{error}</p>}

      {!error && (
  <div className="dashboard-stats">
          <div className="dashboard-stat-card">
  <h2>{totalProjects}</h2>
  <p>Total Projects</p>
</div>

          <div className="dashboard-stat-card">
            <h2>{publishedProjects}</h2>
            <p>Published</p>
          </div>

          <div className="dashboard-stat-card">
            <h2>{draftProjects}</h2>
            <p>Draft</p>
          </div>

         <div className="dashboard-stat-card">
            <h2>{featuredProjects}</h2>
            <p>Featured</p>
          </div>
        </div>
      )}

<div className="dashboard-section">
  <div className="dashboard-section-header">
    <div>
      <h2>Quick Actions</h2>
      <p>Common administration tasks.</p>
    </div>
  </div>

  <div className="dashboard-actions">
    <Link
  to="/admin/projects"
  className="dashboard-action"
>
  <strong>Manage Projects</strong>
  <span>
    Create, edit, publish and manage Bitreca projects.
  </span>
</Link>
  </div>
</div>

    </div>
  )
}

export default AdminDashboard