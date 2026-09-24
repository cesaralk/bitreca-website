import { Link } from 'react-router-dom'

function ProductCard({ name, category, description, status }) {
  return (
    <article className="product-card">

      <div className="product-card-top">
        <span className="product-category">{category}</span>
        <span className="product-status">{status}</span>
      </div>

      <div className="product-visual">
        <span>{name}</span>
      </div>

      <div className="product-info">
        <h3>{name}</h3>

        <p>{description}</p>

        <Link to="/products" className="product-link">
  Discover Product <span>→</span>
</Link>
      </div>

    </article>
  )
}

export default ProductCard