import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

function ProtectedAdminRoute({ children }) {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch('/api/admin/session')
        const data = await response.json()

        setAuthenticated(
          response.ok && data.authenticated === true
        )
      } catch (error) {
        console.error(
          'Failed to check admin session:',
          error
        )

        setAuthenticated(false)
      } finally {
        setChecking(false)
      }
    }

    checkSession()
  }, [])

  if (checking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#070b14',
          color: '#aeb8c8',
        }}
      >
        Checking session...
      </div>
    )
  }

  if (!authenticated) {
    return (
      <Navigate
        to="/admin/login"
        replace
      />
    )
  }

  return children
}

export default ProtectedAdminRoute