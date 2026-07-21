# Security Guide

## Overview

This guide covers security best practices, features, and configurations for `minder-data-provider`. Security is a core concern, and we've implemented multiple layers of protection to help you build secure applications.

---

## 🔒 Security Features

### 1. Token Storage Security

**IMPORTANT**: `localStorage` has been removed entirely for security reasons.

#### Why localStorage Was Removed

- **XSS Vulnerability**: localStorage is accessible to any JavaScript code, including malicious scripts
- **No Expiration**: Data persists indefinitely, increasing exposure window
- **Cross-Tab Access**: All tabs can access the same data
- **Not Secure by Default**: No built-in encryption or security

#### Recommended Storage Options

**Web Platforms (React, Next.js, Vite):**

| Storage Type | Security | Persistence | Best For |
|-------------|----------|-------------|----------|
| `cookie` ⭐ | ✅ High (HttpOnly, Secure, SameSite) | ✅ Persistent | **Production apps** |
| `sessionStorage` | ⚠️ Medium (XSS vulnerable) | ⚠️ Tab session only | Development/testing |
| `memory` | ✅ High (in-memory only) | ❌ Page refresh clears | Temporary auth, high-security needs |

**Mobile Platforms (React Native, Expo):**

| Storage Type | Security | Persistence | Best For |
|-------------|----------|-------------|----------|
| `SecureStore` ⭐ | ✅ Highest (Encrypted, Keychain) | ✅ Persistent | **Expo apps (recommended)** |
| `AsyncStorage` | ⚠️ Medium (Unencrypted) | ✅ Persistent | React Native apps |
| `memory` | ✅ High (in-memory only) | ⚠️ App restart clears | Quick auth sessions |

> **Note for React Native/Expo**: While `AsyncStorage` and `SecureStore` are async, token authentication typically happens once per app session. For the best security on mobile:
> - **Expo**: Use `SecureStore` (encrypted, backed by iOS Keychain/Android Keystore)
> - **React Native**: Use `AsyncStorage` for persistence or `memory` for high-security needs
> - Both automatically handle persistence through the native platform

#### Configuration

**Web (React, Next.js, Vite):**

```typescript
import { MinderDataProvider } from 'minder-data-provider';

const App = () => (
  <MinderDataProvider
    apiUrl="https://api.example.com"
    routes={{ users: '/users' }}
    dynamic
    auth={{
      storage: 'cookie', // ✅ Recommended for production
      tokenKey: 'accessToken'
    }}
  >
    {/* Your app */}
  </MinderDataProvider>
);
```

**React Native:**

```typescript
import { MinderDataProvider } from 'minder-data-provider';

const App = () => (
  <MinderDataProvider
    apiUrl="https://api.example.com"
    routes={{ users: '/users' }}
    dynamic
    auth={{
      storage: 'AsyncStorage', // ✅ Persistent storage for React Native
      tokenKey: 'accessToken'
    }}
  >
    {/* Your app */}
  </MinderDataProvider>
);
```

**Expo (Recommended - Encrypted Storage):**

```typescript
import { MinderDataProvider } from 'minder-data-provider';

const App = () => (
  <MinderDataProvider
    apiUrl="https://api.example.com"
    routes={{ users: '/users' }}
    dynamic
    auth={{
      storage: 'SecureStore', // ✅ Encrypted storage (iOS Keychain/Android Keystore)
      tokenKey: 'accessToken'
    }}
  >
    {/* Your app */}
  </MinderDataProvider>
);
```

**Electron:**

```typescript
import { MinderDataProvider } from 'minder-data-provider';

const App = () => (
  <MinderDataProvider
    apiUrl="https://api.example.com"
    routes={{ users: '/users' }}
    dynamic
    auth={{
      storage: 'cookie', // ✅ Works in Electron (Chromium-based)
      tokenKey: 'accessToken'
    }}
  >
    {/* Your app */}
  </MinderDataProvider>
);
```

**Cookie Security Settings (Automatic)**:
- `Secure`: Only sent over HTTPS
- `SameSite=Strict`: Prevents CSRF attacks
- `HttpOnly`: Not accessible via JavaScript (when set server-side)
- `path=/`: Available to entire app

## 📱 React Native / Expo Security

### Platform-Specific Storage

React Native and Expo have **different security requirements** than web platforms:

