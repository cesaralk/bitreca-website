import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import usePublicStore from '../hooks/usePublicStore'
import PublicStoreImage from '../components/PublicStoreImage'
import { StoreRequestLink } from '../components/StoreRequestControls'
import { storeAvailabilityText, storePrice, validStoreSlug } from '../utils/publicStore'
import './Store.css'
import './StoreRequest.css'

export default function Store() {
  const [search, setSearch] = useSearchParams(), location = useLocation()
  const category = search.get('category'), cursor = search.get('cursor')
  const valid = [...search.keys()].every(key => ['category', 'cursor'].includes(key) && search.getAll(key).length === 1) && (category === null || validStoreSlug(category)) && (cursor === null || cursor.length <= 300 && /^[A-Za-z0-9_-]+$/.test(cursor))
  const query = new URLSearchParams()
  if (category) query.set('category', category)
  if (cursor) query.set('cursor', cursor)
  const productPath = `/api/store/products${query.size ? '?' + query : ''}`
  const products = usePublicStore(productPath, 'products', valid)
  const [categoryPage, setCategoryPage] = useState({ cursor: null, previous: [] })
  const categories = usePublicStore(`/api/store/categories${categoryPage.cursor ? '?cursor=' + categoryPage.cursor : ''}`, 'categories')
  const [history, setHistory] = useState({ category: null, previous: [] })
  const previous = history.category === category ? history.previous : []
  const heading = useRef(null), focusAfterLoad = useRef(false)
  useEffect(() => { if (products.status !== 'loading' && (focusAfterLoad.current || location.state?.focusCatalogue)) { heading.current?.focus(); focusAfterLoad.current = false } }, [products.status, productPath, location.state])
  function page(next, back = false) {
    const values = new URLSearchParams()
    if (category) values.set('category', category)
    if (next) values.set('cursor', next)
    setHistory({ category, previous: back ? previous.slice(0, -1) : [...previous, cursor] })
    focusAfterLoad.current = true; setSearch(values)
  }
  const categoryName = products.data?.category?.title
  return <main className="hardware-store-page">
    <section className="hardware-store-hero" aria-labelledby="store-title"><div className="hardware-store-container hardware-store-hero-grid"><div><p className="hardware-store-eyebrow">BITRECA / TECHNOLOGY STORE</p><h1 id="store-title">Explore the possibilities.<br /><span>Start with an enquiry.</span></h1><p className="hardware-store-lead">Browse owner-published hardware information and ask about the details that matter to your setup.</p><a className="hardware-store-button hardware-store-primary" href="#store-catalogue">Browse the catalogue <span aria-hidden="true">↓</span></a></div><aside className="hardware-store-availability" aria-labelledby="store-mode-title"><p className="hardware-store-eyebrow">ENQUIRY ONLY</p><h2 id="store-mode-title">Information first.<br />A conversation next.</h2><p>Listed prices and availability are owner-entered information. Ask Bitreca to confirm the details before making plans.</p><p className="hardware-store-status">Checkout is unavailable. We are not accepting orders through this page.</p><p className="hardware-store-small">Opening an enquiry does not reserve an item, confirm supply or promise delivery.</p></aside></div></section>
    <section id="store-catalogue" className="hardware-store-container hardware-store-section" aria-labelledby="store-catalogue-title">
      <div className="hardware-store-heading"><div><p className="hardware-store-eyebrow">THE CATALOGUE</p><h2 id="store-catalogue-title" ref={heading} tabIndex={-1}>{categoryName || 'Published products'}</h2></div><p>Only published products in published categories appear here. No published items means there is nothing available to browse yet.</p></div>
      <nav className="catalogue-categories" aria-label="Browse published categories"><Link to="/store" aria-current={!category && valid ? 'page' : undefined} onClick={() => { setHistory({ category: null, previous: [] }); focusAfterLoad.current = true }}>All products</Link>{categories.status === 'ready' && categories.data.rows.map(row => <Link key={row.slug} to={`/store?category=${row.slug}`} aria-current={category === row.slug ? 'page' : undefined} onClick={() => { setHistory({ category: row.slug, previous: [] }); focusAfterLoad.current = true }}>{row.title}</Link>)}</nav>
      <div className="catalogue-category-state">{categories.status === 'loading' && <p role="status">Loading categories…</p>}{categories.status === 'error' && <div role="alert"><p>Categories could not be loaded.</p><button type="button" onClick={categories.retry}>Retry categories</button></div>}{categories.status === 'ready' && !categories.data.rows.length && <p>No published categories yet.</p>}{categories.status === 'ready' && (categoryPage.cursor || categories.data.nextCursor) && <nav className="catalogue-pagination" aria-label="Category pages"><button type="button" disabled={!categoryPage.previous.length} onClick={() => setCategoryPage(current => ({ cursor: current.previous.at(-1), previous: current.previous.slice(0, -1) }))}>Previous categories</button><button type="button" disabled={!categories.data.nextCursor} onClick={() => setCategoryPage(current => ({ cursor: categories.data.nextCursor, previous: [...current.previous, current.cursor] }))}>Next categories</button></nav>}</div>
      <StoreRequestLink />
      <div aria-busy={products.status === 'loading'} className="catalogue-results">
        {products.status === 'loading' && <div className="catalogue-state" role="status"><h3>Loading products…</h3><p>Checking the published catalogue.</p></div>}
        {products.status === 'error' && <div className="catalogue-state" role="alert"><h3>Catalogue temporarily unavailable.</h3><p>We could not load this view. Please retry.</p><button type="button" onClick={products.retry}>Retry products</button></div>}
        {products.status === 'not-found' && <div className="catalogue-state"><h3>This catalogue view is not available.</h3><p>The category may no longer be published, or the link may be invalid.</p><Link className="hardware-store-text-link" to="/store">Browse all products →</Link></div>}
        {products.status === 'ready' && <>{!products.data.rows.length ? <div className="catalogue-state"><h3>{category ? 'No published products in this category.' : 'No published products yet.'}</h3><p>{category ? 'Choose another category or ask a general question.' : 'The catalogue currently has no items to show. You can still contact Bitreca with a general hardware question.'}</p><Link className="hardware-store-text-link" to="/contact">Ask Bitreca a question →</Link></div> : <div className="catalogue-grid">{products.data.rows.map(product => <article className="catalogue-card" key={product.slug}><PublicStoreImage product={product} /><div className="catalogue-card-content"><p className="hardware-store-eyebrow">{product.category_title}</p><h3><Link to={`/store/${product.slug}`} state={{ backTo: '/store' + location.search }}>{product.title}</Link></h3><p className="catalogue-description">{product.description}</p><p className="catalogue-price">{storePrice(product)}</p>{product.price_note && <p className="catalogue-price-note">{product.price_note}</p>}<p className="catalogue-availability">{storeAvailabilityText(product)}</p><Link className="hardware-store-text-link" to={`/store/${product.slug}`} state={{ backTo: '/store' + location.search }}>View product details <span className="hardware-store-sr-only">for {product.title}</span> <span aria-hidden="true">→</span></Link></div></article>)}</div>}{(cursor || products.data.nextCursor) && <nav className="catalogue-pagination" aria-label="Product pages"><button type="button" disabled={!previous.length} onClick={() => page(previous.at(-1), true)}>Previous products</button><Link to={category ? `/store?category=${category}` : '/store'}>First page</Link><button type="button" disabled={!products.data.nextCursor} onClick={() => page(products.data.nextCursor)}>Next products</button></nav>}</>}
      </div>
    </section>
    <section className="hardware-store-container hardware-store-contact" aria-labelledby="store-contact-title"><div><p className="hardware-store-eyebrow">GENERAL ENQUIRIES</p><h2 id="store-contact-title">Not sure where<br />to start?</h2><p>Tell us what you use and what you want to understand. An enquiry starts a conversation; it is not an order or a commitment on supply, price or delivery.</p><Link className="hardware-store-button hardware-store-primary" to="/contact">Contact Bitreca →</Link></div><aside className="hardware-store-software"><p className="hardware-store-eyebrow">LOOKING FOR SOFTWARE?</p><h3>A different kind of product.</h3><p>Stockly POS and Bitreca software products have their own page.</p><Link className="hardware-store-text-link" to="/products">Explore software products →</Link></aside></section>
  </main>
}
