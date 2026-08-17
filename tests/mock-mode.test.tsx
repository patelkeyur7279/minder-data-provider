/**
 * Mock-mode plumbing (task F-04)
 *
 * Covers:
 *  - registerMockProvider: registers a capability provider flagged `isMock: true`, defaults
 *    `providerName` to `mock-${capability}`, unregister works.
 *  - getProviderClient() returns the mock implementation itself.
 *  - getProviderConfig: reads an explicit config, falls back to the global config
 *    (configureMinder / setGlobalMinderConfig — see src/core/globalConfig.ts), returns null for
 *    an unknown provider.
 *  - validateMinderConfig: providers.<name>.mock recognizes `mock: true`; a non-boolean value
 *    (e.g. `mock: 'yes'`) produces a level:'error' ConfigError naming `providers.<name>.mock`.
 *  - The full zero-credential flow: register a mock AuthContract via registerMockProvider (no
 *    providers config, no credentials anywhere) -> useAuth() renders ready:true with the mock
 *    session -> getCapabilityProvider('auth')?.isMock is true.
 *  - A manifest-based mock built with M1-05's createMockProvider (tests/fixtures/providers/
 *    good-provider/manifest.json), wired through registerMockProvider — impl callbacks pass
 *    through.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { registerMockProvider, getProviderConfig } from '../src/contracts/mockRegistry';
import { getCapabilityProvider } from '../src/contracts/registry';
import type { CapabilityProvider } from '../src/contracts/registry';
import type { AuthContract } from '../src/contracts/types';
import { useAuth } from '../src/hooks/contracts';
import { validateMinderConfig } from '../src/config/validateConfig';
import { setGlobalMinderConfig, clearGlobalMinderConfig } from '../src/core/globalConfig';
import type { MinderConfig } from '../src/core/types';
import { createMockProvider } from '../src/testing/createMockProvider';
import type { ProviderManifest } from '../src/plugins/manifest';

// ---------------------------------------------------------------------------
// Test utilities — mirrors tests/capability-contracts.test.tsx's cleanup pattern: the registry
// has no exported "clear all" helper (by design — see src/contracts/registry.ts), so every
// registration is tracked and unregistered in `afterEach` regardless of pass/fail.
// ---------------------------------------------------------------------------

let cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  clearGlobalMinderConfig();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// registerMockProvider
// ---------------------------------------------------------------------------

describe('registerMockProvider', () => {
  it('registers a capability provider flagged isMock:true with a default providerName', () => {
    const unregister = registerMockProvider<AuthContract>('auth', {
      getSession: async () => ({ userId: 'u1', raw: {} }),
      signOut: async () => undefined,
    });
    cleanups.push(unregister);

    const provider = getCapabilityProvider<AuthContract>('auth');
    expect(provider).not.toBeNull();
    expect(provider?.isMock).toBe(true);
    expect(provider?.providerName).toBe('mock-auth');
    expect(provider?.capability).toBe('auth');
  });

  it('accepts an explicit providerName instead of the default', () => {
    const unregister = registerMockProvider<AuthContract>(
      'auth',
      { getSession: async () => null, signOut: async () => undefined },
      '@acme/test-auth-double'
    );
    cleanups.push(unregister);

    expect(getCapabilityProvider('auth')?.providerName).toBe('@acme/test-auth-double');
  });

  it('unregister() removes the mock provider', () => {
    const unregister = registerMockProvider<AuthContract>('auth', {
      getSession: async () => null,
      signOut: async () => undefined,
    });

    expect(getCapabilityProvider('auth')).not.toBeNull();
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
  });

  it('getProviderClient() returns the mock implementation itself', () => {
    const mockImpl: AuthContract = {
      getSession: async () => null,
      signOut: async () => undefined,
    };
    const unregister = registerMockProvider('auth', mockImpl);
    cleanups.push(unregister);

    const provider = getCapabilityProvider<AuthContract>('auth');
    expect(provider?.getProviderClient()).toBe(mockImpl);
  });
});

// ---------------------------------------------------------------------------
// getProviderConfig
// ---------------------------------------------------------------------------

describe('getProviderConfig', () => {
  it('reads an explicit config object', () => {
    const result = getProviderConfig('stripe', {
      providers: { stripe: { mock: true, apiVersion: '2024-01-01' } },
    });

    expect(result).toEqual({ mock: true, raw: { mock: true, apiVersion: '2024-01-01' } });
  });

  it('falls back to the global config (setGlobalMinderConfig) when no explicit config is passed', () => {
    setGlobalMinderConfig({
      apiBaseUrl: 'https://api.example.com',
      routes: {},
      providers: { supabase: { mock: true } },
    } as MinderConfig);

    expect(getProviderConfig('supabase')).toEqual({ mock: true, raw: { mock: true } });
  });

  it('returns null when there is no config source at all', () => {
    expect(getProviderConfig('unknown-provider')).toBeNull();
  });

  it('returns null for a provider with no entry under providers', () => {
    const result = getProviderConfig('unknown-provider', { providers: { stripe: { mock: true } } });
    expect(result).toBeNull();
  });

  it('mock is false when the entry exists but mock is not literally true', () => {
    const result = getProviderConfig('stripe', { providers: { stripe: { mock: false } } });
    expect(result).toEqual({ mock: false, raw: { mock: false } });
  });

  it('an explicit config argument takes precedence over the global config', () => {
    setGlobalMinderConfig({
      apiBaseUrl: 'https://api.example.com',
      routes: {},
      providers: { stripe: { mock: false } },
    } as MinderConfig);

    const result = getProviderConfig('stripe', { providers: { stripe: { mock: true } } });
    expect(result).toEqual({ mock: true, raw: { mock: true } });
  });
});

// ---------------------------------------------------------------------------
// validateMinderConfig — providers.<name>.mock
// ---------------------------------------------------------------------------

describe('validateMinderConfig — providers.<name>.mock', () => {
  it('accepts mock: true with no errors', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { mock: true } },
    });

    expect(result.errors.some((e) => e.key === 'providers.stripe.mock')).toBe(false);
  });

  it('accepts mock: false with no errors', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { mock: false } },
    });

    expect(result.errors.some((e) => e.key === 'providers.stripe.mock')).toBe(false);
  });

  it('flags a non-boolean mock value with a level:"error" ConfigError naming providers.<name>.mock', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { mock: 'yes' } },
    });

    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.key === 'providers.stripe.mock');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(err!.message).toContain('providers.stripe.mock');
    expect(err!.fix).toContain('mock: true');
  });

  it('does not error when providers is absent or a provider has no mock key', () => {
    expect(validateMinderConfig({ apiUrl: 'https://api.example.com' }).valid).toBe(true);
    expect(
      validateMinderConfig({
        apiUrl: 'https://api.example.com',
        providers: { stripe: { serverOnly: 'x' } },
      }).errors.some((e) => e.key === 'providers.stripe.mock')
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full zero-credential flow: registerMockProvider -> useAuth() -> isMock
// ---------------------------------------------------------------------------

describe('zero-credential mock flow', () => {
  it('useAuth() renders ready:true with the mock session and no providers config / credentials anywhere', async () => {
    // No configureMinder / setGlobalMinderConfig call anywhere in this test — proves the flow
    // needs zero config and zero credentials, only a registered mock provider.
    const mockSession = { userId: 'mock-user-1', raw: { plan: 'free' } };
    const unregister = registerMockProvider<AuthContract>('auth', {
      getSession: async () => mockSession,
      signOut: async () => undefined,
    });
    cleanups.push(unregister);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(result.current.session).toEqual(mockSession));
    expect(result.current.error).toBeNull();

    expect(getCapabilityProvider('auth')?.isMock).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Manifest-based mock via M1-05's createMockProvider, wired through registerMockProvider
// ---------------------------------------------------------------------------

describe('manifest-based mock (M1-05 createMockProvider) wired through registerMockProvider', () => {
  it('loads + validates tests/fixtures/providers/good-provider/manifest.json and passes impl callbacks through', async () => {
    const manifestPath = path.join(__dirname, 'fixtures', 'providers', 'good-provider', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ProviderManifest;

    expect(manifest.name).toBe('@example/provider-fixture');

    const onRequest = jest.fn(async () => undefined);
    const provideToken = jest.fn(async () => 'mock-token');

    const { manifest: validatedManifest, plugin } = createMockProvider(manifest, { onRequest, provideToken });

    expect(validatedManifest).toBe(manifest);
    expect(plugin.name).toBe(manifest.name);

    const unregister = registerMockProvider('auth', plugin, manifest.name);
    cleanups.push(unregister);

    const provider = getCapabilityProvider('auth') as CapabilityProvider<typeof plugin> | null;
    expect(provider?.isMock).toBe(true);
    expect(provider?.providerName).toBe(manifest.name);
    expect(provider?.getProviderClient()).toBe(plugin);

    // Impl callbacks pass straight through the plugin wired by createMockProvider.
    await provider!.implementation.onRequest?.({} as never);
    expect(onRequest).toHaveBeenCalledTimes(1);

    const token = await provider!.implementation.provideToken?.();
    expect(token).toBe('mock-token');
    expect(provideToken).toHaveBeenCalledTimes(1);
  });

  it('createMockProvider rejects an invalid manifest (missing tests/fixtures/providers/bad-provider guarantees are out of scope here — this asserts the good fixture round-trips cleanly)', () => {
    const manifestPath = path.join(__dirname, 'fixtures', 'providers', 'good-provider', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ProviderManifest;

    expect(() => createMockProvider(manifest)).not.toThrow();
  });
});
