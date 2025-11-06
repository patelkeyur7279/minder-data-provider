import { useCart } from '../hooks/useCart';
import { formatCurrency } from '../utils/helpers';

/**
 * ShoppingCart Component
 * 
 * Displays cart with:
 * - List of cart items
 * - Quantity controls
 * - Remove items
 * - Total price
 * - Checkout button
 * 
 * Why this design?
 * - Real-time updates with useCart hook
 * - LocalStorage persistence (cart survives refresh)
 * - Clear pricing information
 * - Simple, intuitive controls
 */

interface ShoppingCartProps {
  onCheckout: () => void;
}

export function ShoppingCart({ onCheckout }: ShoppingCartProps) {
  const {
    cart,
    itemCount,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart();

  /**
   * Empty cart state
   * Why? Clear message encourages shopping
   */
  if (cart.items.length === 0) {
    return (
      <div className="cart-empty">
        <p>🛒 Your cart is empty</p>
        <p className="hint">Add some products to get started!</p>
      </div>
    );
  }

  return (
    <div className="shopping-cart">
      {/* Cart header with item count */}
      <div className="cart-header">
        <h2>Shopping Cart</h2>
        <span className="item-count">{itemCount} items</span>
      </div>

      {/* 
        Cart items list
        Why? Shows all products with controls for each
      */}
      <div className="cart-items">
        {cart.items.map((item) => (
          <div key={item.product.id} className="cart-item">
            {/* Product image - smaller thumbnail */}
            <img 
              src={item.product.image} 
              alt={item.product.title}
              className="cart-item-image"
            />

            {/* Product info */}
            <div className="cart-item-info">
              <h4>{item.product.title}</h4>
              <p className="cart-item-price">{formatCurrency(item.product.price)}</p>
            </div>

            {/* 
              Quantity controls
              Why? Easy +/- buttons, shows current quantity
            */}
            <div className="quantity-controls">
              <button
                onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                className="quantity-btn"
                aria-label="Decrease quantity"
                disabled={item.quantity <= 1}
              >
                −
              </button>
              
              <span className="quantity">{item.quantity}</span>
              
              <button
                onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                className="quantity-btn"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            {/* Item subtotal */}
            <p className="item-total">
              {formatCurrency(item.product.price * item.quantity)}
            </p>

            {/* 
              Remove button
              Why? Allow users to remove unwanted items
            */}
            <button
              onClick={() => removeFromCart(item.product.id)}
              className="remove-btn"
              aria-label={`Remove ${item.product.title}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* 
        Cart summary
        Shows total and actions
      */}
      <div className="cart-summary">
        {/* Clear cart option */}
        <button onClick={clearCart} className="clear-cart-btn">
          Clear Cart
        </button>

        {/* Total price */}
        <div className="cart-total">
          <span>Total:</span>
          <span className="total-amount">{formatCurrency(cart.total)}</span>
        </div>

        {/* 
          Checkout button
          Why? Primary action, visually prominent
        */}
        <button onClick={onCheckout} className="checkout-btn">
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}
