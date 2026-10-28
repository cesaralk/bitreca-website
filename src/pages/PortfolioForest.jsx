import { useEffect, useRef, useState } from 'react'
import './PortfolioForest.css'

// These palettes follow the colors used by the corresponding client sites.
// Unknown clients get a stable fallback until a custom palette is supplied.
const PORTFOLIO_THEMES = [
  { matches: ['roua', 'rouaa', 'rouaa-zouheiry'], paper: '#f4f0e8', inset: '#fffdf8', ink: '#151619', accent: '#ff765f', secondary: '#a7b9a4', label: 'Editorial / Coral' },
  { matches: ['hadeel', 'hadeel-al-souki'], paper: '#f5f1e8', inset: '#ece5d9', ink: '#26251f', accent: '#8f6b4d', secondary: '#d3b28f', label: 'Interior / Earth' },
  { matches: ['taline', 'taline-said'], paper: '#101429', inset: '#1d2641', ink: '#f4fbff', accent: '#4ecdc4', secondary: '#ff6b6b', label: 'Education / Vibrant' },
  { matches: ['rahaf', 'rahaf-alsayegh'], paper: '#f8f9fa', inset: '#e8edf3', ink: '#2c3e50', accent: '#e74c3c', secondary: '#f39c12', label: 'Analytics / Bold' },
  { matches: ['rona', 'rona-alsayegh', 'portfolios'], paper: '#f9fafb', inset: '#ede9fe', ink: '#1f2937', accent: '#6366f1', secondary: '#8b5cf6', label: 'Creative / Violet' },
  { matches: ['cesar', 'ceasar', 'cesar-al-khatib'], paper: '#061019', inset: '#0d1c29', ink: '#e7f0f5', accent: '#40e0d0', secondary: '#65aef8', label: 'Developer / Neon' },
  { matches: ['forest-demo'], paper: '#0c2432', inset: '#173d4c', ink: '#f0faf9', accent: '#70c7b4', secondary: '#7f9ff6', label: 'Portfolio / Forest' },
]

const FALLBACK_THEMES = [
  { paper: '#17253a', inset: '#263f59', ink: '#f4f8ff', accent: '#90d5ff', secondary: '#a997fa', label: 'Portfolio / Azure' },
  { paper: '#f4ede5', inset: '#fff9ef', ink: '#312824', accent: '#bc7459', secondary: '#bba68c', label: 'Portfolio / Warm' },
  { paper: '#182c29', inset: '#2c5048', ink: '#f3faf5', accent: '#b5e18c', secondary: '#e9ba72', label: 'Portfolio / Botanical' },
  { paper: '#281c35', inset: '#443154', ink: '#fff6ff', accent: '#f5a1db', secondary: '#b2a1fd', label: 'Portfolio / Orchid' },
]

function portfolioTheme(slug = '') {
  const key = typeof slug === 'string' ? slug.toLowerCase() : ''
  const known = PORTFOLIO_THEMES.find(theme => theme.matches.includes(key))
  if (known) return known
  let hash = 0
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return FALLBACK_THEMES[hash % FALLBACK_THEMES.length]
}

function themedStyle(theme) {
  return {
    '--forest-paper': theme.paper,
    '--forest-inset': theme.inset,
    '--forest-ink': theme.ink,
    '--forest-accent': theme.accent,
    '--forest-secondary': theme.secondary,
  }
}

function SiteArtwork({ portfolio, theme }) {
  const name = portfolio.name?.trim() || 'New portfolio'
  return (
    <div className="forest-artwork" aria-hidden="true">
      <div className="forest-artwork-glow" />
      <div className="forest-browser">
        <div className="forest-browser-top">
          <span className="forest-browser-dots"><i /><i /><i /></span>
          <span className="forest-browser-domain">{portfolio.slug}.bitreca.com</span>
          <span className="forest-browser-menu">•••</span>
        </div>
        <div className="forest-browser-inner">
          <span className="forest-browser-kicker">PERSONAL PORTFOLIO <span>↗</span></span>
          <div className="forest-browser-headline">{name}</div>
          <div className="forest-browser-subtitle">{portfolio.profession || 'Explore the work'}</div>
          <span className="forest-browser-button">Explore <span>↗</span></span>
        </div>
        <div className="forest-browser-orb forest-browser-orb-one" />
        <div className="forest-browser-orb forest-browser-orb-two" />
      </div>
      <span className="forest-artwork-label">{theme.label}</span>
      <span className="forest-artwork-swatch"><i /><i /><i /></span>
    </div>
  )
}

