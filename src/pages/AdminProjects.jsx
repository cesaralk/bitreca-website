import { useEffect, useState } from 'react'

import './AdminProjects.css'
import { useAdminApi } from '../hooks/useAdminApi'


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
  image_url: '',
  status: 'draft',
  featured: false,
})
const adminRequest = useAdminApi()

useEffect(() => {
  async function loadProjects() {
    try {
      const result = await adminRequest(
        '/api/admin/projects'
      )

      if (!result) {
        return
      }

      const { response, data } = result

      if (!response.ok) {
        throw new Error(
          data?.message || 'Could not load projects.'
        )
      }

      if (data?.success) {
        setProjects(data.projects)
      }
    } catch (error) {
      console.error(
        'Failed to load admin projects:',
        error
      )
    } finally {
      setLoading(false)
    }
  }

  loadProjects()
}, [adminRequest])

  function handleFormChange(event) {
    const { name, value, type, checked } = event.target

    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  async function handleImageUpload(event) {
  const file = event.target.files?.[0]

  if (!file) {
    return
  }

  const uploadData = new FormData()
  uploadData.append('file', file)

  try {
    const result = await adminRequest(
      '/api/admin/media/upload',
      {
        method: 'POST',
        body: uploadData,
      }
    )

    if (!result) {
      return
    }

    const { response, data } = result

    if (!response.ok) {
      alert(data?.message || 'Could not upload image.')
      return
    }

    setFormData((current) => ({
  ...current,
  image_url: data.url,
}))

  } catch (error) {
    console.error('Image upload failed:', error)

    alert('Something went wrong while uploading the image.')
  }
}


function closeProjectForm() {
  setShowCreateForm(false)
  setEditingProject(null)

  setFormData({
    title: '',
    slug: '',
    category: '',
    description: '',
    image_url: '',
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
    image_url: project.image_url || '',
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
    const result = await adminRequest(
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

if (!result) {
  return
}

const { response, data } = result

    if (!response.ok) {
      alert(data?.message || 'Could not update project.')
      return
    }

    // Reload projects after updating
  const projectsResult = await adminRequest(
  '/api/admin/projects'
)

if (!projectsResult) {
  return
}

const {
  response: projectsResponse,
  data: projectsData,
} = projectsResult

    if (!projectsResponse.ok) {
      throw new Error(
        projectsData?.message || 'Could not reload projects.'
      )
    }

    if (projectsData?.success) {
      setProjects(projectsData.projects)
    }

    setEditingProject(null)

    setFormData({
  title: '',
  slug: '',
  category: '',
  description: '',
  image_url: '',
  status: 'draft',
  featured: false,
})

    setShowCreateForm(false)

    alert('Project updated successfully.')
  } catch (error) {
    console.error('Failed to update project:', error)

    alert(
      'Something went wrong while updating the project.'
    )
  }
}

async function handleTogglePublish(project) {
  const newStatus =
    project.status === 'published'
      ? 'draft'
      : 'published'

  try {
   const result = await adminRequest(
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

if (!result) {
  return
}

const { response, data } = result

    if (!response.ok) {
      alert(
        data?.message || 'Could not update project status.'
      )
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
  const result = await adminRequest(
  `/api/admin/projects/${project.id}`,
  {
    method: 'DELETE',
  }
)

if (!result) {
  return
}

const { response, data } = result

    if (!response.ok) {
      alert(data?.message || 'Could not delete project.')
      return
    }

    setProjects((currentProjects) =>
      currentProjects.filter(
        (currentProject) =>
          currentProject.id !== project.id
      )
    )

    alert('Project deleted successfully.')
  } catch (error) {
    console.error(
      'Failed to delete project:',
      error
    )

    alert(
      'Something went wrong while deleting the project.'
    )
  }
}

async function handleCreateProject(event) {
  event.preventDefault()

  try {
   const result = await adminRequest(
  '/api/admin/projects',
  {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
    },

    body: JSON.stringify({
      ...formData,
      featured: formData.featured ? 1 : 0,
    }),
  }
)

if (!result) {
  return
}

const { response, data } = result

    if (!response.ok) {
      alert(data?.message || 'Could not create project.')
      return
    }

    // Reload projects after creating
    const projectsResult = await adminRequest(
  '/api/admin/projects'
)

if (!projectsResult) {
  return
}

const {
  response: projectsResponse,
  data: projectsData,
} = projectsResult

    if (!projectsResponse.ok) {
      throw new Error(
        projectsData?.message || 'Could not reload projects.'
      )
    }

    if (projectsData?.success) {
      setProjects(projectsData.projects)
    }

    setFormData({
  title: '',
  slug: '',
  category: '',
  description: '',
  image_url: '',
  status: 'draft',
  featured: false,
})

    setShowCreateForm(false)

    alert('Project created successfully.')
  } catch (error) {
    console.error('Failed to create project:', error)

    alert(
      'Something went wrong while creating the project.'
    )
  }
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
    image_url: '',
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
<div className="admin-form-field admin-form-field-full">
  <label htmlFor="project-image-url">
    Project Image URL
  </label>

<input
  id="project-image-file"
  type="file"
  accept="image/jpeg,image/png,image/webp"
  onChange={handleImageUpload}
/>

  <input
    id="project-image-url"
    name="image_url"
    type="text"
    placeholder="https://example.com/project-image.jpg"
    value={formData.image_url}
    onChange={handleFormChange}
  />
  {formData.image_url && (
  <div className="admin-project-image-preview">
    <img
      src={formData.image_url}
      alt="Project preview"
    />
  </div>
)}
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

   {loading ? (
  <div className="admin-projects-loading">
    Loading projects...
  </div>
) : (
  projects.map((project) => (
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
  ))
)}

      </div>

    </div>
  )
}

export default AdminProjects