**Key Differences:**
- ❌ No XSS risk (no direct HTML/JavaScript execution)
- ❌ No CORS issues (native HTTP clients)
- ✅ OS-level security (iOS Keychain, Android Keystore)
- ✅ Apps don't "refresh" like web pages

### Expo with SecureStore (Recommended)

**Best Security:** Uses iOS Keychain and Android Keystore

```typescript
// App.tsx
import { MinderDataProvider } from 'minder-data-provider';

export default function App() {
  return (
    <MinderDataProvider
      apiUrl="https://api.example.com"
      routes={{ users: '/users', posts: '/posts' }}
      dynamic
      auth={{
        storage: 'SecureStore', // ✅ Encrypted storage
        tokenKey: 'accessToken'
      }}
      security={{
        // Note: Some web security features don't apply to native apps
        sanitization: false, // No XSS risk in native
        csrfProtection: false, // Different security model
        inputValidation: true, // ✅ Still validate input
        httpsOnly: true // ✅ Enforce HTTPS for API calls
      }}
    >
      <YourApp />
    </MinderDataProvider>
  );
}
```

**Async Token Access:**

```typescript
import { useAuth } from 'minder-data-provider';

function MyComponent() {
  const auth = useAuth();
  
  useEffect(() => {
    // SecureStore is async - use getTokenAsync()
    const loadToken = async () => {
      const token = await auth.getTokenAsync();
      if (token) {
        console.log('User is authenticated');
      }
    };
    
    loadToken();
  }, []);
}
```

### React Native with AsyncStorage

**Good for persistence**, but unencrypted:

```typescript
// App.tsx
import { MinderDataProvider } from 'minder-data-provider';

export default function App() {
  return (
    <MinderDataProvider
      apiUrl="https://api.example.com"
      routes={{ users: '/users' }}
      dynamic
      auth={{
        storage: 'AsyncStorage', // ✅ Persistent, ⚠️ Unencrypted
        tokenKey: 'accessToken'
      }}
      security={{
        httpsOnly: true,
        inputValidation: true
      }}
    >
      <YourApp />
    </MinderDataProvider>
  );
}
```

**Installation:**

```bash
npm install @react-native-async-storage/async-storage
```

**Async Token Access:**

```typescript
import { useAuth } from 'minder-data-provider';

function MyComponent() {
  const auth = useAuth();
  
  useEffect(() => {
    // AsyncStorage is async - use getTokenAsync()
    const loadToken = async () => {
      const token = await auth.getTokenAsync();
      if (token) {
        // Token loaded from persistent storage
      }
    };
    
    loadToken();
  }, []);
}
```

### React Native with Memory (Highest Security)

**Best for sensitive data** that shouldn't persist:

```typescript
auth={{
  storage: 'memory', // ✅ Most secure, ❌ Lost on app restart
  tokenKey: 'accessToken'
}}
```

**When to use:**
- Financial apps with strict security requirements
- Apps handling medical/personal data
- When you want users to re-authenticate on app restart

---



### Production Requirements

In production (`NODE_ENV=production`), HTTPS is **required** by default:

```typescript
// ✅ HTTPS - Works in production
apiUrl: 'https://api.example.com'

// ❌ HTTP - Will throw error in production
apiUrl: 'http://api.example.com'
```

### Development Mode

In development, you'll see warnings but HTTP is allowed:

```
⚠️  SECURITY WARNING: Using HTTP in development. 
    Switch to HTTPS before deploying to production.
```

### Disable HTTPS Enforcement (Not Recommended)

```typescript
security: {
  httpsOnly: false, // ⚠️ Only for specific use cases
  developmentWarnings: false // Disable dev warnings
}
```

---

## 🛡️ Cross-Site Request Forgery (CSRF) Protection

### Automatic CSRF Protection

Enable CSRF protection to prevent malicious sites from making requests on behalf of authenticated users:

```typescript
<MinderDataProvider
  apiUrl="https://api.example.com"
  routes={{ users: '/users' }}
  dynamic
  security={{
    csrfProtection: true // ✅ Recommended
  }}
>
```

### Advanced CSRF Configuration

```typescript
security: {
  csrfProtection: {
    enabled: true,
    tokenLength: 32, // Token byte length
    headerName: 'X-CSRF-Token', // Custom header name
    cookieName: 'csrf_token' // Custom cookie name
  }
}
```

### How It Works

