/**
 * B3 + H5 — the two auth hooks reachable with NO `MinderDataProvider`
 * mounted.
 *
 *   B3: `useAuthToken()` (the client-side token-store hook,
 *       `minder-data-provider/web`) must not throw when rendered with no
 *       provider ancestor — the docs (`llms.txt:224`, `docs/USAGE_GUIDE.md`)
 *       promise exactly that.
 *   H5: the root capability-contract `useAuth()` (a DIFFERENT hook — session
 *       backed by a registered provider, `{ ready, error, session, signOut,
 *       getProviderClient }`) must attach deprecated `setToken`/`getToken`/
 *       `clearAuth`/`isLoggedIn` keys that THROW a directed error naming
 *       `useAuthToken`, converting the v2.1.4→2.2.0 silent breakage
 *       (undefined -> TypeError at first real call) into an actionable
 *       message at the same call site.
 *
 * Rendered headlessly via jsdom + react-dom/client (scripts/wire/lib/react-harness.mjs).
 */
export async function run(ctx) {
  const { scratchDir } = ctx;
  const { requireFromScratch } = ctx.load;
  const { setupDom, renderHeadless, waitFor } = ctx.react;
  const results = [];

  const { React, ReactDOMClient, dom } = setupDom(scratchDir);
  try {
    const mdp = requireFromScratch(scratchDir, 'minder-data-provider/web');

    // --- B3: useAuthToken() with no provider must not throw ---
    {
      const box = { renderError: undefined, hookResult: undefined, mounted: false };

      class Boundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { error: undefined };
        }
        static getDerivedStateFromError(error) {
          return { error };
        }
        render() {
          if (this.state.error) {
            box.renderError = this.state.error;
            return null;
          }
          return this.props.children;
        }
      }

      function Probe() {
        const result = mdp.useAuthToken();
        box.hookResult = result;
        box.mounted = true;
        return null;
      }

      const { unmount } = renderHeadless(
        ReactDOMClient,
        dom.window.document,
        React.createElement(Boundary, null, React.createElement(Probe)),
      );

      try {
        await waitFor(() => box.mounted || box.renderError, { timeout: 2000 });
      } catch {
        // fall through — evaluated below from box state either way
      }
      unmount();

      const pass = box.mounted === true && box.renderError === undefined;
      results.push({
        id: 'b3-useauthtoken-no-provider-does-not-throw',
        pass,
        message: pass
          ? `useAuthToken() mounted with no MinderDataProvider ancestor; isLoggedIn=${box.hookResult?.isLoggedIn}`
          : `useAuthToken() threw with no provider: ${box.renderError ? (box.renderError.message ?? String(box.renderError)) : 'did not mount within timeout'}`,
      });
    }

    // --- H5: useAuth().setToken(...) must throw a directed error naming useAuthToken ---
    {
      const box = { hookResult: undefined, mounted: false };

      function Probe() {
        const result = mdp.useAuth();
        box.hookResult = result;
        box.mounted = true;
        return null;
      }

      const { unmount } = renderHeadless(ReactDOMClient, dom.window.document, React.createElement(Probe));
      await waitFor(() => box.mounted, { timeout: 2000 }).catch(() => {});

      // The shim may throw either at PROPERTY ACCESS (a getter) or only once
      // CALLED (a function) — both convert the silent v2.1.4->2.2.0 break
      // into an actionable message at the call site, which is H5's actual
      // intent, so a single try/catch spans both steps rather than probing
      // `typeof x.setToken` first (which itself throws for a getter-based
      // shim, observed empirically).
      let threw = false;
      let message = '';
      let hadKeyAtAll = false;
      try {
        const legacy = box.hookResult?.setToken;
        hadKeyAtAll = legacy !== undefined;
        if (typeof legacy === 'function') {
          legacy.call(box.hookResult, 'x');
        }
      } catch (e) {
        threw = true;
        message = String(e?.message ?? e);
      }
      unmount();

      const pass = threw && /useAuthToken/.test(message);
      results.push({
        id: 'h5-useauth-legacy-setToken-throws-directed-error',
        pass,
        message: pass
          ? `useAuth().setToken threw a directed error naming useAuthToken: ${message.slice(0, 140)}`
          : threw
            ? `useAuth().setToken threw but did not mention "useAuthToken": ${JSON.stringify(message)}`
            : `useAuth().setToken did not throw (hadKeyAtAll=${hadKeyAtAll}, result keys: ${box.hookResult ? Object.keys(box.hookResult).join(', ') : 'hook did not mount'}) — expected a deprecated shim naming useAuthToken`,
      });
    }
  } catch (err) {
    for (const id of ['b3-useauthtoken-no-provider-does-not-throw', 'h5-useauth-legacy-setToken-throws-directed-error']) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  }
  // NOTE: deliberately never torn down here either — see method-contract.mjs's
  // header comment for why (react-dom scheduler race with deleting `window`).

  return results;
}
