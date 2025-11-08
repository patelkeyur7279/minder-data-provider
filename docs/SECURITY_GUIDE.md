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

| Storage Type | Security | Persistence | Best For |
|-------------|----------|-------------|----------|
| `cookie` ⭐ | ✅ High (HttpOnly, Secure, SameSite) | ✅ Persistent | **Production apps** |
| `sessionStorage` | ⚠️ Medium (XSS vulnerable) | ⚠️ Tab session only | Development/testing |
| `memory` | ✅ High (in-memory only) | ❌ Page refresh clears | Temporary auth, high-security needs |

#### Configuration

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

**Cookie Security Settings (Automatic)**:
- `Secure`: Only sent over HTTPS
- `SameSite=Strict`: Prevents CSRF attacks
- `HttpOnly`: Not accessible via JavaScript (when set server-side)
- `path=/`: Available to entire app

---

## 🌐 HTTPS Enforcement

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