1. Library generates cryptographically secure CSRF token
2. Token stored in sessionStorage and/or cookie
3. Token automatically added to request headers
4. Server validates token matches for state-changing requests (POST, PUT, DELETE)

### Server-Side Validation Example

```javascript
// Express.js example
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

app.post('/api/users', csrfProtection, (req, res) => {
  // CSRF token automatically validated
  // Handle request
});
```

---

## 🧹 XSS (Cross-Site Scripting) Protection

### Input Sanitization

Automatically sanitize user input to prevent XSS attacks:

```typescript
security: {
  sanitization: true // ✅ Recommended
}
```

### Custom Sanitization Rules

```typescript
security: {
  sanitization: {
    enabled: true,
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    allowedAttributes: {
      'a': ['href', 'title'],
      'img': ['src', 'alt']
    }
  }
}
```

### What Gets Sanitized

- HTML tags (script, iframe, embed, object)
- JavaScript event handlers (onclick, onerror, etc.)
- JavaScript: protocol URIs
- Data URIs for HTML content
- VBScript: protocol URIs

### Sanitization in Action

```typescript
// Malicious input
const userInput = '<img src=x onerror="alert(\'XSS\')">';

// After sanitization
// Result: '<img src="x">' (onerror removed)
```

---

## 🚦 Rate Limiting

Protect your API from abuse and DDoS attacks:

```typescript
security: {
  rateLimiting: {
    requests: 100, // Max requests
    window: 60000, // Per minute (in ms)
  }
}
```

### How Rate Limiting Works

- Tracks requests per endpoint in memory
- Returns error when limit exceeded
- Automatically cleans up old request records
- Resets counter after time window expires

### Rate Limit Error Handling

```typescript
const { data, errors } = useMinder('getUsers');

useEffect(() => {
  if (errors.current?.code === 'RATE_LIMIT_EXCEEDED') {
    console.log('Too many requests. Please try again later.');
  }
}, [errors.current]);
```

---

## 📋 Security Headers

### Default Security Headers

Automatically applied to all requests:

| Header | Default Value | Purpose |
|--------|--------------|---------|
| `Content-Security-Policy` | `default-src 'self'` | Prevent XSS, injection attacks |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `Strict-Transport-Security` | `max-age=31536000` | Enforce HTTPS |
| `X-XSS-Protection` | `1; mode=block` | Enable browser XSS filter |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer info |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Limit feature access |

### Custom Security Headers

```typescript
security: {
  headers: {
    contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.example.com",
    xFrameOptions: 'SAMEORIGIN', // Allow same-origin framing
    strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
    xContentTypeOptions: true // or false to disable
  }
}
```

### Disable Security Headers (Not Recommended)

```typescript
security: {
  headers: {
    xContentTypeOptions: false,
    xFrameOptions: '' // Empty string disables
  }
}
```

---

## ✅ Input Validation

### Enable Input Validation

```typescript
security: {
  inputValidation: true
}
```

### Validation Utilities

```typescript
import { InputValidator } from 'minder-data-provider';

// Email validation
InputValidator.isValidEmail('user@example.com'); // true

// URL validation
InputValidator.isValidURL('https://example.com'); // true

// Filename sanitization (prevents path traversal)
const safe = InputValidator.sanitizeFilename('../../etc/passwd');
// Result: '______etc_passwd'

// SQL injection detection
InputValidator.hasSQLInjectionPattern("' OR '1'='1"); // true

// Length validation
InputValidator.validateLength('password', 8, 128); // true if 8-128 chars

// Numeric range validation
InputValidator.validateRange(25, 18, 65); // true
```

---

## 🔐 Complete Security Configuration

### Production-Ready Example

```typescript
import { MinderDataProvider } from 'minder-data-provider';

const App = () => (
  <MinderDataProvider
    apiUrl="https://api.example.com"
    routes={{
      users: '/users',
      posts: '/posts'
    }}
    dynamic
    auth={{
      storage: 'cookie', // ✅ Secure token storage
      tokenKey: 'accessToken',
      refreshUrl: '/auth/refresh'
    }}
    security={{
      // CSRF protection
      csrfProtection: {
        enabled: true,
        tokenLength: 32,
        headerName: 'X-CSRF-Token'
      },
      
      // XSS protection
      sanitization: {
        enabled: true,
        allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
        allowedAttributes: {
          'a': ['href', 'title']
        }
      },
      
      // Rate limiting
      rateLimiting: {
        requests: 100,
        window: 60000 // 1 minute
      },
      
      // Security headers
      headers: {
        contentSecurityPolicy: "default-src 'self'; script-src 'self' https://cdn.example.com",
        xFrameOptions: 'DENY',
        strictTransportSecurity: 'max-age=31536000; includeSubDomains'
      },
      
      // Input validation
      inputValidation: true,
      
      // HTTPS enforcement
      httpsOnly: true, // Required in production
      developmentWarnings: true // Show security warnings in dev
    }}
  >
    <YourApp />
  </MinderDataProvider>
);
```

