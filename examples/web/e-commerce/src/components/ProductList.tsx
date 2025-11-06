import { useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useCart } from '../hooks/useCart';
import { ProductCard } from './ProductCard';
import { FilterOptions } from '../types';
import { filterProducts } from '../utils/helpers';
import { useDebounce } from '../hooks/useDebounce';

/**
 * ProductList Component
 * 
 * Main product listing with:
 * - Auto-fetch products using useMinder()
 * - Search with debouncing (reduces API calls)
 * - Category filtering
 * - Price range filtering
 * - Sort options
 * - Loading and error states
 * 
 * Why this design?
 * - useMinder() handles caching, loading states automatically
 * - Debounced search prevents excessive API calls
 * - Client-side filtering for instant response
 * - Clear separation of concerns
 */

export function ProductList() {
  // State for filters
  const [filters, setFilters] = useState<FilterOptions>({
    category: 'all',
    search: '',
    sortBy: 'name',
  });

  // Debounce search input to reduce API calls
  // Why? Waits for user to stop typing before searching
  const debouncedSearch = useDebounce(filters.search, 500);

  // Fetch products using useMinder()
  // Why? Auto-caches, handles loading/error states, refetches on focus
  const { products, loading, error } = useProducts();

  // Shopping cart hook
  const { addToCart, isInCart } = useCart();

  // Apply filters to products
  // Why? Client-side filtering is instant, no API calls needed
  const filteredProducts = filterProducts(products, {
    ...filters,
    search: debouncedSearch, // Use debounced value
  });

  /**
   * Handle search input
   * Updates filter state, debounce hook delays the actual search
   */
  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }));
  };

  /**
   * Handle category change
   */
  const handleCategoryChange = (category: string) => {
    setFilters(prev => ({ ...prev, category }));
  };

  /**
   * Handle sort change
   */
  const handleSortChange = (sortBy: FilterOptions['sortBy']) => {
    setFilters(prev => ({ ...prev, sortBy }));
  };

  /**
   * Loading state
   * Why? Shows skeleton/spinner while fetching
   */
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Loading amazing products...</p>
      </div>
    );
  }

  /**
   * Error state
   * Why? Graceful error handling with retry option
   */
  if (error) {
    return (
      <div className="error-container">
        <p className="error-message">😕 {error.message}</p>
        <button onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="product-list-container">
      {/* 
        Filters Section 
        Clean, simple controls for better UX
      */}
      <div className="filters">
        {/* Search input */}
        <input
          type="text"
          placeholder="Search products..."
          value={filters.search}
          onChange={(e) => handleSearch(e.target.value)}
          className="search-input"
          aria-label="Search products"
        />

        {/* Category filter */}
        <select
          value={filters.category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="filter-select"
          aria-label="Filter by category"
        >
          <option value="all">All Categories</option>
          <option value="electronics">Electronics</option>
          <option value="jewelery">Jewelery</option>
          <option value="men's clothing">Men's Clothing</option>
          <option value="women's clothing">Women's Clothing</option>
        </select>

        {/* Sort options */}
        <select
          value={filters.sortBy}
          onChange={(e) => handleSortChange(e.target.value as FilterOptions['sortBy'])}
          className="filter-select"
          aria-label="Sort by"
        >
          <option value="name">Name</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="rating">Rating</option>
        </select>
      </div>

      {/* Results count */}
      <p className="results-count">
        {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'} found
      </p>

      {/* 
        Product Grid 
        Why grid? Responsive layout, good for product display
      */}
      <div className="product-grid">
        {filteredProducts.length === 0 ? (
          <div className="no-results">
            <p>No products match your filters</p>
            <button onClick={() => setFilters({ category: 'all', search: '', sortBy: 'name' })}>
              Clear Filters
            </button>
          </div>
        ) : (
          filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={addToCart}
              isInCart={isInCart(product.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
