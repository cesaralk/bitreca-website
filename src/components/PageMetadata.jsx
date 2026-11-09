import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { normalizeSeoPath, pageSeo, privateSeoPath, projectPath } from '../../shared/seo'
import { applyPageSeo } from '../utils/pageSeo'

export default function PageMetadata() {
  const { pathname } = useLocation()
  useEffect(() => {
    // Detail metadata follows the existing published-project fetch, not a new one.
    if (!projectPath(pathname)) {
      const storeDetail = /^\/store\/[^/]+\/?$/.test(pathname) && !privateSeoPath(pathname)
      applyPageSeo(storeDetail ? { ...pageSeo('/store'), path: normalizeSeoPath(pathname), title: 'Store Product Information | BITRECA' } : pageSeo(pathname))
    }
  }, [pathname])
  return null
}
