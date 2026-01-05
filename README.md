<div align="center">

# Minder Data Provider
### The Ultimate Hybrid Data Management Solution

[![npm version](https://img.shields.io/npm/v/minder-data-provider.svg?style=flat-square)](https://www.npmjs.com/package/minder-data-provider)
[![npm downloads](https://img.shields.io/npm/dm/minder-data-provider.svg?style=flat-square)](https://www.npmjs.com/package/minder-data-provider)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/minder-data-provider?style=flat-square)](https://bundlephobia.com/package/minder-data-provider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg?style=flat-square)](http://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-1516%20Passing-success?style=flat-square)](./tests)

<br>

**One Hook. Everything Included. Works Everywhere.**

Combines the global state management of **Redux** with the server state power of **TanStack Query**.  
Built for **React**, **Next.js**, **React Native**, and **Electron**.

<br>

[**📚 Read the Full Documentation (Wiki)**](https://github.com/patelkeyur7279/minder-data-provider/wiki)

<br>

</div>

---

## ✨ Features at a Glance

| Feature | Description |
| ------- | ----------- |
| 🔐 **Authentication** | Built-in JWT management, auto-refresh, and persistence. |
| 🚀 **Smart Caching** | Multi-level caching with automatic invalidation and deduplication. |
| 📡 **Real-Time** | WebSocket support for live data updates and subscriptions. |
| 💾 **Offline First** | Queue mutations while offline and auto-replay when online. |
| 🔄 **CRUD Ops** | Create, Read, Update, Delete in a single, intuitive hook. |
| 📁 **File Upload** | Native support for file uploads with progress tracking. |
| ⚡ **Performance** | Optimized for speed with request deduplication and lazy loading. |
| 🛡️ **Security** | Strict CSP support, log sanitization, and secure defaults. |
| 🌐 **Proxy Support** | Built-in proxy manager to handle CORS issues seamlessly. |
| 📄 **Pagination** | Infinite scroll and cursor-based pagination out of the box. |

<br>

## 🚀 Quick Start

### 1. Install

```bash
npm install minder-data-provider
```

### 2. Configure (Once)

```typescript
// src/config.ts
import { configureMinder, HttpMethod } from "minder-data-provider";

export const config = configureMinder({
  apiUrl: "https://api.example.com",
  routes: {
    users: { url: "/users", method: HttpMethod.GET },
    createUser: { url: "/users", method: HttpMethod.POST },
  },
});
```

### 3. Use Anywhere

```tsx
import { useMinder } from "minder-data-provider";

function UserList() {
  const { data, loading, error } = useMinder("users");

  if (loading) return <Spinner />;
  if (error) return <Error>{error.message}</Error>;

  return (
    <ul>
      {data.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  );
}
```

<br>

## 📖 Documentation & Guide

We have moved our comprehensive documentation to the **GitHub Wiki** for better organization and readability.

- **[🏠 Home](https://github.com/patelkeyur7279/minder-data-provider/wiki)**
- **[🚀 Getting Started](https://github.com/patelkeyur7279/minder-data-provider/wiki/Getting-Started)**
- **[⚙️ Configuration](https://github.com/patelkeyur7279/minder-data-provider/wiki/Configuration-Guide)**
- **[📘 Usage Guide](https://github.com/patelkeyur7279/minder-data-provider/wiki/Usage-Guide)**
- **[📚 API Reference](https://github.com/patelkeyur7279/minder-data-provider/wiki/API-Reference)**
- **[🌍 Platform Guide](https://github.com/patelkeyur7279/minder-data-provider/wiki/Platform-Guide)**
- **[🔥 Advanced Features](https://github.com/patelkeyur7279/minder-data-provider/wiki/Advanced-Features)**

<br>

## 🛠️ Platform Support

| Platform | Status |
| :--- | :--- |
| **React (Web)** | ✅ Production Ready |
| **Next.js (App/Pages)** | ✅ Production Ready |
| **React Native / Expo** | ✅ Production Ready |
| **Electron** | ✅ Production Ready |
| **Node.js** | ✅ Production Ready |

<br>

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

<br>

<div align="center">

**Built with ❤️ for the React Community**

[Report Bug](https://github.com/patelkeyur7279/minder-data-provider/issues) · [Request Feature](https://github.com/patelkeyur7279/minder-data-provider/issues)

</div>
