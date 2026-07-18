/**
 * OSS-08 (error DX): every thrown framework error must carry at least one
 * actionable suggestion, so a developer who only sees the error still gets a
 * fix hint (+ a docs pointer where relevant). Guards against any MinderError
 * subclass — existing or newly added — shipping with an empty `suggestions[]`.
 *
 * Complements error-doc-links.test.ts (which statically checks the source for
 * dead docs links) by checking the runtime instances developers actually see.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  MinderError,
  MinderConfigError,
  MinderNetworkError,
  MinderValidationError,
  MinderAuthError,
  MinderAuthorizationError,
  MinderStorageError,
  MinderPlatformError,
  MinderSecurityError,
  MinderTimeoutError,
  MinderOfflineError,
  MinderPluginError,
  MinderWebSocketError,
  MinderUploadError,
} from '../src/errors/MinderError';

const repoRoot = path.resolve(__dirname, '..');

// One representative instance per typed subclass, built with MINIMAL args —
// the worst case for suggestion coverage (no optional context to enrich them).
const instances: Array<[string, MinderError]> = [
  ['MinderConfigError', new MinderConfigError('boom')],
  ['MinderNetworkError (uncovered status)', new MinderNetworkError('boom', 418)],
  ['MinderNetworkError (known status)', new MinderNetworkError('boom', 500)],
  ['MinderNetworkError (status 0)', new MinderNetworkError('boom', 0)],
  ['MinderValidationError (no fields)', new MinderValidationError('boom')],
  ['MinderAuthError', new MinderAuthError('boom')],
  ['MinderAuthorizationError', new MinderAuthorizationError('boom')],
  ['MinderStorageError', new MinderStorageError('boom')],
  ['MinderPlatformError', new MinderPlatformError('boom', 'web')],
  ['MinderSecurityError', new MinderSecurityError('boom')],
  ['MinderTimeoutError', new MinderTimeoutError('boom', 5000)],
  ['MinderOfflineError', new MinderOfflineError('boom')],
  ['MinderPluginError', new MinderPluginError('boom', 'my-plugin')],
  ['MinderWebSocketError', new MinderWebSocketError('boom')],
  ['MinderUploadError', new MinderUploadError('boom')],
];

describe('OSS-08: every framework error carries an actionable suggestion', () => {
  it.each(instances)('%s has at least one suggestion', (_name, err) => {
    expect(err.suggestions.length).toBeGreaterThan(0);
  });

  it.each(instances)('%s has at least one suggestion with an action', (_name, err) => {
    expect(err.suggestions.some((s) => typeof s.action === 'string' && s.action.length > 0)).toBe(
      true
    );
  });

  it.each(instances)('%s: every docs/*.md link in a suggestion resolves', (_name, err) => {
    for (const s of err.suggestions) {
      if (!s.link) continue;
      const m = s.link.match(/docs\/[A-Za-z0-9_./-]+\.md/);
      if (m) {
        expect(fs.existsSync(path.join(repoRoot, m[0]))).toBe(true);
      }
    }
  });
});
