/**
 * H1 — client auth fails closed: `setToken(undefined)` (and the literal
 * strings `"undefined"` / `"null"`, the values that used to be silently
 * persisted) must never leave `isAuthenticated()` returning true.
 *
 * No HTTP server, no React — `AuthManager` is a plain exported class
 * (`minder-data-provider/auth`). Loaded from the SCRATCH install so this
 * exercises the real packed artifact, not source.
 */
export async function run(ctx) {
  const { scratchDir } = ctx;
  const { requireFromScratch } = ctx.load;
  const results = [];

  const { AuthManager } = requireFromScratch(scratchDir, 'minder-data-provider/auth');

  const check = (id, badValue) => {
    const mgr = new AuthManager();
    let threw = false;
    try {
      // @ts-expect-error — deliberately passing an invalid value.
      mgr.setToken(badValue);
    } catch {
      threw = true;
    }
    const isAuthed = mgr.isAuthenticated();
    const pass = threw && isAuthed === false;
    results.push({
      id,
      pass,
      message: pass
        ? `setToken(${JSON.stringify(badValue)}) threw and isAuthenticated() stayed false`
        : `setToken(${JSON.stringify(badValue)}) threw=${threw}, isAuthenticated()=${isAuthed} (expected threw=true, isAuthenticated()=false)`,
    });
  };

  check('h1-setToken-undefined-rejected', undefined);
  check('h1-setToken-literal-string-undefined-rejected', 'undefined');
  check('h1-setToken-literal-string-null-rejected', 'null');

  return results;
}