---

## 🚨 Security Warnings

### Development Mode Warnings

When `security.developmentWarnings: true` (default), you'll see helpful warnings:

```
⚠️  SECURITY WARNING: Using HTTP in development. 
    Switch to HTTPS before deploying to production.

⚠️  DEVELOPMENT MODE: Auth tokens stored in memory will be lost on refresh. 
    Use sessionStorage or cookie for production.

⚠️  SECURITY WARNING: CSRF protection is disabled. 
    Enable it before deploying to production.
```

### Disable Warnings

```typescript
security: {
  developmentWarnings: false
}
```

---

## 📊 Security Checklist

Before deploying to production:

- [ ] ✅ Use HTTPS (`https://` in `apiUrl`)
- [ ] ✅ Use `cookie` or `sessionStorage` for auth tokens (NOT `memory`)
- [ ] ✅ Enable CSRF protection (`csrfProtection: true`)
- [ ] ✅ Enable XSS sanitization (`sanitization: true`)
- [ ] ✅ Configure rate limiting (`rateLimiting: { requests: 100, window: 60000 }`)
- [ ] ✅ Enable input validation (`inputValidation: true`)
- [ ] ✅ Review security headers (use defaults or customize)
- [ ] ✅ Test authentication flow with real tokens
- [ ] ✅ Verify CORS configuration matches your domains
- [ ] ✅ Enable HTTPS enforcement (`httpsOnly: true`)

---

## 🔗 Related Documentation

- [Configuration Guide](./CONFIG_GUIDE.md) - Full configuration options
- [API Reference](./API_REFERENCE.md) - Complete API documentation
- [Examples](./EXAMPLES.md) - Real-world usage examples

---

## 🆘 Security Issues

If you discover a security vulnerability, please:

1. **DO NOT** create a public GitHub issue
2. Email security concerns to: security@minder-data-provider.com
3. Include detailed steps to reproduce
4. Allow 48-72 hours for initial response

We take security seriously and will respond promptly to all reports.

---

## 📜 License

This security documentation is part of minder-data-provider and follows the same license terms.


## Secret-Key Safety (v2.2)

### The threat

Anything you put in your client-side config is shipped in the browser bundle. A `apiSecret`, a Stripe `sk_live_...`, an AWS access key, or a PEM private key placed in `configureMinder({ ... })` becomes readable by anyone who opens DevTools or downloads your JS. Once a real secret reaches the client, it is compromised — bundlers cannot "hide" it, and minification does not help.

The rule that prevents this:

> **Never place a raw secret in client config.** Publishable keys and base URLs are fine; real secrets must live on the server.

### The solution: `secret()` vs `env()`

Two helpers make the safe/unsafe distinction explicit and enforceable.

- **`env(name, fallback = '')`** — returns a plain string for **non-secret** values: publishable keys (Stripe `pk_`, Sentry DSN), base URLs, public feature flags. Safe to inline into the client bundle.
- **`secret(name, value?)`** — returns a `SecretRef` for **real secrets**. On the **server** the value resolves from `process.env[name]` (or the explicit `value`); on the **client** the `SecretRef` carries **no value** — only the name marker. It is a reference, not the secret itself.

```ts
import { env, secret } from 'minder-data-provider/server';

// Non-secret — safe in client config:
const apiUrl    = env('NEXT_PUBLIC_API_URL', 'https://api.example.com');
const stripePub = env('NEXT_PUBLIC_STRIPE_PK'); // pk_live_... is publishable

// Real secret — a reference, never the value on the client:
const stripeSecret = secret('STRIPE_SECRET_KEY'); // resolves to sk_live_... on the server only
```

### `SecretRef` is non-stringifiable

