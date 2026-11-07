import { Link } from 'react-router-dom'
import './Store.css'

const categories = [
  { id: 'storage', name: 'Storage', summary: 'SSDs and HDDs for the files, applications and projects you work with.', question: 'What do you need to keep, and where will the drive fit?', details: ['Device model and supported drive connection', 'Capacity needed and the type of work you do', 'Internal upgrade or external storage'] },
  { id: 'memory', name: 'Memory', summary: 'RAM upgrades for work, multitasking and everyday computing.', question: 'Start with compatibility, then consider capacity.', details: ['Computer or motherboard model', 'Current memory type, capacity and available slots', 'Applications and tasks you want to run'] },
  { id: 'graphics', name: 'Graphics', summary: 'Graphics hardware for gaming, creative work and demanding applications.', question: 'The right questions go beyond the graphics card.', details: ['Games or applications and intended display resolution', 'Power supply, case space and system compatibility', 'Current hardware and the upgrade you have in mind'] },
  { id: 'displays', name: 'Displays', summary: 'Monitors for productivity, creative work, entertainment and gaming.', question: 'Think about what you do, and the space you use.', details: ['Screen size and available desk space', 'Resolution, refresh rate and your main use', 'Connections supported by your computer'] },
  { id: 'peripherals', name: 'Peripherals', summary: 'Keyboards, mice and accessories for your everyday setup.', question: 'Small details can shape how a setup feels.', details: ['Devices and operating systems you use', 'Wired or wireless connection preferences', 'Comfort, layout and the tasks that matter to you'] },
]

const whatsApp = (category) => `https://wa.me/96170864221?text=${encodeURIComponent(`Hello Bitreca, I have a general hardware question${category ? ` about ${category.toLowerCase()}` : ''}. I understand the Store catalogue and online ordering are not yet available.`)}`

function Store() {
  return (
    <main className="hardware-store-page">
      <section className="hardware-store-hero" aria-labelledby="hardware-store-title">
        <div className="hardware-store-container hardware-store-hero-grid">
          <div><p className="hardware-store-eyebrow">BITRECA / TECHNOLOGY STORE</p><h1 id="hardware-store-title">Think through<br /><span>your next setup.</span></h1><p className="hardware-store-lead">Explore the hardware categories behind work, gaming and everyday technology. Start with your device, your needs and the questions worth asking.</p><a className="hardware-store-button hardware-store-primary" href="#hardware-categories">Explore the categories <span aria-hidden="true">↓</span></a></div>
          <aside className="hardware-store-availability" aria-labelledby="hardware-store-availability-title"><p className="hardware-store-eyebrow">CURRENT AVAILABILITY</p><h2 id="hardware-store-availability-title">Catalogue<br />in preparation.</h2><p>This is a category guide, not a list of products for sale. Products, prices and stock are not listed here.</p><p className="hardware-store-status">Checkout is unavailable. We are not accepting orders through this page.</p><p className="hardware-store-small">You can contact Bitreca with a general hardware question. An enquiry does not reserve an item or place an order.</p></aside>
        </div>
      </section>

      <section className="hardware-store-container hardware-store-section" id="hardware-categories" aria-labelledby="hardware-store-categories-title">
        <div className="hardware-store-heading"><div><p className="hardware-store-eyebrow">FIND YOUR STARTING POINT</p><h2 id="hardware-store-categories-title">Five categories.<br />Useful questions.</h2></div><p>Choose a category to see what information can help frame your enquiry. These guides do not indicate current availability.</p></div>
        <nav className="hardware-store-directory" aria-label="Hardware category guide">
          {categories.map((category, index) => <a key={category.id} href={`#hardware-${category.id}`}><span className="hardware-store-number" aria-hidden="true">0{index + 1}</span><span>{category.name}</span><span aria-hidden="true">↘</span></a>)}
        </nav>
        <div className="hardware-store-guides">
          {categories.map((category, index) => <article className="hardware-store-guide" id={`hardware-${category.id}`} key={category.id} aria-labelledby={`hardware-${category.id}-title`}><div className="hardware-store-card-top"><p className="hardware-store-eyebrow">CATEGORY GUIDE</p><span className="hardware-store-number" aria-hidden="true">0{index + 1}</span></div><h3 id={`hardware-${category.id}-title`}>{category.name}</h3><p>{category.summary}</p><h4>{category.question}</h4><ul>{category.details.map(detail => <li key={detail}>{detail}</li>)}</ul><a className="hardware-store-text-link" href={whatsApp(category.name)} target="_blank" rel="noopener noreferrer">Ask about {category.name.toLowerCase()} in WhatsApp <span aria-hidden="true">↗</span><span className="hardware-store-sr-only"> (opens a new tab)</span></a></article>)}
        </div>
      </section>

      <section className="hardware-store-container hardware-store-contact" aria-labelledby="hardware-store-contact-title">
        <div><p className="hardware-store-eyebrow">GENERAL ENQUIRIES</p><h2 id="hardware-store-contact-title">Have a hardware<br />question in mind?</h2><p>Tell us which category you are interested in and what you already use. Contacting us starts a conversation; it does not confirm supply, pricing or delivery.</p><div className="hardware-store-actions"><Link className="hardware-store-button hardware-store-primary" to="/contact">Contact Bitreca <span aria-hidden="true">→</span></Link><a className="hardware-store-text-link" href={whatsApp()} target="_blank" rel="noopener noreferrer">Open WhatsApp <span aria-hidden="true">↗</span><span className="hardware-store-sr-only"> (opens a new tab)</span></a></div><p className="hardware-store-small">WhatsApp opens a prepared message for you to review and send. No message is sent automatically.</p></div>
        <aside className="hardware-store-software" aria-labelledby="hardware-store-software-title"><p className="hardware-store-eyebrow">LOOKING FOR SOFTWARE?</p><h3 id="hardware-store-software-title">A different kind of product.</h3><p>Explore Bitreca’s software Products page for Stockly POS, our point-of-sale and business management software.</p><Link className="hardware-store-text-link" to="/products">Explore software products <span aria-hidden="true">→</span></Link></aside>
      </section>
    </main>
  )
}

export default Store
