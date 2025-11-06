import React, { useState } from "react";
import { useMinder } from "minder-data-provider";
import { useCart } from "../hooks/useCart";
import { formatCurrency, isValidEmail } from "../utils/helpers";
import type { ShippingAddress, Order } from "../types";
import { API_ENDPOINTS } from "../utils/api";

/**
 * Checkout Component
 *
 * Handles order placement with:
 * - Form validation
 * - useMinder() for order submission
 * - Loading states during submission
 * - Error handling with recovery
 * - Success confirmation
 *
 * Why this design?
 * - useMinder() handles API call, loading, error states
 * - Client-side validation prevents bad requests
 * - Clear error messages help users fix issues
 * - Success state confirms order placement
 */

export function Checkout() {
  const { cart, clearCart } = useCart();
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState<string>("");

  // Form state
  const [formData, setFormData] = useState<ShippingAddress>({
    name: "",
    email: "",
    address: "",
    city: "",
    postalCode: "",
    country: "",
  });

  // Validation errors
  const [errors, setErrors] = useState<Partial<ShippingAddress>>({});

  /**
   * useMinder for order submission
   * Why? Handles loading state, error handling automatically
   * No need to manually manage these states
   */
  const { mutate, loading, error } = useMinder<Order>(API_ENDPOINTS.ORDERS);

  /**
   * Validate form
   * Why? Prevent invalid data from being sent to API
   * Better UX with immediate feedback
   */
  const validateForm = (): boolean => {
    const newErrors: Partial<ShippingAddress> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = "Invalid email format";
    }

    if (!formData.address.trim()) {
      newErrors.address = "Address is required";
    }

    if (!formData.city.trim()) {
      newErrors.city = "City is required";
    }

    if (!formData.postalCode.trim()) {
      newErrors.postalCode = "Postal code is required";
    }

    if (!formData.country.trim()) {
      newErrors.country = "Country is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle form submission
   * Why? Uses useMinder() to submit order
   * Automatic error handling, no try-catch needed
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate before submitting
    if (!validateForm()) {
      return;
    }

    // Create order data
    const orderData = {
      items: cart.items,
      total: cart.total,
      shippingAddress: formData,
      paymentMethod: "card",
      status: "pending" as const,
    };

    /**
     * Submit order using useMinder()
     * Why mutate()? Returns MinderResult with success/error
     * No exceptions thrown, always returns structured data
     */
    const result = await mutate(orderData);

    if (result.success) {
      // Order placed successfully
      setOrderId(result.data?.id || "ORDER-" + Date.now());
      setOrderPlaced(true);
      clearCart(); // Clear cart after successful order
    }
    // Error handling is automatic via useMinder's error state
  };

  /**
   * Update form field
   */
  const updateField = (field: keyof ShippingAddress, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  /**
   * Success state
   * Why? Confirm order placement, provide order ID
   */
  if (orderPlaced) {
    return (
      <div className='checkout-success'>
        <div className='success-icon'>✓</div>
        <h2>Order Placed Successfully!</h2>
        <p>
          Order ID: <strong>{orderId}</strong>
        </p>
        <p>
          Total: <strong>{formatCurrency(cart.total)}</strong>
        </p>
        <p className='success-message'>
          Thank you for your order. We've sent a confirmation email to{" "}
          {formData.email}
        </p>
        <button
          onClick={() => window.location.reload()}
          className='continue-btn'>
          Continue Shopping
        </button>
      </div>
    );
  }

  return (
    <div className='checkout-container'>
      <h2>Checkout</h2>

      {/* Order summary */}
      <div className='order-summary'>
        <h3>Order Summary</h3>
        <p>{cart.items.length} items</p>
        <p className='summary-total'>Total: {formatCurrency(cart.total)}</p>
      </div>

      {/* 
        Checkout form
        Why? Collect shipping information
      */}
      <form onSubmit={handleSubmit} className='checkout-form'>
        {/* Name field */}
        <div className='form-group'>
          <label htmlFor='name'>Full Name *</label>
          <input
            id='name'
            type='text'
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            className={errors.name ? "error" : ""}
            disabled={loading}
          />
          {errors.name && <span className='error-message'>{errors.name}</span>}
        </div>

        {/* Email field */}
        <div className='form-group'>
          <label htmlFor='email'>Email *</label>
          <input
            id='email'
            type='email'
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
            className={errors.email ? "error" : ""}
            disabled={loading}
          />
          {errors.email && (
            <span className='error-message'>{errors.email}</span>
          )}
        </div>

        {/* Address field */}
        <div className='form-group'>
          <label htmlFor='address'>Address *</label>
          <input
            id='address'
            type='text'
            value={formData.address}
            onChange={(e) => updateField("address", e.target.value)}
            className={errors.address ? "error" : ""}
            disabled={loading}
          />
          {errors.address && (
            <span className='error-message'>{errors.address}</span>
          )}
        </div>

        {/* City and Postal Code - side by side */}
        <div className='form-row'>
          <div className='form-group'>
            <label htmlFor='city'>City *</label>
            <input
              id='city'
              type='text'
              value={formData.city}
              onChange={(e) => updateField("city", e.target.value)}
              className={errors.city ? "error" : ""}
              disabled={loading}
            />
            {errors.city && (
              <span className='error-message'>{errors.city}</span>
            )}
          </div>

          <div className='form-group'>
            <label htmlFor='postalCode'>Postal Code *</label>
            <input
              id='postalCode'
              type='text'
              value={formData.postalCode}
              onChange={(e) => updateField("postalCode", e.target.value)}
              className={errors.postalCode ? "error" : ""}
              disabled={loading}
            />
            {errors.postalCode && (
              <span className='error-message'>{errors.postalCode}</span>
            )}
          </div>
        </div>

        {/* Country field */}
        <div className='form-group'>
          <label htmlFor='country'>Country *</label>
          <input
            id='country'
            type='text'
            value={formData.country}
            onChange={(e) => updateField("country", e.target.value)}
            className={errors.country ? "error" : ""}
            disabled={loading}
          />
          {errors.country && (
            <span className='error-message'>{errors.country}</span>
          )}
        </div>

        {/* 
          Error message from API
          Why? useMinder provides error state automatically
        */}
        {error && (
          <div className='api-error'>
            <p>⚠️ {error.message}</p>
            <p className='error-hint'>Please try again or contact support</p>
          </div>
        )}

        {/* 
          Submit button
          Why? Shows loading state during submission
          useMinder's loading state makes this easy
        */}
        <button
          type='submit'
          className='submit-btn'
          disabled={loading || cart.items.length === 0}>
          {loading
            ? "Processing..."
            : `Place Order - ${formatCurrency(cart.total)}`}
        </button>
      </form>
    </div>
  );
}
