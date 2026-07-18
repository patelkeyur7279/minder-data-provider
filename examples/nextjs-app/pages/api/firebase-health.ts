import type { NextApiRequest, NextApiResponse } from "next";
import { loadServiceAccount } from "minder-data-provider/providers/firebase";

/**
 * Demonstrates the SERVER-ONLY credential-FILE health check — the reason
 * Firebase is the wave that activates the `FileRef` path. `loadServiceAccount`
 * resolves a service-account JSON (via `GOOGLE_APPLICATION_CREDENTIALS`, a
 * filesystem path, Node only) and returns MASKED health only: this route
 * NEVER returns file contents, the raw service-account object, or the
 * `private_key` — only `{ projectId, clientEmail: masked, hasPrivateKey }`.
 *
 * GUARDED so this example builds and runs with zero keys: if
 * GOOGLE_APPLICATION_CREDENTIALS is unset we short-circuit BEFORE ever calling
 * `loadServiceAccount`, returning `{ configured: false, note }` instead. A
 * real deployment sets the env var to a service-account JSON path and this
 * same route returns the masked health.
 */
export default async function firebaseHealthHandler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    res.status(200).json({
      configured: false,
      note: "Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path to see masked health",
    });
    return;
  }

  // Real wiring: resolve + validate the service-account file server-side and
  // return only its MASKED health — never the file contents.
  const health = await loadServiceAccount({
    kind: "file",
    source: "path",
    ref: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });

  res.status(200).json(health);
}
