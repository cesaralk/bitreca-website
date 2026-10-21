
import { useEffect, useState } from 'react'
import { useAdminApi } from '../hooks/useAdminApi'

function AdminPortfolios() {
  const [portfolios, setPortfolios] = useState([])
  const [portfolioFiles, setPortfolioFiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingPortfolioId, setEditingPortfolioId] = useState(null)

const [formData, setFormData] = useState({
  name: '',
  slug: '',
  profession: '',
  description: '',
})
  const adminRequest = useAdminApi()
  async function handleUploadFolder(portfolio, files) {
  if (!files.length) {
    alert('No website files found in this folder.')
    return
  }

  const formData = new FormData()

  files.forEach((file) => {
    const relativePath = file.webkitRelativePath
      .split('/')
      .slice(1)
      .join('/')

    formData.append('files', file)
    formData.append('paths', relativePath)
  })

  try {
    const result = await adminRequest(
      `/api/admin/portfolios/${portfolio.id}/upload-folder`,
      {
        method: 'POST',
        body: formData,
      }
    )

    if (!result?.response?.ok || !result?.data?.success) {
      throw new Error(
        result?.data?.message || 'Could not upload website folder.'
      )
    }

    setPortfolioFiles((current) => ({
      ...current,
      [portfolio.id]: true,
    }))

    alert('Website folder uploaded successfully!')
  } catch (error) {
    alert(error.message || 'Folder upload failed.')
  }
}
  async function handleUploadPortfolio(portfolio, file) {
  if (!file) return

  const formData = new FormData()
  formData.append('file', file)

  try {
    const result = await adminRequest(
      `/api/admin/portfolios/${portfolio.id}/upload`,
      {
        method: 'POST',
        body: formData,
      }
    )

    if (!result?.response?.ok || !result?.data?.success) {
      throw new Error(
        result?.data?.message || 'Could not upload portfolio file.'
      )
    }
setPortfolioFiles((current) => ({
  ...current,
  [portfolio.id]: true,
}))
    alert('Portfolio HTML uploaded successfully!')
  } catch (error) {
    alert(error.message || 'Upload failed.')
  }
}
  async function handleTogglePublish(portfolio) {
  const newStatus =
    portfolio.status === 'published' ? 'draft' : 'published'

  const action =
    newStatus === 'published' ? 'publish' : 'unpublish'

  if (!window.confirm(`Are you sure you want to ${action} ${portfolio.name}?`)) {
    return
  }

  try {
    const result = await adminRequest(
      `/api/admin/portfolios/${portfolio.id}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      }
    )

   if (!result?.response?.ok || !result?.data?.success) {
  throw new Error(
    result?.data?.message || 'Could not update portfolio status.'
  )
}

    setPortfolios((current) =>
      current.map((item) =>
        item.id === portfolio.id
          ? { ...item, status: newStatus }
          : item
      )
    )
  } catch (error) {
    alert(error.message || 'Could not update portfolio status.')
  }
}
  function startEditingPortfolio(portfolio) {
  setEditingPortfolioId(portfolio.id)

  setFormData({
    name: portfolio.name || '',
    slug: portfolio.slug || '',
    profession: portfolio.profession || '',
    description: portfolio.description || '',
  })

  setShowCreateForm(true)
}
function handleFormChange(event) {
  const { name, value } = event.target

  setFormData((current) => ({
    ...current,
    [name]: value,
  }))
}

async function handleCreatePortfolio(event) {
  event.preventDefault()

  try {
    const isEditing = editingPortfolioId !== null

const endpoint = isEditing
  ? `/api/admin/portfolios/${editingPortfolioId}`
  : '/api/admin/portfolios'

const result = await adminRequest(endpoint, {
  method: isEditing ? 'PUT' : 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(formData),
})
    if (!result) return

    const { response, data } = result

    if (!response.ok) {
      alert(data?.message || 'Could not create portfolio.')
      return
    }

   alert(
  editingPortfolioId !== null
    ? 'Portfolio updated successfully!'
    : 'Portfolio created successfully!'
)
    closeCreateForm()

    const listResult = await adminRequest(
      '/api/admin/portfolios'
    )

    if (listResult?.response.ok) {
      setPortfolios(listResult.data.portfolios || [])
    }
  } catch (error) {
    console.error('Portfolio creation failed:', error)
    alert('Could not create portfolio.')
  }
}
function closeCreateForm() {
  setShowCreateForm(false)
  setEditingPortfolioId(null)
  setFormData({
    name: '',
    slug: '',
    profession: '',
    description: '',
  })
}
  useEffect(() => {
    async function loadPortfolios() {
      try {
        const result = await adminRequest(
          '/api/admin/portfolios'
        )

        if (!result) return

        const { response, data } = result

        if (!response.ok) {
          throw new Error(
            data?.message || 'Could not load portfolios.'
          )
        }

        setPortfolios(data.portfolios || [])
        const portfolioList = data.portfolios || []

const fileResults = await Promise.all(
  portfolioList.map(async (portfolio) => {
    try {
      const result = await adminRequest(
        `/api/admin/portfolios/${portfolio.id}/file-check`
      )

      return [
        portfolio.id,
        result?.response?.ok && result?.data?.fileExists === true,
      ]
    } catch (error) {
      console.error('Could not check portfolio file:', error)
      return [portfolio.id, false]
    }
  })
)

setPortfolioFiles(Object.fromEntries(fileResults))
      } catch (err) {
        console.error(err)
        setError('Could not load portfolios.')
      } finally {
        setLoading(false)
      }
    }

    loadPortfolios()
  }, [adminRequest])

  return (
    <main style={{ padding: '40px', minHeight: '100vh' }}>
      <h1>PortfolioForest 🌲</h1>
      <p>Manage your customers' personal portfolios.</p>
      <button
  type="button"
  onClick={() => {
  setEditingPortfolioId(null)
  setFormData({
    name: '',
    slug: '',
    profession: '',
    description: '',
  })
  setShowCreateForm(true)
}}
>
  + Add Portfolio
</button>

{showCreateForm && (
  <div>
  <h2>
  {editingPortfolioId ? 'Edit Portfolio' : 'New Portfolio'}
</h2>

    <form onSubmit={handleCreatePortfolio}>
      <label htmlFor="portfolio-name">Customer Name</label>
      <input
        id="portfolio-name"
        name="name"
        value={formData.name}
        onChange={handleFormChange}
        required
      />

      <label htmlFor="portfolio-slug">Portfolio Slug</label>
      <input
        id="portfolio-slug"
        name="slug"
        value={formData.slug}
        onChange={handleFormChange}
        placeholder="e.g. hadeel"
        required
      />

      <label htmlFor="portfolio-profession">Profession</label>
      <input
        id="portfolio-profession"
        name="profession"
        value={formData.profession}
        onChange={handleFormChange}
      />

      <label htmlFor="portfolio-description">Description</label>
      <textarea
        id="portfolio-description"
        name="description"
        value={formData.description}
        onChange={handleFormChange}
      />

      <div>
<button type="submit">
  {editingPortfolioId ? 'Update Portfolio' : 'Save Portfolio'}
</button>

  <button type="button" onClick={closeCreateForm}>
    Cancel
  </button>
</div>
    </form>
  </div>
)}

      {loading && <p>Loading portfolios...</p>}
      {error && <p role="alert">{error}</p>}

      {!loading && !error && (
        <>
          <p>Total portfolios: {portfolios.length}</p>

          {portfolios.length === 0 ? (
            <p>No portfolios yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Profession</th>
                  <th>Slug</th>
                 <th>Status</th>
<th>Website File</th>
<th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {portfolios.map((portfolio) => (
                  <tr key={portfolio.id}>
                    <td>{portfolio.name}</td>
                    <td>{portfolio.profession || '—'}</td>
                    <td>{portfolio.slug}</td>
                    <td>{portfolio.status}</td>
                    <td>
  {portfolioFiles[portfolio.id] === undefined
    ? 'Checking...'
    : portfolioFiles[portfolio.id]
      ? 'Uploaded ✓'
      : 'Not uploaded'}
</td>
                   <td>
  <button
    type="button"
    onClick={() => startEditingPortfolio(portfolio)}
  >
    Edit
  </button>

   <button
    type="button"
    onClick={() => handleTogglePublish(portfolio)}
    style={{ marginLeft: '8px' }}
  >
    {portfolio.status === 'published' ? 'Unpublish' : 'Publish'}
  </button>

  <label style={{ marginLeft: '8px', cursor: 'pointer' }}>
    Upload HTML
    <input
      type="file"
      accept=".html"
      style={{ display: 'none' }}
      onChange={(event) => {
        const file = event.target.files?.[0]
        handleUploadPortfolio(portfolio, file)
        event.target.value = ''
      }}
    />
  </label>
  <label>
  Upload Folder
  <input
    type="file"
    webkitdirectory=""
    multiple
    style={{ display: 'none' }}
    onChange={(event) => {
      const files = Array.from(event.target.files || []).filter((file) => {
  const pathParts = file.webkitRelativePath.split('/')

  return (
    !pathParts.includes('.git') &&
    !pathParts.includes('node_modules') &&
    !file.name.startsWith('.') &&
    file.name.toLowerCase() !== 'readme.md'
  )
})

handleUploadFolder(portfolio, files)
      event.target.value = ''
    }}
  />
</label>
</td>           </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  )
}

export default AdminPortfolios
