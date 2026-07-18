import { useCallback, useEffect, useState } from "react";
import { registerStripeProvider } from "minder-data-provider/providers/stripe";
import { useCheckout } from "minder-data-provider/nextjs";

// Mock mode: zero keys, zero Stripe account, zero network calls. The same
// `useCheckout()` hook lights up against a real Stripe account by flipping
// `mock: false`, supplying a real `publishableKey`, and adding the server
// route the `checkoutPath` below points at (with real STRIPE_SECRET_KEY /
// STRIPE_WEBHOOK_SECRET) — see providers/stripe/README.md and
// providers/stripe/example.ts. pages/api/checkout-demo.ts in this example
// shows the guarded, keyless shape of that server route.
const STRIPE_CONFIG = {
  publishableKey: "pk_test_demo",
  checkoutPath: "/api/checkout",
  mock: true,
};

export default function StripePage() {
  const [registerError, setRegisterError] = useState<string | null>(null);
  const checkout = useCheckout();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unregister: (() => void) | undefined;

    registerStripeProvider(STRIPE_CONFIG)
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

  const handleBuy = useCallback(async () => {
    setCheckoutError(null);
    setCheckoutUrl(null);
    try {
      const { url } = await checkout.createCheckout({
        items: [{ price: "price_demo", quantity: 1 }],
        successUrl: `${location.origin}/stripe?ok=1`,
        cancelUrl: `${location.origin}/stripe`,
      });
      setCheckoutUrl(url);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : String(err));
    }
  }, [checkout]);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "1.5rem", maxWidth: 640 }}>
      <h1>Stripe provider &mdash; mock mode</h1>

      <p
        role="note"
        style={{
          background: "#fffbe6",
          border: "1px solid #f0d975",
          borderRadius: 4,
          padding: "0.75rem 1rem",
        }}
      >
        Mock mode &mdash; no Stripe account required. Flip mock:false + add server route with
        real keys to go live.
      </p>

      {registerError && (
        <p role="alert">Failed to register the Stripe provider: {registerError}</p>
      )}

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Checkout</h2>
        <button onClick={handleBuy} disabled={!checkout.ready}>
          Buy demo product ($20)
        </button>
        {checkoutUrl && (
          <p>
            Checkout session created: <code>{checkoutUrl}</code>
          </p>
        )}
        {checkoutError && <p role="alert">Checkout failed: {checkoutError}</p>}
      </section>
    </main>
  );
}
