/**
 * B2 + H3 — standalone `minder()` and request-body sanitization, asserted
 * against the exact bytes that land on the wire.
 *
 *   B2: with NO `security.sanitization` configured, the body must travel
 *       unmodified — sanitization is opt-in, never a surprise mutation.
 *   H3: with `security.sanitization.fields` configured, only the OPTED-IN
 *       field is touched; a field NOT in the list keeps an ordinary '&'
 *       un-mangled (the corruption bug H3's ADR — FIX_PLAN.md §3 — exists to
 *       stop). Note: `XSSSanitizer`/`ApiClient` are deliberately unexported
 *       (L1), so standalone `minder()` — the only public surface that can
 *       reach this without a provider — is used for all three cases.
 */
export async function run(ctx) {
  const { scratchDir } = ctx;
  const { requireFromScratch } = ctx.load;
  const results = [];

  const recorder = await ctx.startRecordingServer();
  try {
    const mdp = requireFromScratch(scratchDir, 'minder-data-provider');

    // --- B2: no sanitization configured at all => byte-for-byte passthrough ---
    {
      mdp.configureMinder({
        apiUrl: recorder.baseUrl,
        routes: { createNote: { method: 'POST', url: '/notes' } },
      });
      recorder.clear();
      const payload = { title: 'Tom & Jerry <3' };
      await mdp.minder('createNote', payload, { method: 'POST' });
      const rec = recorder.records.find((r) => r.url.includes('/notes'));
      const pass = !!rec && rec.rawBody.includes('Tom & Jerry <3');
      results.push({
        id: 'b2-standalone-sanitization-disabled-by-default-passthrough',
        pass,
        message: pass
          ? `wire body preserved "Tom & Jerry <3" unmodified with no sanitization configured`
          : `expected the raw body on the wire; got ${rec ? JSON.stringify(rec.rawBody) : 'no request recorded'}`,
      });
    }

    // --- H3: opt-in field with actual markup must be sanitized on the wire ---
    {
      mdp.configureMinder({
        apiUrl: recorder.baseUrl,
        security: { sanitization: { enabled: true, fields: ['bio'] } },
        routes: { createProfile: { method: 'POST', url: '/profiles' } },
      });
      recorder.clear();
      const payload = { bio: '<script>alert(1)</script>', title: 'Tom & Jerry <3' };
      let threw = false;
      try {
        await mdp.minder('createProfile', payload, { method: 'POST' });
      } catch {
        threw = true;
      }
      const rec = recorder.records.find((r) => r.url.includes('/profiles'));
      // Correct end-state: either the opted-in field is actually stripped/escaped
      // on the wire, OR the call fails closed (throws) rather than shipping the
      // raw <script> tag while security.sanitization was explicitly requested.
      const bioWasSanitized = !!rec && !rec.rawBody.includes('<script>alert(1)</script>');
      const pass = threw || bioWasSanitized;
      results.push({
        id: 'h3-sanitization-optin-field-strips-script-tag',
        pass,
        message: pass
          ? threw
            ? 'call failed closed rather than shipping raw markup in an opted-in field'
            : 'opted-in "bio" field was sanitized on the wire'
          : `opted-in "bio" field reached the wire unsanitized (B2: standalone minder() must wire the sanitizer): ${rec ? JSON.stringify(rec.rawBody) : 'no request recorded'}`,
      });
    }

    // --- H3: a field NOT in the opt-in list must keep '&' un-mangled ---
    {
      mdp.configureMinder({
        apiUrl: recorder.baseUrl,
        security: { sanitization: { enabled: true, fields: ['bio'] } },
        routes: { createProfile2: { method: 'POST', url: '/profiles2' } },
      });
      recorder.clear();
      const payload = { bio: 'harmless', title: 'Tom & Jerry <3' };
      await mdp.minder('createProfile2', payload, { method: 'POST' }).catch(() => {});
      const rec = recorder.records.find((r) => r.url.includes('/profiles2'));
      const pass = !!rec && rec.rawBody.includes('Tom & Jerry <3') && !rec.rawBody.includes('&amp;');
      results.push({
        id: 'h3-sanitization-non-optin-field-preserves-ampersand',
        pass,
        message: pass
          ? `non-opted-in "title" field kept its literal '&' unmangled on the wire`
          : `non-opted-in "title" field was corrupted or missing on the wire: ${rec ? JSON.stringify(rec.rawBody) : 'no request recorded'}`,
      });
    }
  } catch (err) {
    for (const id of [
      'b2-standalone-sanitization-disabled-by-default-passthrough',
      'h3-sanitization-optin-field-strips-script-tag',
      'h3-sanitization-non-optin-field-preserves-ampersand',
    ]) {
      if (!results.some((r) => r.id === id)) {
        results.push({ id, pass: false, message: `driver threw before this case ran: ${err?.message ?? err}` });
      }
    }
  } finally {
    await recorder.close();
  }

  return results;
}
