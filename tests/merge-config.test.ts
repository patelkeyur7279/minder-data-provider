/**
 * Wave K (K-01): mergeMinderConfig — compose several partial config modules
 * (e.g. one per team/feature) into one config to hand to configureMinder.
 * Record fields (routes, providers, environments) union-merge; scalars
 * last-non-undefined wins.
 */
import { describe, it, expect } from '@jest/globals';
import { mergeMinderConfig } from '../src/config/mergeConfig';
import { HttpMethod } from '../src/constants/enums';

describe('mergeMinderConfig', () => {
  it('unions disjoint routes from separate modules', () => {
    const merged = mergeMinderConfig(
      { routes: { users: { url: '/users', method: HttpMethod.GET } } },
      { routes: { posts: { url: '/posts', method: HttpMethod.GET } } }
    );
    expect(Object.keys(merged.routes || {}).sort()).toEqual(['posts', 'users']);
  });

  it('last module wins on a route-key conflict', () => {
    const merged = mergeMinderConfig(
      { routes: { users: '/v1/users' } },
      { routes: { users: '/v2/users' } }
    );
    expect(merged.routes?.users).toBe('/v2/users');
  });

  it('merges providers from different modules', () => {
    const merged = mergeMinderConfig(
      { providers: { stripe: { mock: true } } },
      { providers: { supabase: { mock: true } } }
    );
    expect(Object.keys(merged.providers || {}).sort()).toEqual(['stripe', 'supabase']);
  });

  it('takes apiUrl from whichever module provides it (last non-undefined wins)', () => {
    expect(mergeMinderConfig({ routes: {} }, { apiUrl: 'https://api.example.com' }).apiUrl).toBe(
      'https://api.example.com'
    );
    expect(
      mergeMinderConfig({ apiUrl: 'https://a.com' }, { apiUrl: 'https://b.com' }).apiUrl
    ).toBe('https://b.com');
    // A later module without apiUrl does not clobber an earlier one.
    expect(mergeMinderConfig({ apiUrl: 'https://a.com' }, { routes: {} }).apiUrl).toBe(
      'https://a.com'
    );
  });

  it('merges environments blocks', () => {
    const merged = mergeMinderConfig(
      { environments: { staging: { apiUrl: 'https://staging' } } },
      { environments: { prod: { apiUrl: 'https://prod' } } }
    );
    expect(Object.keys(merged.environments || {}).sort()).toEqual(['prod', 'staging']);
  });

  it('handles a single module and zero modules', () => {
    expect(mergeMinderConfig({ apiUrl: 'https://x' }).apiUrl).toBe('https://x');
    expect(mergeMinderConfig()).toEqual({});
  });

  it('does not mutate the input modules', () => {
    const a = { routes: { users: '/users' } };
    const b = { routes: { posts: '/posts' } };
    mergeMinderConfig(a, b);
    expect(a).toEqual({ routes: { users: '/users' } });
    expect(b).toEqual({ routes: { posts: '/posts' } });
  });
});
