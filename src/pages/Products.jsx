import { Link } from 'react-router-dom'
import './Products.css'

// Capability source: the existing Stockly POS description in Home.jsx.
// Add future verified products here; each receives the same detail layout.
const softwareProducts = [
  {
    id: 'stockly-pos',
    name: 'Stockly POS',
    category: 'Business software',
    audience: 'Built for retail businesses',
    introduction: 'Point of sale. Business management. One platform.',
    description: 'Stockly POS brings sales, inventory, purchases, services, reporting and daily operations together in a point-of-sale and business management system for retail businesses.',
    features: [
      { name: 'Sales', description: 'Point-of-sale functionality at the centre of the retail workflow.', mark: '01' },
      { name: 'Inventory', description: 'Inventory management alongside the sales side of your business.', mark: '02' },
      { name: 'Purchases', description: 'Purchasing as part of the same business management platform.', mark: '03' },
      { name: 'Services', description: 'Service management included within the business workflow.', mark: '04' },
      { name: 'Reporting', description: 'Reporting to support the review of business activity.', mark: '05' },
      { name: 'Daily operations', description: 'Day-to-day business management beyond the point of sale.', mark: '06' },
    ],
    benefits: [
      { title: 'A connected starting point', description: 'Consider sales and business management together, rather than looking at the checkout in isolation.' },
      { title: 'A retail focus', description: 'Explore a product designed around retail business needs and everyday operations.' },
      { title: 'A broader view of the business', description: 'Bring inventory, purchasing, services and reporting into the conversation alongside sales.' },
    ],
  },
]

function Products() {
  return (
    <main className="software-products-page">
      <header className="software-products-hero">
        <div className="software-products-container software-products-hero-grid">
          <div>
            <p className="software-products-eyebrow">BITRECA / SOFTWARE PRODUCTS</p>
            <h1>Software for the work<br /><span>behind your business.</span></h1>
            <p className="software-products-lead">Explore software built by Bitreca, starting with Stockly POS: point-of-sale and business management for retail.</p>
            <div className="software-products-actions">
              <a className="software-products-button software-products-primary" href="#stockly-pos">Explore Stockly POS <span aria-hidden="true">↓</span></a>
              <Link className="software-products-button software-products-secondary" to="/contact">Ask about our software <span aria-hidden="true">↗</span></Link>
            </div>
          </div>
          <aside className="software-products-overview" aria-labelledby="software-products-overview-title">
            <div className="software-products-overview-top"><span className="software-products-monogram" aria-hidden="true">S</span><p className="software-products-eyebrow">PRODUCT SPOTLIGHT</p></div>
            <h2 id="software-products-overview-title">Stockly POS</h2>
            <p>Point of sale + business management</p>
            <ul className="software-products-capability-map" aria-label="Stockly POS capability overview">
              {softwareProducts[0].features.map((feature) => <li key={feature.name}>{feature.name}</li>)}
            </ul>
            <p className="software-products-overview-footer">One platform. A retail focus.</p>
          </aside>
        </div>
      </header>

      <div className="software-products-container software-products-catalogue">
        {softwareProducts.map((product) => (
          <article className="software-products-detail" id={product.id} key={product.id} aria-labelledby={`${product.id}-title`}>
            <header className="software-products-detail-heading">
              <div><p className="software-products-eyebrow">{product.category}</p><h2 id={`${product.id}-title`}>{product.name}</h2><p className="software-products-audience">{product.audience}</p></div>
              <div><h3>{product.introduction}</h3><p>{product.description}</p><Link className="software-products-text-link" to="/contact">Discuss {product.name} <span aria-hidden="true">↗</span></Link></div>
            </header>

            <section className="software-products-features" aria-labelledby={`${product.id}-features-title`}>
              <div className="software-products-section-heading"><p className="software-products-eyebrow">WHAT IT BRINGS TOGETHER</p><h3 id={`${product.id}-features-title`}>The core areas of your retail business.</h3></div>
              <div className="software-products-feature-grid">
                {product.features.map((feature) => <div className="software-products-feature" key={feature.name}><span className="software-products-feature-number" aria-hidden="true">{feature.mark}</span><h4>{feature.name}</h4><p>{feature.description}</p></div>)}
              </div>
            </section>

            <section className="software-products-benefits" aria-labelledby={`${product.id}-benefits-title`}>
              <p className="software-products-eyebrow">WHY CONSIDER {product.name}?</p>
              <h3 id={`${product.id}-benefits-title`}>Look beyond the transaction.</h3>
              <div className="software-products-benefit-grid">{product.benefits.map((benefit) => <div key={benefit.title}><h4>{benefit.title}</h4><p>{benefit.description}</p></div>)}</div>
            </section>
          </article>
        ))}

        <section className="software-products-fit" aria-labelledby="software-products-fit-title">
          <div><p className="software-products-eyebrow">BEFORE YOU CHOOSE</p><h2 id="software-products-fit-title">Start with how your business works.</h2><p>Tell us about your retail workflow and what you need from your software. Ask about the product details that matter to your setup before making a decision.</p></div>
          <ul><li>Which sales and inventory tasks do you need to manage?</li><li>How do purchases and services fit into your day?</li><li>What reporting, setup and compatibility details do you need to confirm?</li></ul>
        </section>

        <section className="software-products-contact" aria-labelledby="software-products-contact-title">
          <div><p className="software-products-eyebrow">LET’S TALK SOFTWARE</p><h2 id="software-products-contact-title">Could Stockly POS fit your business?</h2><p>Contact Bitreca to discuss your requirements and ask about features, availability, pricing and next steps.</p></div>
          <Link className="software-products-button software-products-primary" to="/contact">Enquire about Stockly POS <span aria-hidden="true">↗</span></Link>
        </section>
      </div>
    </main>
  )
}

export default Products
