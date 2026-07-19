# Contributing to Minder Data Provider

First off, thank you for considering contributing to Minder Data Provider! It's people like you that make this tool such a great resource for the React community.

This document provides a comprehensive guide to help you get started. We believe in **robust engineering**, **strict type safety**, and **developer confidence**.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Project Architecture](#project-architecture)
- [Development Workflow](#development-workflow)
  - [Branching Strategy](#branching-strategy)
  - [Commit Convention](#commit-convention)
- [Quality Assurance (The Confidence Protocol)](#quality-assurance-the-confidence-protocol)
  - [Running Tests](#running-tests)
  - [Verify Build](#verify-build)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Documentation](#documentation)
- [Community](#community)

---

## 🤝 Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for all. Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **Package Manager**: npm (v9+) or yarn (v1.22+)
- **Git**: v2.0.0+

### Installation

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/minder-data-provider.git
   cd minder-data-provider
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Verify setup**:
   ```bash
   npm run build
   ```

---

## 🏗️ Project Architecture

Understanding the structure is key to contributing effectively.

```
src/
├── auth/           # Authentication Manager (JWT, Storage, Refresh)
├── cache/          # Cache Manager (TanStack Query)
├── config/         # Global Configuration logic
├── core/           # Core logic (ApiClient, MinderDataProvider)
├── crud/           # CRUD operation helpers
├── debug/          # Debug tools and loggers
├── hooks/          # Public React Hooks (useMinder, useAuth, etc.)
├── platforms/      # Platform-specific adapters (Web, Native, Electron)
├── ssr/            # Server-Side Rendering helpers
├── utils/          # Shared utilities (Logger, Security, Validation)
└── index.ts        # Main entry point
```

### Key Concepts
- **TanStack Query core**: Server state (data fetching, caching, dedup) is built on TanStack Query. Auth/UI state is managed by MDP's own managers — MDP ships no Redux/global-store dependency.
- **Platform Agnostic**: Core logic is separated from platform-specific code (handled by `PlatformDetector`).
- **Manager Pattern**: Features are encapsulated in Managers (`AuthManager`, `CacheManager`, `ProxyManager`) to keep `useMinder` clean.

---

## 💻 Development Workflow

### Branching Strategy

We follow a strict naming convention for branches:

- `feat/description`: New features (e.g., `feat/add-graphql-support`)
- `fix/description`: Bug fixes (e.g., `fix/token-refresh-loop`)
- `docs/description`: Documentation changes (e.g., `docs/update-wiki`)
- `refactor/description`: Code restructuring without behavior change
- `test/description`: Adding or updating tests

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/).

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

**Example:**
```
feat(auth): implement auto-refresh for expired tokens
```

---

## 🛡️ Quality Assurance (The Confidence Protocol)

We maintain a high bar for quality. Every PR must pass our **Confidence Protocol**.

### Running Tests

We use **Jest** for testing.

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/useMinder.test.ts

# Run with coverage
npm run test:coverage
```

### Verify Build

Before submitting a PR, you **MUST** run the verification script. This script performs a "smoke test" on the built artifacts to ensure they are valid and usable.

```bash
# Runs build, type checks, and verifies exports
node scripts/verify-build.js
```

**If this script fails, your PR will be rejected.**

---

## 📏 Coding Standards

### TypeScript
- **Strict Mode**: `strict: true` is enabled. No implicit `any`.
- **Interfaces**: Use `interface` for public APIs, `type` for unions/intersections.
- **Enums**: Use `const enum` where possible to reduce bundle size.

### React
- **Hooks**: Custom hooks must start with `use`.
- **Functional Components**: Use functional components with hooks. Avoid class components.

### Style
- We use **ESLint** for code quality and formatting.
- Run `npm run lint` before committing to automatically fix issues.

---

## 🔀 Pull Request Process

1. **Sync your fork**: Ensure your branch is up to date with `main`.
2. **Run the Confidence Protocol**:
   - `npm test` (All tests must pass)
   - `node scripts/verify-build.js` (Build must be valid)
3. **Create Pull Request**:
   - Use the provided PR template.
   - Link related issues (e.g., `Closes #123`).
   - Add a clear description of changes.
   - Attach screenshots/videos for UI changes.

---

## 📚 Documentation

- **Code Comments**: Public APIs must have JSDoc comments (`/** ... */`).
- **Wiki**: If you add a major feature, please update the [GitHub Wiki](https://github.com/patelkeyur7279/minder-data-provider/wiki).
- **README**: Update `README.md` only for high-level changes.

---

## 💬 Community

- **Discord**: Join our [Discord Server](https://discord.gg/dN3eFFjmfy)
- **Discussions**: Use [GitHub Discussions](https://github.com/patelkeyur7279/minder-data-provider/discussions) for questions.
- **Issues**: Use [GitHub Issues](https://github.com/patelkeyur7279/minder-data-provider/issues) for bugs.

Thank you for contributing! 🚀
