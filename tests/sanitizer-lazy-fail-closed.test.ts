/**
 * D4 — DOMPurify now loads lazily (dynamic `import('dompurify')`) instead of
 * sitting in the static import graph of `core`/`hook`. `XSSSanitizer.sanitize()`
 * stays SYNCHRONOUS (its callers in `apiClient/upload.ts` are synchronous), so
 * it cannot await the import inline — it consults whatever `ready()` has
 * already resolved.
 *
 * P2 security invariant under test: in a browser (`window` present),
 * `sanitize()` must NEVER silently fall back to the weaker regex-based
 * `basicSanitize()` if the DOMPurify import hasn't resolved yet or failed to
 * load — it must FAIL CLOSED and throw `SANITIZER_UNAVAILABLE` instead.
 * Server-side (`window` undefined) behavior is unchanged: always
 * `basicSanitize()`, dompurify is never imported at all.
 *
 * Each `it` that needs a specific mock of 'dompurify' calls
 * `jest.resetModules()` + `jest.doMock('dompurify', ...)` and then
 * `require()`s `../src/utils/security.js` fresh, so mocks never leak between
 * tests (precedent: tests/mdpd-34-hermes-navigator-guard.test.ts).
 */

describe('XSSSanitizer — lazy DOMPurify, fail-closed (D4)', () => {
  afterEach(() => {
    jest.dontMock('dompurify');
    jest.resetModules();
  });

  it('produces real DOMPurify output once ready() resolves (jsdom, window present)', async () => {
    const { XSSSanitizer } = require('../src/utils/security.js');
    const sanitizer = new XSSSanitizer();

    await sanitizer.ready();

    const clean = sanitizer.sanitize('<script>alert(1)</script>Hello');
    expect(clean).not.toContain('<script>');
    expect(clean).toContain('Hello');
  });

  it('throws SANITIZER_UNAVAILABLE — never falls back silently — when the DOMPurify import rejects', async () => {
    jest.resetModules();
    jest.doMock('dompurify', () => {
      throw new Error('blocked by CSP');
    });

    const { XSSSanitizer } = require('../src/utils/security.js');
    const { MinderError } = require('../src/errors/index.js');

    const sanitizer = new XSSSanitizer();
    await sanitizer.ready();

    const dirty = '<script>alert(1)</script>Hello';
    let thrown: unknown;
    try {
      sanitizer.sanitize(dirty);
      throw new Error('sanitize() should have thrown but did not');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(MinderError);
    expect((thrown as InstanceType<typeof MinderError>).code).toBe('SANITIZER_UNAVAILABLE');
    expect((thrown as InstanceType<typeof MinderError>).status).toBe(500);
  });

  it('fails closed (throws, does not return the dirty input) when sanitize() is called before ready() resolves', () => {
    jest.resetModules();
    // Never-resolving import: proves sanitize() does not race ahead of the
    // load and return unsanitized data just because domPurify isn't ready yet.
    jest.doMock('dompurify', () => new Promise(() => {}));

    const { XSSSanitizer } = require('../src/utils/security.js');
    const { MinderError } = require('../src/errors/index.js');

    const sanitizer = new XSSSanitizer();
    // Deliberately NOT awaiting ready() here.

    const dirty = '<script>alert(1)</script>Hello';
    expect(() => sanitizer.sanitize(dirty)).toThrow(MinderError);
    try {
      sanitizer.sanitize(dirty);
    } catch (err) {
      expect((err as InstanceType<typeof MinderError>).code).toBe('SANITIZER_UNAVAILABLE');
    }
  });

  it('server-side (no window) always uses basicSanitize and never imports dompurify', async () => {
    jest.resetModules();
    const domPurifyFactory = jest.fn(() => {
      throw new Error('dompurify must not be imported when window is undefined');
    });
    jest.doMock('dompurify', domPurifyFactory);

    const savedWindow = (global as any).window;
    delete (global as any).window;

    try {
      const { XSSSanitizer } = require('../src/utils/security.js');
      const sanitizer = new XSSSanitizer();
      await sanitizer.ready();

      const dirty = '<script>alert(1)</script>Hello';
      const clean = sanitizer.sanitize(dirty);

      // basicSanitize's regex fallback strips the script tag, unchanged
      // behavior from before D4.
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Hello');
      expect(domPurifyFactory).not.toHaveBeenCalled();
    } finally {
      (global as any).window = savedWindow;
    }
  });

  it('never constructs an XSSSanitizer (so never imports dompurify) when security.sanitization is not configured', () => {
    jest.resetModules();
    const domPurifyFactory = jest.fn(() => {
      throw new Error('dompurify must not be imported when sanitization is unconfigured');
    });
    jest.doMock('dompurify', domPurifyFactory);

    const { ApiClient } = require('../src/core/ApiClient.js');
    const mockAuthManager = { getToken: () => null, clearAuth: () => {} } as any;

    const client = new ApiClient(
      { apiBaseUrl: 'http://api.test', routes: {} },
      mockAuthManager
    );

    // ApiClient only calls `new XSSSanitizer(...)` — the sole caller of
    // `loadDOMPurify()` — when `config.security?.sanitization` is set.
    expect((client as any).sanitizer).toBeUndefined();
    expect(domPurifyFactory).not.toHaveBeenCalled();
  });
});
