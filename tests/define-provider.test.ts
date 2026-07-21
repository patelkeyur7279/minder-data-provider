/**
 * Task 4.0: proves the `defineProvider` custom-provider factory works using ONLY the published
 * public surface — every symbol here is imported from '../src/index' (i.e. 'minder-data-provider'),
 * with NO reach into internal modules. If this file compiles and passes, a third-party app can
 * build a working custom provider from the package alone.
 *
 * Exercises: real register -> init -> escape hatch -> cleanup; mock register (zero SDK/keys);
 * the missing-createMock guard; and the "cleanup clears the active client only if still current"
 * lifecycle correctness that the factory bakes in (the footgun every hand-rolled provider hits).
 */
import { describe, it, expect } from '@jest/globals';
import { defineProvider, getCapabilityProvider } from '../src/index';
import type { LiveContract } from '../src/index';

// A minimal fake SDK client, entirely local to this test — stands in for any uncatalogued SDK.
interface FakeClient {
  id: string;
  on(channel: string, cb: (e: unknown) => void): void;
  off(channel: string, cb: (e: unknown) => void): void;
}
const makeClient = (id: string): FakeClient => {
  const listeners = new Map<string, (e: unknown) => void>();
  return { id, on: (ch, cb) => void listeners.set(ch, cb), off: (ch) => void listeners.delete(ch) };
};

interface FakeConfig {
  clientId?: string;
  mock?: boolean;
  inject?: (id: string) => FakeClient; // DI seam so the test controls the client instance
}

function buildProvider() {
  return defineProvider<LiveContract, FakeConfig, FakeClient>({
    providerName: 'fake-live',
    capability: 'live',
    createClient(config) {
      if (!config.clientId) throw new Error('clientId is required');
      return config.inject?.(config.clientId) ?? makeClient(config.clientId);
    },
    toContract: (client) => ({
      subscribe(channel, cb) {
        client.on(channel, cb);
        return () => client.off(channel, cb);
      },
    }),
    createMock: () => ({
      subscribe(channel, cb) {
        cb({ channel, mock: true });
        return () => {};
      },
    }),
  });
}

describe('defineProvider (public surface only)', () => {
  it('real path: registers the capability, exposes the client via getClient(), and unregister() cleans up', () => {
    const provider = buildProvider();
    const client = makeClient('c1');
    const unregister = provider.register({ clientId: 'c1', inject: () => client });

    const registered = getCapabilityProvider<LiveContract>('live');
    expect(registered?.providerName).toBe('fake-live');
    expect(registered?.isMock).toBeFalsy();
    expect(provider.getClient()).toBe(client);

    // the registered contract is a real adapter over the client
    let received: unknown;
    const stop = registered!.implementation.subscribe('events', (e) => (received = e));
    stop();

    unregister();
    expect(getCapabilityProvider('live')).toBeNull();
    expect(provider.getClient()).toBeNull();
  });

  it('mock path: registers an isMock provider with zero SDK/keys and getClient() null', () => {
    const provider = buildProvider();
    const unregister = provider.register({ mock: true });

    const registered = getCapabilityProvider<LiveContract>('live');
    expect(registered?.isMock).toBe(true);
    expect(provider.getClient()).toBeNull();

    const events: unknown[] = [];
    registered!.implementation.subscribe('events', (e) => events.push(e));
    expect(events).toEqual([{ channel: 'events', mock: true }]);

    unregister();
    expect(getCapabilityProvider('live')).toBeNull();
  });

  it('createClient throwing (missing required config) propagates out of register()', () => {
    const provider = buildProvider();
    expect(() => provider.register({})).toThrow('clientId is required');
    expect(getCapabilityProvider('live')).toBeNull();
  });

  it('mock selected but no createMock() provided throws a clear error', () => {
    const noMock = defineProvider<LiveContract, { mock?: boolean }, FakeClient>({
      providerName: 'no-mock',
      capability: 'live',
      createClient: () => makeClient('x'),
      toContract: () => ({ subscribe: () => () => {} }),
      // createMock intentionally omitted
    });
    expect(() => noMock.register({ mock: true })).toThrow(/no createMock\(\) was provided/);
  });

  it('stale cleanup does not tear down a newer client (still-current-only semantics)', () => {
    const provider = buildProvider();
    const a = makeClient('a');
    const b = makeClient('b');

    const unregisterA = provider.register({ clientId: 'a', inject: () => a });
    expect(provider.getClient()).toBe(a);

    // Re-register (replaces): the factory now tracks b.
    const unregisterB = provider.register({ clientId: 'b', inject: () => b });
    expect(provider.getClient()).toBe(b);

    // A's stale cleanup must NOT null out b.
    unregisterA();
    expect(provider.getClient()).toBe(b);

    unregisterB();
    expect(provider.getClient()).toBeNull();
  });
});
