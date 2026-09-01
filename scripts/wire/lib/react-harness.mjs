/**
 * Headless renderer for the wire suite's React-hook call patterns
 * (`useMinder().mutate()`, `operations.create/update/delete`, `refetch`).
 *
 * There is no test-runner React tooling installed in the scratch consumer
 * (adding one would violate "no new dependencies" for the shipped library),
 * so this hand-rolls the minimal subset of what
 * `@testing-library/react`'s `renderHook` does: a jsdom `window`/`document`,
 * `react-dom/client`'s `createRoot`, and a poll-based `waitFor`. Proven to
 * work end-to-end (jsdom + react-dom/client + a real `useMutation` hitting a
 * real `node:http` server) before being wired into the suite.
 *
 * CRITICAL invariant: every module loaded here (`react`, `react-dom/client`,
 * `jsdom`) MUST be loaded from the SAME scratch `node_modules/` the
 * installed `minder-data-provider` package resolves its own `react`
 * peer-import from — otherwise the app and the library end up with two
 * different React module instances ("Invalid hook call"). `requireAbs`
 * resolves by absolute path for exactly this reason; callers must pass the
 * scratch directory, never rely on this repo's own `react` devDependency.
 */
import { requireFromScratch } from './load.mjs';

/**
 * Wires up a jsdom `window`/`document` as ambient globals and returns the
 * scratch-resolved React + ReactDOM/client modules bound to it.
 */
export function setupDom(scratchDir) {
  const { JSDOM } = requireFromScratch(scratchDir, 'jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  });

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // `navigator` is a non-configurable-by-default global in modern Node —
  // must redefine it, plain assignment throws (verified empirically).
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.customElements = dom.window.customElements;
  globalThis.XMLHttpRequest = dom.window.XMLHttpRequest;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame ?? ((cb) => setTimeout(cb, 0));
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame ?? clearTimeout;

  const React = requireFromScratch(scratchDir, 'react');
  const ReactDOMClient = requireFromScratch(scratchDir, 'react-dom/client');

  return { React, ReactDOMClient, dom };
}

/** Undoes `setupDom`'s global assignments so drivers don't leak state into each other. */
export function teardownDom() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.navigator;
  delete globalThis.HTMLElement;
  delete globalThis.customElements;
  delete globalThis.XMLHttpRequest;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
}

/** Renders `element` into a detached container and returns an unmount function. */
export function renderHeadless(ReactDOMClient, document, element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  root.render(element);
  return {
    unmount: () => {
      root.unmount();
      container.remove();
    },
  };
}

/** Polls `check()` (sync, may throw while not-yet-true) until it returns truthy or times out. */
export function waitFor(check, { timeout = 5000, interval = 15 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      let value;
      try {
        value = check();
      } catch {
        value = undefined;
      }
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error(`waitFor: condition never became true within ${timeout}ms`));
        return;
      }
      setTimeout(tick, interval);
    };
    tick();
  });
}
