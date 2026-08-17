/**
 * Runnable example for @minder/provider-firebase (referenced by manifest.docs.example).
 *
 * Illustrative only — placeholder values throughout. It shows the four things an
 * app does to adopt the provider:
 *   1. describe the provider in Minder config (the whole web config is PUBLIC and
 *      inline; the service-account credential is server-only via a FileRef),
 *   2. register the provider once at startup (client),
 *   3. consume it through the capability hooks (`useAuth()`),
 *   4. check the service-account credential's MASKED health on the server.
 *
 * In a real app you would import from the published package:
 *
 *   import { registerFirebaseProvider, loadServiceAccount } from 'minder-data-provider/providers/firebase';
 *   import { useAuth } from 'minder-data-provider';
 *
 * In-repo, these resolve via relative paths for illustration.
 */
import { registerFirebaseProvider, loadServiceAccount } from './src/index.js';
import type { FirebaseProviderConfig } from './src/index.js';
import type { FileRef } from '../../src/security/credentials.js';
import { useAuth } from '../../src/hooks/contracts.js';

// 1. Config. The ENTIRE Firebase web config is PUBLIC (safe inline) — Firebase's
//    `apiKey` is a project IDENTIFIER, not a secret. The `serviceAccount` is a
//    credential FILE, referenced server-only via a FileRef (a raw object/string
//    here would hard-fail config validation in the browser).
//
//    `GOOGLE_APPLICATION_CREDENTIALS` is the conventional env var holding the
//    PATH to the service-account JSON. Alternatively use a base64-encoded env
//    payload: { kind: 'file', source: 'envJson', ref: 'FIREBASE_SERVICE_ACCOUNT_B64' }.
const serviceAccount: FileRef = {
  kind: 'file',
  source: 'path',
  ref: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '/etc/secrets/firebase-service-account.json',
};

const firebaseConfig: FirebaseProviderConfig = {
  apiKey: 'AIzaSy-your-public-web-api-key',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
  serviceAccount,
};

// 2. Register once at app startup (CLIENT). For credential-free UI development,
//    pass `{ ...firebaseConfig, mock: true }` (or set providers.firebase.mock).
export async function startFirebase(): Promise<() => void> {
  return registerFirebaseProvider(firebaseConfig);
}

// 3. Consume it anywhere via the stable capability hooks — no Firebase glue.
export function AuthStatus(): { ready: boolean; userId: string | null } {
  const { ready, session } = useAuth();
  return { ready, userId: session?.userId ?? null };
}

// 4. SERVER ONLY: check the service-account credential's MASKED health (e.g. in a
//    `minder doctor` route). The raw file — and the private_key in particular —
//    is NEVER returned; only { valid, masked: { projectId, clientEmail (masked),
//    hasPrivateKey }, errors }.
export async function checkServiceAccountHealth(): Promise<void> {
  const health = await loadServiceAccount(serviceAccount);
  // health.masked.clientEmail is masked (e.g. "fire***@your-project.iam..."),
  // health.masked.hasPrivateKey is a boolean — never the key itself.
  console.log('[firebase] service account health:', health.valid, health.masked);
}
