import { useCallback, useEffect, useState } from "react";
import { registerRazorpayProvider } from "minder-data-provider/providers/razorpay";
import { useCheckout } from "minder-data-provider/nextjs";

// Mock mode: zero keys, zero Razorpay account, zero network calls. The same
// `useCheckout()` hook lights up against a real Razorpay account by flipping
// `mock: false`, supplying a real `keyId`, and adding the server order route
// (with real RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET) — see
// providers/razorpay/README.md and providers/razorpay/example.ts.
const RAZORPAY_CONFIG = {
  keyId: "rzp_test_demo",
  mock: true,
};

export default function RazorpayPage() {
  const [registerError, setRegisterError] = useState<string | null>(null);
  const checkout = useCheckout();
  const [orderUrl, setOrderUrl] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unregister: (() => void) | undefined;

    registerRazorpayProvider(RAZORPAY_CONFIG)
      .then((unregisterFn) => {
        if (cancelled) {
          // Effect cleanup already ran before registration resolved — tear
          // down immediately instead of leaking the mock provider.
          unregisterFn();
          return;
        }
        unregister = unregisterFn;
      })
      .catch((err) => {
        if (!cancelled) {
          setRegisterError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
      unregister?.();
    };
  }, []);

  const handlePay = useCallback(async () => {
    setOrderError(null);
    setOrderUrl(null);
    try {
      const { url } = await checkout.createCheckout({
        items: [{ name: "Demo", amountCents: 50000, currency: "INR", quantity: 1 }],
        successUrl: `${location.origin}/razorpay?ok=1`,
        cancelUrl: `${location.origin}/razorpay`,
      });
      setOrderUrl(url);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : String(err));
    }
  }, [checkout]);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "1.5rem", maxWidth: 640 }}>
      <h1>Razorpay provider &mdash; mock mode</h1>

      <p
        role="note"
        style={{
          background: "#fffbe6",
          border: "1px solid #f0d975",
          borderRadius: 4,
          padding: "0.75rem 1rem",
        }}
      >
        Mock mode &mdash; no Razorpay account required. Flip mock:false + add server route with
        real keys to go live.
      </p>

      {registerError && (
        <p role="alert">Failed to register the Razorpay provider: {registerError}</p>
      )}

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Checkout</h2>
        <button onClick={handlePay} disabled={!checkout.ready}>
          Pay &#8377;500
        </button>
        {orderUrl && (
          <p>
            Order created: <code>{orderUrl}</code>
          </p>
        )}
        {orderError && <p role="alert">Order failed: {orderError}</p>}
      </section>
    </main>
  );
}
