/**
 * F-08: configureMinder must propagate the `providers` section into the stored
 * global MinderConfig so getProviderConfig's global fallback works end-to-end.
 * (Found by F-04: buildFullConfig/applyUserConfig had no providers handling.)
 */
import { configureMinder } from '../src/config/index';
import { getGlobalMinderConfig, clearGlobalMinderConfig } from '../src/core/globalConfig';
import { getProviderConfig } from '../src/contracts/mockRegistry';

describe('F-08: providers config propagation', () => {
  afterEach(() => {
    clearGlobalMinderConfig();
  });

  it('configureMinder round-trips providers into the global config', () => {
    configureMinder({
      apiUrl: 'https://api.example.com',
      providers: { supabase: { mock: true, url: 'https://x.supabase.co' } },
    });
    const stored = getGlobalMinderConfig() as { providers?: Record<string, unknown> } | null;
    expect(stored?.providers).toEqual({ supabase: { mock: true, url: 'https://x.supabase.co' } });
  });

  it('getProviderConfig reads the configureMinder-supplied providers via global fallback', () => {
    configureMinder({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { mock: true } },
    });
    expect(getProviderConfig('stripe')).toEqual({ mock: true, raw: { mock: true } });
  });

  it('providers absent stays absent (no empty object injected)', () => {
    configureMinder({ apiUrl: 'https://api.example.com' });
    const stored = getGlobalMinderConfig() as { providers?: unknown } | null;
    expect(stored?.providers).toBeUndefined();
    expect(getProviderConfig('anything')).toBeNull();
  });
});
