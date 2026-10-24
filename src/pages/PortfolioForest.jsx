import { useEffect, useState } from 'react'
import './PortfolioForest.css'

export default function PortfolioForest() {
  const [portfolios, setPortfolios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('/api/portfolios', { signal: controller.signal, cache: 'no-store' })
        const data = await response.json()
        if (!response.ok || !data.success || !Array.isArray(data.portfolios)) {
          throw new Error('Could not load the portfolio directory.')
        }
        setPortfolios(data.portfolios)
      } catch (err) {
        if (err.name !== 'AbortError') setError('Portfolios are temporarily unavailable. Please try again.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [])

  return (
    <main className="forest-page">
      <section className="forest-hero">
        <div className="forest-container">
          <p className="forest-eyebrow">BITRECA / PORTFOLIOFOREST</p>
          <h1>Good work deserves <span>to be seen.</span></h1>
          <p className="forest-intro">
            Explore the people and portfolios brought online with Bitreca.
            Every portfolio tells a different story.
          </p>
        </div>
      </section>

      <section className="forest-gallery">
        <div className="forest-container">
          <div className="forest-gallery-heading">
            <div>
              <p className="forest-eyebrow">DISCOVER</p>
              <h2>Featured portfolios</h2>
            </div>
            {!loading && !error && <p className="forest-count">{portfolios.length} published</p>}
          </div>

          {loading && <p className="forest-message" role="status">Loading portfolios...</p>}
          {!loading && error && <p className="forest-message" role="alert">{error}</p>}
          {!loading && !error && portfolios.length === 0 && (
            <div className="forest-empty">
              <h3>The forest is growing.</h3>
              <p>New portfolios will appear here when they are published.</p>
            </div>
          )}
          {!loading && !error && portfolios.length > 0 && (
            <div className="forest-grid">
              {portfolios.map(portfolio => (
                <article className="forest-card" key={portfolio.slug}>
                  <div className="forest-card-banner" aria-hidden="true">
                    <span className="forest-card-monogram">{portfolio.name?.trim()?.slice(0, 1)?.toUpperCase() || 'B'}</span>
                    <span className="forest-card-type">PORTFOLIO</span>
                  </div>
                  <div className="forest-card-content">
                    <p className="forest-card-role">{portfolio.profession || 'Professional Portfolio'}</p>
                    <h3>{portfolio.name}</h3>
                    {portfolio.description && <p className="forest-card-description">{portfolio.description}</p>}
                    {portfolio.website_url ? (
                      <a href={portfolio.website_url} target="_blank" rel="noopener noreferrer" className="forest-card-link">
                        View portfolio <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span className="forest-card-unavailable">Portfolio link coming soon</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
