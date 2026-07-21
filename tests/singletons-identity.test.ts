/**
 * Spec 1.3c §5 — cross-entry singleton identity (C-class guard).
 *
 * The `sideEffects`/splitting hazard is not only that a shared chunk's init gets
 * DROPPED (MDPD-17) but that a chunk gets DUPLICATED — forking a "singleton" into
 * two (two contexts, two registries, two config bags). The fix pins every
 * cross-entry singleton to a `globalThis` slot keyed by `Symbol.for(...)`, so
 * identity is independent of how a bundler splits or duplicates the module.
 *
 * These tests prove that at runtime: the context is memoised, lives on the
 * process-wide slot, and — crucially — a SECOND, freshly-required copy of the
 * owning module (simulating a duplicated chunk in a consumer bundle, e.g. the
 * main entry + the /hook entry each carrying their own copy) resolves to the
 * SAME instance rather than a fork.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { getMinderContext } from '../src/core/MinderContext';
import { minderStore } from '../src/core/singletons';

const STORE_KEY = Symbol.for('minder-data-provider.singletons');

describe('Spec 1.3c — cross-entry singleton identity', () => {
  it('getMinderContext() is memoised and stored on the globalThis Symbol.for slot', () => {
    const a = getMinderContext();
    const b = getMinderContext();
    expect(a).toBe(b);

    const store = (globalThis as Record<symbol, { context?: unknown }>)[STORE_KEY];
    expect(store).toBeDefined();
    expect(store.context).toBe(a);
    expect(minderStore().context).toBe(a);
  });

  it('a duplicated copy of the owning module resolves the SAME context (no fork)', () => {
    const first = getMinderContext();

    // Drop the module registry and re-require MinderContext — a fresh module
    // instance, exactly what a duplicated chunk would be. Its `createContext`
    // must NOT run again: the globalThis store already holds the one context.
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dup = require('../src/core/MinderContext') as typeof import('../src/core/MinderContext');
    expect(dup.getMinderContext()).toBe(first);
  });

  it('the capability registry and config bags are single, globalThis-backed instances', () => {
    // A second require of the owning modules must share the same registry Map /
    // config store, not fork them (same mechanism as the context above).
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reg1 = require('../src/contracts/registry') as typeof import('../src/contracts/registry');
    reg1.registerCapabilityProvider({
      providerName: 'test-auth',
      capability: 'auth',
      implementation: {},
      getProviderClient: () => ({}),
    });
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reg2 = require('../src/contracts/registry') as typeof import('../src/contracts/registry');
    // The freshly-required copy sees the provider the first copy registered —
    // proof they share ONE registry Map via the globalThis store.
    expect(reg2.getCapabilityProvider('auth')?.providerName).toBe('test-auth');
  });
});
