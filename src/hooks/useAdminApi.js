import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { adminApi } from '../utils/adminApi'

export function useAdminApi() {
  const navigate = useNavigate()

  const request = useCallback(
    async (url, options = {}) => {
      const result = await adminApi(url, options)

      if (result.unauthorized) {
        navigate('/admin/login', { replace: true })
        return null
      }

      return result
    },
    [navigate]
  )

  return request
}