A `SecretRef` cannot leak by accident. Its `toString()` and `toJSON()` both return `'[SECRET:NAME]'`, so it never serializes its value into a bundle, a log line, or a JSON payload.

```ts
const ref = secret('STRIPE_SECRET_KEY');
String(ref);              // '[SECRET:STRIPE_SECRET_KEY]'
JSON.stringify({ ref });  // '{"ref":"[SECRET:STRIPE_SECRET_KEY]"}'

ref.hasValue();           // true on the server, false on the client
ref.reveal();             // server only — returns the value; throws if there is none
```

Helpers for logging and auditing: `isSecretRef(x)`, `redactSecrets(obj)` (masks `SecretRef`s and secret-shaped strings before you log), and `findExposedSecrets(config)` (returns `{ path, reason }[]`).

### The guard: `assertNoExposedSecrets`

`configureMinder(config)` calls `assertNoExposedSecrets(config)` automatically. In the **browser**, if a raw secret-shaped value is found anywhere in your config, it **throws** a `MinderConfigError` with code `'CONFIG_EXPOSED_SECRET'` — failing loudly at startup instead of silently shipping the secret. `SecretRef` values are never flagged, because they carry no value on the client.

### What the detector flags

`findExposedSecrets` / `assertNoExposedSecrets` flag known secret shapes:

- Stripe secret/restricted keys — `sk_live`, `sk_test`, `rk_`
- AWS access key IDs — `AKIA...`
- PEM private keys (`-----BEGIN ... PRIVATE KEY-----`)
- GitHub tokens — `ghp_`, `github_pat_`
- Slack tokens — `xox*`
- SendGrid keys — `SG.*`
- Any string ≥ 8 chars under a suspicious key name: `secret`, `password`, `privateKey`, `clientSecret`, `apiSecret`

`SecretRef` values are **never** flagged — that is the entire point of wrapping them.

### DO / DON'T: Stripe

**DON'T** — secret key inlined in client config (throws in the browser):

```ts
// 🚫 ships sk_live_... to every visitor; throws MinderConfigError in the browser
configureMinder({
  apiUrl: 'https://api.example.com',
  stripe: { secretKey: 'sk_live_51Hxxxxxxxxxxxxxxxx' },
});
```

**DO** — publishable key via `env()` on the client; secret key via `secret()` + a server route:

```ts
import { configureMinder, env } from 'minder-data-provider';

// Client config — only publishable values:
configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),
  routes: {
    createPaymentIntent: { path: '/payments/intent', method: 'POST' },
  },
  // Stripe publishable key (pk_) is safe to expose:
  // pass it to your Stripe.js loader, e.g. loadStripe(env('NEXT_PUBLIC_STRIPE_PK'))
});
```

The secret key never appears in client code. It is resolved on the server, where the actual Stripe call happens.

### Server-side resolution: Next.js route + `resolveSecret`

On the server, resolve the secret from its `SecretRef` (or name) with `resolveSecret`, imported from the server-only entry point. Importing `minder-data-provider/server` in the browser throws, so this code can never accidentally run client-side.

```ts
// app/api/payments/intent/route.ts  (Next.js App Router — server only)
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { resolveSecret, secret } from 'minder-data-provider/server';

// Resolves from process.env.STRIPE_SECRET_KEY on the server; throws in the browser or if missing.
const stripe = new Stripe(resolveSecret(secret('STRIPE_SECRET_KEY')));

export async function POST(req: Request) {
  const { amount, currency = 'usd' } = await req.json();

  const intent = await stripe.paymentIntents.create({ amount, currency });

  return NextResponse.json({ clientSecret: intent.client_secret });
}
```

Your client calls this route through Minder — never touching the secret:

```ts
const { data } = await minder('createPaymentIntent', { amount: 1999 });
// data.clientSecret is safe to hand to Stripe.js in the browser
```

### Summary

| Value | Helper | Lives in client bundle? |
| --- | --- | --- |
| Base URL, publishable `pk_`, Sentry DSN | `env()` | Yes — safe |
| Stripe `sk_`, AWS key, DB password, PEM key | `secret()` + server route | No — server only |

Publishable keys and base URLs use `env()`. Real secrets use `secret()` plus a server route and `resolveSecret`. The `assertNoExposedSecrets` guard is your safety net — but the discipline is the same one line: **never put a raw secret in client config.**
