# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.2.x   | :white_check_mark: |
| 2.1.x   | :white_check_mark: |
| 2.0.x   | :white_check_mark: |
| 1.x     | :x:                |

## Reporting a Vulnerability

We take security issues seriously. If you discover a security vulnerability, please report it privately via **GitHub Security Advisories** at:

**https://github.com/patelkeyur7279/minder-data-provider/security/advisories/new**

**Do NOT open public issues** for security vulnerabilities. We will acknowledge your report and provide an initial response within 7 days.

## Supply-chain integrity

- **npm provenance.** Releases are published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements) (`npm publish --provenance`, backed by the workflow's `id-token: write` permission), so the published tarball is cryptographically linked to the exact GitHub Actions build that produced it. Consumers can verify it on the package's npm page or with `npm audit signatures`.
- **Maintainer 2FA.** Publishing requires npm two-factor authentication on the maintainer account.
- **No bundled provider SDKs or secrets.** Provider SDKs are optional peer dependencies loaded on demand; no provider code or credentials are vendored (see `docs/product/PROVIDER_COMPLIANCE.md`).

---

# 🔒 Security Features Guide

## Overview

`minder-data-provider` includes comprehensive security features to protect your application from common web vulnerabilities including XSS, CSRF, rate limiting attacks, and more.

## Features

### 1. CSRF Protection ✅

**What it protects against:** Cross-Site Request Forgery attacks where malicious sites trick users into making unwanted requests.

**How to enable:**

```typescript
import { configureMinder } from 'minder-data-provider';

configureMinder({
  baseURL: 'https://api.example.com',
  security: {
    csrfProtection: {
      enabled: true,
      tokenLength: 32,          // Optional: default 32
      headerName: 'X-CSRF-Token', // Optional: default 'X-CSRF-Token'
      cookieName: 'csrf_token',   // Optional: for cookie storage
    }
  }
});
```

**Features:**
- ✅ Cryptographically secure token generation (Web Crypto API)
- ✅ Automatic token rotation
- ✅ SessionStorage and Cookie support
- ✅ Automatic header injection on all requests

---

### 2. XSS Sanitization ✅

**What it protects against:** Cross-Site Scripting attacks where malicious scripts are injected into your application.

**How to enable:**

```typescript
configureMinder({
  security: {
    sanitization: {
      enabled: true,
      allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p'],
      allowedAttributes: {
        'a': ['href', 'title']
      }
    }
  }
});
```

**Features:**
- ✅ DOMPurify integration (browser)
- ✅ Fallback regex sanitization (Node.js)
- ✅ Recursive object/array sanitization
- ✅ Configurable whitelist
- ✅ Automatic sanitization of all request data

---

### 3. Rate Limiting ✅

**What it protects against:** API abuse, DDoS attacks, and excessive requests from single sources.

**How to enable:**

```typescript
configureMinder({
  security: {
    rateLimiting: {
      requests: 100,        // Max requests
      window: 60000,        // Time window in ms (60 seconds)
      storage: 'localStorage' // or 'memory'
    }
  }
});
```

**Features:**
- ✅ Per-endpoint tracking
- ✅ Sliding window algorithm
- ✅ Memory or localStorage storage
- ✅ Automatic cleanup of old entries
- ✅ Customizable limits per route

---

### 4. Input Validation ✅

**Comprehensive validation utilities for user input.**

```typescript
import { InputValidator } from 'minder-data-provider';

// Email validation
InputValidator.isValidEmail('user@example.com'); // true

// URL validation
InputValidator.isValidURL('https://example.com'); // true

// Filename sanitization (prevents path traversal)
InputValidator.sanitizeFilename('../../../etc/passwd');
// Result: '.._.._.._.._etc_.._passwd'

// SQL injection detection
InputValidator.hasSQLInjectionPattern("' OR '1'='1"); // true
```

---

### 5. Security Headers ✅

**Automatic security headers for enhanced protection.**

**How to configure:**

```typescript
configureMinder({
  security: {
    headers: {
      contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'",
      xFrameOptions: 'DENY',              // or 'SAMEORIGIN'
      xContentTypeOptions: true,          // nosniff
      strictTransportSecurity: 'max-age=31536000; includeSubDomains'
    }
  }
});
```

**Default headers applied:**
- `Content-Security-Policy`: Controls resource loading
- `X-Frame-Options`: Prevents clickjacking
- `X-Content-Type-Options`: Prevents MIME sniffing
- `Strict-Transport-Security`: Forces HTTPS
- `X-XSS-Protection`: Browser XSS filter

---

## Security Best Practices

### 1. **Always use HTTPS in production**
```typescript
configureMinder({
  baseURL: 'https://api.example.com', // ✅ HTTPS
});
```

### 2. **Enable all security features**
```typescript
security: {
  csrfProtection: true,
  sanitization: true,
  rateLimiting: { requests: 100, window: 60000 },
  inputValidation: true
}
```

### 3. **Validate user input on both client and server**
Client-side validation is for UX; server-side validation is for security. Always do both.

---

## Performance Impact

- **CSRF tokens**: < 1ms per request
- **XSS sanitization**: ~5-10ms for complex objects
- **Rate limiting**: < 1ms check time
- **Security headers**: No runtime cost (applied once)

All security features are **optimized for production** with minimal overhead.
