import { useState } from "react";
import { ProductList } from "./components/ProductList";
import { ShoppingCart } from "./components/ShoppingCart";
import { Checkout } from "./components/Checkout";
import { useCart } from "./hooks/useCart";
import "./App.css";

/**
 * Main App Component
 *
 * Simple single-page e-commerce app with:
 * - Product listing
 * - Shopping cart
 * - Checkout flow
 *
 * Why this structure?
 * - Simple state management (view state only)
 * - useMinder() handles all data fetching
 * - useCart() handles cart state with localStorage
 * - Clean component composition
 *
 * No complex routing needed for this demo
 */

type View = "products" | "cart" | "checkout";

function App() {
  const [currentView, setCurrentView] = useState<View>("products");
  const { itemCount } = useCart();

  /**
   * Render current view
   * Why? Simple view switching without router
   */
  const renderView = () => {
    switch (currentView) {
      case "products":
        return <ProductList />;
      case "cart":
        return <ShoppingCart onCheckout={() => setCurrentView("checkout")} />;
      case "checkout":
        return <Checkout />;
    }
  };

  return (
    <div className='app'>
      {/* 
        Header with navigation
        Why? Simple, always visible
      */}
      <header className='app-header'>
        <h1>🛍️ Minder Shop</h1>

        <nav className='app-nav'>
          <button
            onClick={() => setCurrentView("products")}
            className={currentView === "products" ? "active" : ""}>
            Products
          </button>

          <button
            onClick={() => setCurrentView("cart")}
            className={`cart-nav-btn ${
              currentView === "cart" ? "active" : ""
            }`}>
            🛒 Cart {itemCount > 0 && `(${itemCount})`}
          </button>
        </nav>
      </header>

      {/* 
        Main content area
        Renders current view
      */}
      <main className='app-main'>{renderView()}</main>

      {/* 
        Footer with info
      */}
      <footer className='app-footer'>
        <p>
          Powered by <strong>Minder Data Provider</strong>- Zero-config data
          fetching for React
        </p>
      </footer>
    </div>
  );
}

export default App;
