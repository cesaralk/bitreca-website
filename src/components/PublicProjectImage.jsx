import { useState } from 'react'
import { safeProjectUrl } from '../utils/publicProjects'

export default function PublicProjectImage({ imageUrl, title, eager = false }) {
  const source = safeProjectUrl(imageUrl, true)
  const [failedSource, setFailedSource] = useState(null)
  return (
    <div className="public-project-image">
      {source && failedSource !== source ? (
        <img src={source} alt={`${title} project image`} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSource(source)} />
      ) : (
        <div className="public-project-image-fallback"><span aria-hidden="true">◇</span><p>{imageUrl ? 'Project image unavailable' : 'No project image provided'}</p></div>
      )}
    </div>
  )
}
