# Changelog

All notable changes to Minder Data Provider will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-11-04

### 🎉 Major Release

Complete rewrite with focus on performance, developer experience, and bundle size optimization.

### ✨ Added

#### Core Features
- **Modular Architecture**: Tree-shakeable imports reduce bundle size by up to 87%
- **Simplified Configuration**: One-line setup with `createMinderConfig()`
- **Auto-Generated CRUD**: Define routes once, get full CRUD automatically
- **Advanced Debug Tools**: Comprehensive debugging with performance monitoring
- **Flexible SSR/CSR**: Choose rendering strategy per component

#### Performance Optimizations
- Request deduplication to prevent duplicate API calls
- Request batching to reduce network overhead by ~50%
- Performance monitoring with real-time metrics
- React performance hooks (`useDebounce`, `useThrottle`, `useLazyLoad`)
- Memory leak prevention utilities
- Bundle size analysis tools

#### Security Features
- XSS protection with DOMPurify integration
- CSRF protection using Web Crypto API
- Rate limiting with sliding window algorithm
- Input validation and sanitization utilities
- Security headers configuration

#### Testing Infrastructure
- Comprehensive test suite with 69+ passing tests
- Infrastructure tests (5 tests)
- Hook tests (8 tests)
- Security tests (38 tests)
- Performance tests (19 tests)
- Jest + React Testing Library setup

#### Documentation
- Complete API Reference (800+ lines)
- Migration Guide from v1.x
- Real-world Examples collection
- Performance optimization guide
- Security best practices

### 🔄 Changed

#### Breaking Changes
- `apiBaseUrl` → `apiUrl` in configuration
- Import paths support modular structure:
  - `minder-data-provider/crud` for CRUD operations
  - `minder-data-provider/auth` for authentication
  - `minder-data-provider/cache` for caching
  - etc.
- Route configuration simplified - auto-generates CRUD operations
- Feature configuration accepts boolean for auto-configuration

#### Improvements
- TypeScript strict mode enabled
- Better type inference throughout
- Improved error messages
- Enhanced cache invalidation strategies
- Optimized network request handling

### 🐛 Fixed
- Memory leaks in WebSocket connections
- Race conditions in concurrent requests
- Cache invalidation edge cases
- TypeScript type compatibility issues
- Bundle size bloat from unused code

### 📦 Bundle Size
- Full bundle: ~150KB (unchanged for backward compatibility)
- CRUD only: ~45KB (70% smaller)
- Auth only: ~25KB (83% smaller)
- Cache only: ~20KB (87% smaller)

### 🔧 Dependencies
- Added: `dompurify` for XSS protection
- Updated: TypeScript to 5.4.3
- Updated: Jest to 29.7.0
- Updated: React Testing Library to 14.0.0

---

## [1.0.0] - 2024-01-15

### Initial Release

- Basic CRUD operations
- TanStack Query + Redux integration
- Authentication support
- WebSocket integration
- File upload support
- Basic caching
- TypeScript support

---

## Migration Guides

### From v1.x to v2.0

See the complete [Migration Guide](./docs/MIGRATION_GUIDE.md) for detailed instructions.

**Quick Migration:**

1. Update package: `npm install minder-data-provider@latest`
2. Update configuration:
   ```typescript
   // Old
   { apiBaseUrl: '...' }
   
   // New
   createMinderConfig({ apiUrl: '...' })
   ```
3. Update imports for smaller bundles:
   ```typescript
   // Old
   import { useOneTouchCrud } from 'minder-data-provider';
   
   // New
   import { useOneTouchCrud } from 'minder-data-provider/crud';
   ```

---

## Deprecation Warnings

### v2.0
- `apiBaseUrl` is deprecated, use `apiUrl` instead (will be removed in v3.0)
- Unified imports are discouraged, use modular imports for better performance

---

## Upcoming Features

### v2.1 (Planned)
- [ ] GraphQL support
- [ ] Offline-first capabilities
- [ ] Advanced query builder
- [ ] Built-in pagination hooks
- [ ] Request cancellation UI helpers

### v2.2 (Planned)
- [ ] React Native support
- [ ] DevTools extension
- [ ] Plugin system
- [ ] Custom middleware support
- [ ] Advanced analytics integration

### v3.0 (Future)
- [ ] Complete API redesign
- [ ] Drop legacy support
- [ ] Framework-agnostic core
- [ ] Native TypeScript rewrite
- [ ] Zero-config setup

---

## Support & Contributing

- Report bugs: [GitHub Issues](https://github.com/minder-data-provider/issues)
- Feature requests: [GitHub Discussions](https://github.com/minder-data-provider/discussions)
- Contributing: See [CONTRIBUTING.md](./CONTRIBUTING.md)
- Security: See [SECURITY.md](./SECURITY.md)

---

## License

[MIT](./LICENSE) © Minder Data Provider Contributors
