import { Link } from 'react-router-dom'

function StoreCategory({ icon, title, description }) {
  return (
    <Link to="/store" className="store-category">

      <div className="store-category-icon">
        {icon}
      </div>

      <div className="store-category-content">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <span className="store-category-arrow">
        →
      </span>

    </Link>
  )
}

export default StoreCategory