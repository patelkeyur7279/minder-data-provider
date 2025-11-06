import type { Product } from '../types';
import { formatCurrency } from '../utils/helpers';

/**
 * ProductCard Component
 * 
 * Displays a single product with:
 * - Image with lazy loading
 * - Title and price
 * - Rating display
 * - Add to cart button
 * 
 * Why this design?
 * - Lazy loading images improves performance
 * - Semantic HTML for accessibility
 * - Clear call-to-action button
 */

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  isInCart: boolean;
}

export function ProductCard({ product, onAddToCart, isInCart }: ProductCardProps) {
  return (
    <div className="product-card">
      {/* 
        Image with lazy loading
        Why? Improves initial page load performance
      */}
      <img 
        src={product.image} 
        alt={product.title}
        loading="lazy"
        className="product-image"
      />
      
      <div className="product-info">
        {/* Category badge */}
        <span className="category-badge">{product.category}</span>
        
        {/* Product title - truncated for clean UI */}
        <h3 className="product-title" title={product.title}>
          {product.title}
        </h3>
        
        {/* Rating display */}
        <div className="product-rating">
          <span className="stars">{'⭐'.repeat(Math.round(product.rating.rate))}</span>
          <span className="rating-count">({product.rating.count})</span>
        </div>
        
        {/* Price */}
        <p className="product-price">{formatCurrency(product.price)}</p>
        
        {/* 
          Add to cart button
          Shows different state if already in cart
          Why? Provides clear user feedback
        */}
        <button
          onClick={() => onAddToCart(product)}
          className={`add-to-cart-btn ${isInCart ? 'in-cart' : ''}`}
          aria-label={`Add ${product.title} to cart`}
        >
          {isInCart ? '✓ In Cart' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
}
