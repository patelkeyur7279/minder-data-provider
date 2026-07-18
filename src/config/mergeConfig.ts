/**
 * mergeMinderConfig (Wave K / K-01) — compose several partial Minder config
 * modules into one, for enterprise setups where separate teams/features own
 * separate config fragments (routes, providers, environments, …).
 *
 * Merge rules:
 * - Record fields (`routes`, `providers`, `environments`) UNION-merge across
 *   modules; on a key conflict, the LATER module wins.
 * - Every other field (`apiUrl`, `auth`, `cache`, …) takes the LAST
 *   non-`undefined` value provided.
 *
 * The result is meant to be passed to `configureMinder` — which validates it
 * (e.g. requires `apiUrl`), so at least one module must supply `apiUrl`.
 * Inputs are never mutated.
 *
 * @example
 * configureMinder(mergeMinderConfig(usersModule, billingModule, { apiUrl }));
 */
import type { UnifiedMinderConfig } from './index.js';

type PartialConfig = Partial<UnifiedMinderConfig>;

const RECORD_FIELDS: Array<'routes' | 'providers' | 'environments'> = [
  'routes',
  'providers',
  'environments',
];

export function mergeMinderConfig(...configs: PartialConfig[]): UnifiedMinderConfig {
  const out: PartialConfig = {};

  for (const config of configs) {
    if (!config || typeof config !== 'object') continue;

    for (const key of Object.keys(config) as Array<keyof PartialConfig>) {
      const value = config[key];
      if (value === undefined) continue;

      if ((RECORD_FIELDS as string[]).includes(key as string)) {
        // Union-merge record fields; later keys win on conflict.
        const prev = (out[key] as Record<string, unknown> | undefined) ?? {};
        (out as Record<string, unknown>)[key as string] = {
          ...prev,
          ...(value as Record<string, unknown>),
        };
      } else {
        // Scalars / boolean|object option fields: last non-undefined wins.
        (out as Record<string, unknown>)[key as string] = value;
      }
    }
  }

  return out as UnifiedMinderConfig;
}
