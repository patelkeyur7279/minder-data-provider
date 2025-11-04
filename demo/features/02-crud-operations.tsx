import React, { useState } from "react";
import { useOneTouchCrud } from "../../src/hooks/index.js";
import { BaseModel } from "../../src/models/BaseModel.js";

// 🏢 BUSINESS LOGIC MODEL
// Encapsulates all business rules and data transformation
class ProductModel extends BaseModel {
  public name!: string;
  public price!: number;
  public category!: string;
  public inStock!: boolean;
  public tags: string[] = [];

  // 📥 Transform API response to model instance
  public fromJSON(data: any): this {
    super.fromJSON(data);
    this.name = data.name || "";
    this.price = Number(data.price) || 0;
    this.category = data.category || "";
    this.inStock = Boolean(data.inStock);
    this.tags = Array.isArray(data.tags) ? data.tags : [];
    return this;
  }

  // 📤 Transform model to API payload
  public toJSON(): any {
    return {
      ...super.toJSON(),
      price: Number(this.price),
      inStock: Boolean(this.inStock),
      tags: this.tags.filter((tag) => tag.trim()),
    };
  }

  // 🔍 Business logic validation
  public validate() {
    const errors: string[] = [];
    if (!this.name.trim()) errors.push("Product name is required");
    if (this.price <= 0) errors.push("Price must be greater than 0");
    if (!this.category.trim()) errors.push("Category is required");
    if (this.name.length > 100) errors.push("Name too long (max 100 chars)");
    return { isValid: errors.length === 0, errors };
  }

  // 💰 Business logic methods
  public getFormattedPrice(): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(this.price);
  }

  public getDiscountedPrice(discount: number): number {
    return this.price * (1 - discount / 100);
  }

  public isExpensive(): boolean {
    return this.price > 100;
  }

  public addTag(tag: string): void {
    if (tag.trim() && !this.tags.includes(tag.trim())) {
      this.tags.push(tag.trim());
    }
  }

  public removeTag(tag: string): void {
    this.tags = this.tags.filter((t) => t !== tag);
  }
}

