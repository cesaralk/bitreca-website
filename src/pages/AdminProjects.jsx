import { useEffect, useState } from 'react'
import './AdminProjects.css'

function AdminProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  const [showCreateForm, setShowCreateForm] = useState(false)

  const [editingProject, setEditingProject] = useState(null)

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    category: '',
    description: '',
    status: 'draft',
    featured: false,
  })

  useEffect(() => {
    async function loadProjects() {
      try {
        const response = await fetch('/api/admin/projects')
        const data = await response.json()

        if (data.success) {
          setProjects(data.projects)
        }
      } catch (error) {
        console.error('Failed to load admin projects:', error)
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [])

  function handleFormChange(event) {
    const { name, value, type, checked } = event.target

    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

function closeProjectForm() {
  setShowCreateForm(false)
  setEditingProject(null)

  setFormData({
    title: '',
    slug: '',
    category: '',
    description: '',
    status: 'draft',
    featured: false,
  })
}

function handleEditProject(project) {
  setEditingProject(project)

  setFormData({
    title: project.title,
    slug: project.slug,
    category: project.category,
    description: project.description,
    status: project.status,
    featured: project.featured === 1,
  })

  setShowCreateForm(true)
}

async function handleUpdateProject(event) {
  event.preventDefault()

  if (!editingProject) {
    return
  }

  try {
    const response = await fetch(
      `/api/admin/projects/${editingProject.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          featured: formData.featured ? 1 : 0,
        }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      alert(data.message || 'Could not update project.')
      return
    }

    const projectsResponse = await fetch('/api/admin/projects')
    const projectsData = await projectsResponse.json()

    if (projectsData.success) {
      setProjects(projectsData.projects)
    }

    setEditingProject(null)

    setFormData({
      title: '',
      slug: '',
      category: '',
      description: '',
      status: 'draft',
      featured: false,
    })

    setShowCreateForm(false)

    alert('Project updated successfully.')
  } catch (error) {
    console.error('Failed to update project:', error)
    alert('Something went wrong while updating the project.')
  }
}

async function handleTogglePublish(project) {
  const newStatus =
    project.status === 'published'
      ? 'draft'
      : 'published'

  try {
    const response = await fetch(
      `/api/admin/projects/${project.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...project,
          status: newStatus,
        }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      alert(data.message || 'Could not update project status.')
      return
    }

    setProjects((currentProjects) =>
      currentProjects.map((currentProject) =>
        currentProject.id === project.id
          ? {
              ...currentProject,
              status: newStatus,
            }
          : currentProject
      )
    )
  } catch (error) {
    console.error(
      'Failed to update project status:',
      error
    )

    alert(
      'Something went wrong while updating the project status.'
    )
  }
}

async function handleDeleteProject(project) {
  const confirmed = window.confirm(
    `Are you sure you want to delete "${project.title}"?\n\nThis action cannot be undone.`
  )

  if (!confirmed) {
    return
  }

  try {
    const response = await fetch(
      `/api/admin/projects/${project.id}`,
      {
        method: 'DELETE',
      }
    )

    const data = await response.json()

    if (!response.ok) {
      alert(data.message || 'Could not delete project.')
      return
    }

    setProjects((currentProjects) =>
      currentProjects.filter(
        (currentProject) => currentProject.id !== project.id
      )
    )

    alert('Project deleted successfully.')
  } catch (error) {
    console.error('Failed to delete project:', error)
    alert('Something went wrong while deleting the project.')
  }
}

  async function handleCreateProject(event) {
  event.preventDefault()

  try {
    const response = await fetch('/api/admin/projects', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        ...formData,
        featured: formData.featured ? 1 : 0,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      alert(data.message || 'Could not create project.')
      return
    }

    const projectsResponse = await fetch('/api/admin/projects')
    const projectsData = await projectsResponse.json()

    if (projectsData.success) {
      setProjects(projectsData.projects)
    }

    setFormData({
      title: '',
      slug: '',
      category: '',
      description: '',
      status: 'draft',
      featured: false,
    })

    setShowCreateForm(false)

    alert('Project created successfully.')
  } catch (error) {
    console.error('Failed to create project:', error)
    alert('Something went wrong while creating the project.')
  }
}

  if (loading) {
    return (
      <div className="admin-projects-loading">
        Loading projects...
      </div>
    )
  }

  return (
    <div className="admin-projects">

      <div className="admin-page-heading">
        <div>
          <p className="admin-page-label">CONTENT</p>

          <h1>Projects</h1>

          <p className="admin-page-description">
            Manage the projects displayed across the Bitreca website.
          </p>
        </div>

        <button
          type="button"
          className="admin-primary-button"
          onClick={() => {
  setEditingProject(null)

  setFormData({
    title: '',
    slug: '',
    category: '',
    description: '',
    status: 'draft',
    featured: false,
  })

  setShowCreateForm(true)
}}
        >
          + New Project
        </button>
      </div>

      {showCreateForm && (
        <div className="admin-create-project">

          <div className="admin-create-project-heading">
            <div>
              <h2>New Project</h2>
              <p>Create a new Bitreca project.</p>
            </div>

            <button
              type="button"
              className="admin-close-button"
             onClick={closeProjectForm}
            >
              ×
            </button>
          </div>

         <form
  className="admin-project-form"
  onSubmit={
    editingProject
      ? handleUpdateProject
      : handleCreateProject
  }
>

            <div className="admin-form-field">
              <label htmlFor="project-title">
                Title
              </label>

              <input
                id="project-title"
                name="title"
                type="text"
                placeholder="Example: Stockly POS"
                value={formData.title}
                onChange={handleFormChange}
              />
            </div>

            <div className="admin-form-field">
              <label htmlFor="project-slug">
                Slug
              </label>

              <input
                id="project-slug"
                name="slug"
                type="text"
                placeholder="example: stockly-pos"
                value={formData.slug}
                onChange={handleFormChange}
              />
            </div>

            <div className="admin-form-field">
              <label htmlFor="project-category">
                Category
              </label>

              <input
                id="project-category"
                name="category"
                type="text"
                placeholder="Example: Business Software"
                value={formData.category}
                onChange={handleFormChange}
              />
            </div>

            <div className="admin-form-field admin-form-field-full">
              <label htmlFor="project-description">
                Description
              </label>

              <textarea
                id="project-description"
                name="description"
                rows="5"
                placeholder="Describe the project..."
                value={formData.description}
                onChange={handleFormChange}
              />
            </div>

            <div className="admin-form-field">
              <label htmlFor="project-status">
                Status
              </label>

              <select
                id="project-status"
                name="status"
                value={formData.status}
                onChange={handleFormChange}
              >
                <option value="draft">
                  Draft
                </option>

                <option value="published">
                  Published
                </option>
              </select>
            </div>

            <div className="admin-form-checkbox">
              <input
                id="project-featured"
                name="featured"
                type="checkbox"
                checked={formData.featured}
                onChange={handleFormChange}
              />

              <label htmlFor="project-featured">
                Featured project
              </label>
            </div>

            <div className="admin-form-actions">

              <button
                type="button"
                className="admin-secondary-button"
                onClick={closeProjectForm}
              >
                Cancel
              </button>

              <button
  type="submit"
  className="admin-primary-button"
>
  {editingProject ? 'Save Changes' : 'Create Project'}
</button>

            </div>

          </form>

        </div>
      )}

      <div className="admin-projects-panel">

        <div className="admin-projects-table-header">
          <span>Project</span>
          <span>Category</span>
          <span>Status</span>
          <span>Featured</span>
          <span></span>
        </div>

        {projects.map((project) => (
          <div
            className="admin-project-row"
            key={project.id}
          >
            <div className="admin-project-name">
              <strong>{project.title}</strong>
              <span>/{project.slug}</span>
            </div>

            <div className="admin-project-category">
              {project.category}
            </div>

            <div>
              <span
                className={`admin-status admin-status-${project.status}`}
              >
                {project.status}
              </span>
            </div>

            <div className="admin-project-featured">
              {project.featured === 1 ? 'Yes' : 'No'}
            </div>

  <div className="admin-project-actions">
  <button
    type="button"
    onClick={() => handleEditProject(project)}
  >
    Edit
  </button>

  <button
    type="button"
    onClick={() => handleTogglePublish(project)}
  >
    {project.status === 'published'
      ? 'Unpublish'
      : 'Publish'}
  </button>

  <button
    type="button"
    onClick={() => handleDeleteProject(project)}
  >
    Delete
  </button>
</div>

          </div>
        ))}

      </div>

    </div>
  )
}

export default AdminProjects