function PortfolioSlide({ portfolio, index, count, placement, onSelect, suppressClick }) {
  const theme = portfolioTheme(portfolio.slug)
  const name = portfolio.name?.trim() || 'Portfolio'
  const current = placement === 'current'
  const content = (
    <>
      <SiteArtwork portfolio={portfolio} theme={theme} />
      <div className="forest-card-content">
        <div className="forest-card-meta">
          <span className="forest-card-role">{portfolio.profession || 'Professional portfolio'}</span>
          <span className="forest-card-index">{String(index + 1).padStart(2, '0')}</span>
        </div>
        <h3>{name}</h3>
        {portfolio.description && <p className="forest-card-description">{portfolio.description}</p>}
        <div className="forest-card-footer">
          <span>{portfolio.website_url ? 'Explore this portfolio' : 'Website coming soon'}</span>
          <span className="forest-card-arrow" aria-hidden="true">↗</span>
        </div>
      </div>
    </>
  )

  const onCardClick = (event) => {
    if (suppressClick.current) {
      event.preventDefault()
      return
    }
    if (!current) {
      event.preventDefault()
      onSelect(index)
    }
  }

  return (
    <article
      className="forest-slide"
      data-placement={placement}
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}: ${name}`}
      aria-hidden={!current}
      style={themedStyle(theme)}
    >
      {portfolio.website_url ? (
        <a
          className="forest-card forest-card-active"
          href={portfolio.website_url}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={current ? 0 : -1}
          onClick={onCardClick}
          aria-label={`Open ${name} portfolio in a new tab`}
        >
          {content}
        </a>
      ) : (
        <div className="forest-card forest-card-inactive" onClick={current ? undefined : onCardClick}>
          {content}
        </div>
      )}
    </article>
  )
}

function relativePlacement(index, current, count) {
  if (index === current) return 'current'
  if (count > 1 && index === (current + 1) % count) return 'next'
  if (count > 2 && index === (current - 1 + count) % count) return 'previous'
  return 'offscreen'
}

export default function PortfolioForest() {
  const [portfolios, setPortfolios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [visible, setVisible] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const stageRef = useRef(null)
  const startX = useRef(null)
  const suppressClick = useRef(false)
  const suppressTimer = useRef(null)

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

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  const count = portfolios.length
  const playing = count > 1 && !paused && !interacting && visible && !reducedMotion

  useEffect(() => {
    if (!playing) return undefined
    const timer = window.setInterval(() => {
      setActive(index => (index + 1) % count)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [playing, count, active])

  useEffect(() => () => {
    if (suppressTimer.current) window.clearTimeout(suppressTimer.current)
  }, [])

  function goTo(index) {
    if (!count) return
    setActive(((index % count) + count) % count)
  }

  function onTouchStart(event) {
    startX.current = event.touches[0]?.clientX ?? null
    setInteracting(true)
  }

  function onTouchEnd(event) {
    const endX = event.changedTouches[0]?.clientX
    if (startX.current !== null && typeof endX === 'number') {
      const distance = endX - startX.current
      if (Math.abs(distance) > 42 && count > 1) {
        suppressClick.current = true
        if (suppressTimer.current) window.clearTimeout(suppressTimer.current)
        suppressTimer.current = window.setTimeout(() => { suppressClick.current = false }, 400)
        goTo(active + (distance < 0 ? 1 : -1))
      }
    }
    startX.current = null
    setInteracting(false)
  }

  function onStageKeyDown(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(active + (event.key === 'ArrowRight' ? 1 : -1))
    }
  }

  return (
    <main className="forest-page">
      <section className="forest-gallery" aria-labelledby="forest-gallery-title">
        <div className="forest-container forest-showcase-grid">
        <div className="forest-showcase-intro">
          <p className="forest-eyebrow">BITRECA / PORTFOLIOFOREST</p>
          <h1>Distinct stories.<br /><span>One forest.</span></h1>
          <p className="forest-intro">
            Explore the people, the ambition, and the work behind every portfolio.
            Every story has its own colors.
          </p>
          <a className="forest-explore-cta" href="#portfolio-carousel">
            Explore portfolios <span aria-hidden="true">{"\u2197"}</span>
          </a>
        </div>
          <div className="forest-showcase-carousel">
          <div className="forest-gallery-heading">
            <div>
              <p className="forest-eyebrow">EXPLORE OUR COMMUNITY</p>
              <h2 id="forest-gallery-title">Featured portfolios<span className="forest-heading-period">.</span></h2>
              <p className="forest-gallery-subtitle">A spotlight for every story. Discover something new.</p>
            </div>
            <div className="forest-gallery-tools">
              {!loading && !error && <span className="forest-count">{count} published</span>}
              {!loading && !error && count > 1 && (
                <div className="forest-carousel-buttons" aria-label="Carousel controls">
                  <button className="forest-carousel-button" type="button" aria-label="Previous portfolio" onClick={() => goTo(active - 1)}>←</button>
                  <button className="forest-carousel-button" type="button" aria-label="Next portfolio" onClick={() => goTo(active + 1)}>→</button>
                  <button className="forest-carousel-button forest-play-button" type="button"
                    aria-label={paused ? "\u25B6" : "\u23F8"}
                    aria-pressed={paused}
                    onClick={() => setPaused(value => !value)}>{paused ? "\u25B6" : "\u23F8"}</button>
                </div>
              )}
            </div>
          </div>

          {loading && <p className="forest-message" role="status">Loading portfolios...</p>}
          {!loading && error && <p className="forest-message" role="alert">{error}</p>}
          {!loading && !error && count === 0 && (
            <div className="forest-empty">
              <h3>The forest is growing.</h3>
              <p>New portfolios will appear here when they are published.</p>
            </div>
          )}
          {!loading && !error && count > 0 && (
            <div
              className="forest-carousel-wrap"
              onMouseEnter={() => setInteracting(true)}
              onMouseLeave={() => setInteracting(false)}
              onFocusCapture={() => setInteracting(true)}
              onBlurCapture={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false)
              }}
            >
              <div
                className="forest-carousel-stage"
                id="portfolio-carousel"
                ref={stageRef}
                role="region"
                aria-roledescription="carousel"
                aria-label="Published client portfolios"
                aria-live="off"
                tabIndex={0}
                onKeyDown={onStageKeyDown}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                onTouchCancel={() => { startX.current = null; setInteracting(false) }}
              >
                {portfolios.map((portfolio, index) => (
                  <PortfolioSlide
                    key={portfolio.slug}
                    portfolio={portfolio}
                    index={index}
                    count={count}
                    placement={relativePlacement(index, active, count)}
                    onSelect={goTo}
                    suppressClick={suppressClick}
                  />
                ))}
              </div>
              <div className="forest-carousel-bottom">
                <span className="forest-carousel-hint">{playing ? 'AUTO-PLAYING · HOVER TO PAUSE' : 'SWIPE · USE ARROWS'}</span>
                <div className="forest-carousel-progress" role="progressbar" aria-label="Carousel position" aria-valuemin={0} aria-valuemax={count} aria-valuenow={active + 1}>
                  <span style={{ width: `${((active + 1) / count) * 100}%` }} />
                </div>
                <span className="forest-carousel-position" aria-label={`Portfolio ${active + 1} of ${count}`}>
                  {String(active + 1).padStart(2, '0')} <span>/</span> {String(count).padStart(2, '0')}
                </span>
              </div>
              {count > 1 && (
                <div className="forest-carousel-dots" aria-label="Select a portfolio">
                  {portfolios.map((portfolio, index) => (
                    <button
                      key={portfolio.slug}
                      type="button"
                      aria-label={`Show ${portfolio.name || `portfolio ${index + 1}`}`}
                      aria-current={index === active ? 'true' : undefined}
                      className={index === active ? 'forest-dot active' : 'forest-dot'}
                      onClick={() => goTo(index)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </section>

    </main>
  )
}