// 🔄 COMPLETE CRUD OPERATIONS EXAMPLE
export function CrudOperationsExample() {
  // 🎣 One hook provides all CRUD operations with optimistic updates
  const {
    data: products, // Array of ProductModel instances
    loading, // Loading states for each operation
    errors, // Error states with detailed messages
    operations, // All CRUD operations
  } = useOneTouchCrud<ProductModel>("products");

  // 📝 Form state for creating/editing products
  const [formData, setFormData] = useState({
    name: "",
    price: 0,
    category: "",
    inStock: true,
    tags: "",
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  // ➕ CREATE - Add new product with validation
  const handleCreate = async () => {
    try {
      // Create model instance for validation
      const product = new ProductModel().fromJSON({
        ...formData,
        tags: formData.tags.split(",").map((t) => t.trim()),
      });

      // Validate business rules
      const validation = product.validate();
      if (!validation.isValid) {
        alert("Validation errors: " + validation.errors.join(", "));
        return;
      }

      // Create via API - optimistic update shows immediately
      const created = await operations.create(product.toJSON());
      console.log("✅ Product created:", created);

      // Reset form
      setFormData({
        name: "",
        price: 0,
        category: "",
        inStock: true,
        tags: "",
      });
    } catch (error) {
      console.error("❌ Create failed:", error);
      // UI automatically reverts optimistic update on error
    }
  };

  // ✏️ UPDATE - Edit existing product
  const handleUpdate = async (id: string) => {
    try {
      const updates = {
        ...formData,
        tags: formData.tags.split(",").map((t) => t.trim()),
      };

      // Validate before updating
      const product = new ProductModel().fromJSON(updates);
      const validation = product.validate();
      if (!validation.isValid) {
        alert("Validation errors: " + validation.errors.join(", "));
        return;
      }

      // Update via API - optimistic update shows immediately
      const updated = await operations.update(id, updates);
      console.log("✅ Product updated:", updated);

      setEditingId(null);
      setFormData({
        name: "",
        price: 0,
        category: "",
        inStock: true,
        tags: "",
      });
    } catch (error) {
      console.error("❌ Update failed:", error);
      // UI automatically reverts optimistic update on error
    }
  };

  // 🗑️ DELETE - Remove product with confirmation
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    try {
      // Delete via API - optimistic update removes immediately
      await operations.delete(id);
      console.log("✅ Product deleted:", id);
    } catch (error) {
      console.error("❌ Delete failed:", error);
      // UI automatically restores item on error
    }
  };

  // 📝 Start editing a product
  const startEdit = (product: ProductModel) => {
    setEditingId(product.id as string);
    setFormData({
      name: product.name,
      price: product.price,
      category: product.category,
      inStock: product.inStock,
      tags: product.tags.join(", "),
    });
  };

  // 🔄 Refresh data from server
  const handleRefresh = () => {
    operations.refresh();
    console.log("🔄 Refreshing products...");
  };

  // 🧹 Clear cache
  const handleClearCache = () => {
    operations.clear();
    console.log("🧹 Cache cleared");
  };

  return (
    <div className='crud-operations'>
      <h2>🔄 Complete CRUD Operations</h2>

      {/* 📊 LOADING & ERROR STATES */}
      <div className='status-panel'>
        <h3>📊 Operation Status</h3>
        <div className='status-grid'>
          <div>Fetch: {loading.fetch ? "⏳ Loading..." : "✅ Ready"}</div>
          <div>Create: {loading.create ? "⏳ Creating..." : "✅ Ready"}</div>
          <div>Update: {loading.update ? "⏳ Updating..." : "✅ Ready"}</div>
          <div>Delete: {loading.delete ? "⏳ Deleting..." : "✅ Ready"}</div>
        </div>

        {/* Error display with detailed information */}
        {errors.hasError && (
          <div className='error-panel'>
            <h4>❌ Error Details</h4>
            <p>
              <strong>Message:</strong> {errors.message}
            </p>
            <p>
              <strong>Current Error:</strong> {errors.current?.message}
            </p>
          </div>
        )}
      </div>

      {/* 📝 CREATE/EDIT FORM */}
      <div className='form-panel'>
        <h3>{editingId ? "✏️ Edit Product" : "➕ Create Product"}</h3>
        <div className='form-grid'>
          <input
            type='text'
            placeholder='Product Name'
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <input
            type='number'
            placeholder='Price'
            value={formData.price}
            onChange={(e) =>
              setFormData({ ...formData, price: Number(e.target.value) })
            }
          />
          <input
            type='text'
            placeholder='Category'
            value={formData.category}
            onChange={(e) =>
              setFormData({ ...formData, category: e.target.value })
            }
          />
          <input
            type='text'
            placeholder='Tags (comma separated)'
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
          />
          <label>
            <input
              type='checkbox'
              checked={formData.inStock}
              onChange={(e) =>
                setFormData({ ...formData, inStock: e.target.checked })
              }
            />
            In Stock
          </label>
        </div>

        <div className='form-actions'>
          {editingId ? (
            <>
              <button
                onClick={() => handleUpdate(editingId)}
                disabled={loading.update}>
                {loading.update ? "⏳ Updating..." : "💾 Save Changes"}
              </button>
              <button
                onClick={() => {
                  setEditingId(null);
                  setFormData({
                    name: "",
                    price: 0,
                    category: "",
                    inStock: true,
                    tags: "",
                  });
                }}>
                ❌ Cancel
              </button>
            </>
          ) : (
            <button onClick={handleCreate} disabled={loading.create}>
              {loading.create ? "⏳ Creating..." : "➕ Create Product"}
            </button>
          )}
        </div>
      </div>

      {/* 🎛️ CACHE OPERATIONS */}
      <div className='cache-operations'>
        <h3>🎛️ Cache Operations</h3>
        <button onClick={handleRefresh}>🔄 Refresh from Server</button>
        <button onClick={handleClearCache}>🧹 Clear Cache</button>
      </div>

      {/* 📋 PRODUCTS LIST */}
      <div className='products-list'>
        <h3>📋 Products ({products.length})</h3>

        {loading.fetch ? (
          <div className='loading'>⏳ Loading products...</div>
        ) : products.length === 0 ? (
          <div className='empty'>📭 No products found</div>
        ) : (
          <div className='products-grid'>
            {products.map((product) => (
              <div key={product.id} className='product-card'>
                <div className='product-header'>
                  <h4>{product.name}</h4>
                  <span
                    className={`stock-badge ${
                      product.inStock ? "in-stock" : "out-stock"
                    }`}>
                    {product.inStock ? "✅ In Stock" : "❌ Out of Stock"}
                  </span>
                </div>

                <div className='product-details'>
                  <p>
                    <strong>Price:</strong> {product.getFormattedPrice()}
                  </p>
                  <p>
                    <strong>Category:</strong> {product.category}
                  </p>
                  <p>
                    <strong>Expensive:</strong>{" "}
                    {product.isExpensive() ? "💰 Yes" : "💵 No"}
                  </p>

                  {product.tags.length > 0 && (
                    <div className='tags'>
                      <strong>Tags:</strong>
                      {product.tags.map((tag) => (
                        <span key={tag} className='tag'>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className='product-actions'>
                  <button
                    onClick={() => startEdit(product)}
                    disabled={loading.update}>
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() =>
                      handleDelete(product.id as string, product.name)
                    }
                    disabled={loading.delete}
                    className='delete-btn'>
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 📚 FEATURE EXPLANATION */}
      <div className='feature-explanation'>
        <h3>📚 CRUD Features Explained</h3>
        <ul>
          <li>
            <strong>🎣 useOneTouchCrud:</strong> Single hook provides all CRUD
            operations
          </li>
          <li>
            <strong>⚡ Optimistic Updates:</strong> UI updates immediately,
            rolls back on error
          </li>
          <li>
            <strong>🔄 Auto-Retry:</strong> Failed requests automatically retry
            with backoff
          </li>
          <li>
            <strong>💾 Intelligent Caching:</strong> Reduces API calls, improves
            performance
          </li>
          <li>
            <strong>🏢 Business Logic:</strong> Models encapsulate validation
            and methods
          </li>
          <li>
            <strong>📊 Loading States:</strong> Granular loading states for each
            operation
          </li>
          <li>
            <strong>🚨 Error Handling:</strong> Detailed error information with
            recovery
          </li>
          <li>
            <strong>🔄 Cache Management:</strong> Manual refresh and cache
            clearing
          </li>
        </ul>
      </div>
    </div>
  );
}
