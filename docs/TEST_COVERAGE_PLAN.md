# Test Coverage Improvement Plan

## Current Status
- **Overall Coverage**: 34.94% (Target: 70%)
- **Tests Passing**: 443/443 ✓
- **Gaps**: Components, hooks, platform adapters, utilities

## Priority 1: Components & Hooks (Quick Wins)

### 1. MinderErrorBoundary.tsx (0% → 90%)
**Estimated Time**: 2-3 hours

```typescript
// tests/components/error-boundary.test.tsx
describe('MinderErrorBoundary', () => {
  // Basic functionality
  - Should render children when no error
  - Should catch and display errors
  - Should call onError callback
  - Should reset on Try Again click
  - Should reset when resetKeys change
  
  // Accessibility
  - Should have role="alert"
  - Should have aria-live="assertive"
  - Should support keyboard navigation
  - Should auto-focus on error
  - Should have aria-describedby
  
  // Custom fallbacks
  - Should render custom fallback element
  - Should render custom fallback function
});
```

### 2. DevTools Component (0% → 85%)
**Estimated Time**: 3-4 hours

```typescript
// tests/components/devtools.test.tsx
describe('DevTools', () => {
  // Rendering
  - Should render toggle button when closed
  - Should render panel when open
  - Should respect enabled config
  - Should respect position config
  
  // Tabs
  - Should switch between tabs
  - Should show correct content per tab
  - Should display counts in tab labels
  
  // Accessibility
  - Should have proper ARIA roles
  - Should support keyboard navigation
  - Should announce updates to screen readers
  
  // Network Tab
  - Should display network requests
  - Should clear requests
  - Should show request details
  
  // Cache Tab
  - Should display cache entries
  - Should clear cache
  
  // Performance Tab
  - Should display metrics
  - Should update metrics
  - Should show slowest requests
});
```

### 3. Hooks (14.67% → 80%)
**Estimated Time**: 2-3 hours

```typescript
// tests/hooks/use-configuration.test.tsx
- Should return config manager
- Should track performance metrics
- Should track security metrics
- Should handle config updates
- Should optimize configuration

// tests/hooks/use-environment.test.tsx
- Should return environment methods
- Should switch environments
- Should detect production/development
- Should handle missing environmentManager
```

## Priority 2: Platform Adapters (30-40% → 70%)

### 4. Storage Adapters (32.18% → 70%)
**Estimated Time**: 4-5 hours

```typescript
// tests/platform/storage/electron-storage.test.ts
- Should initialize Electron storage
- Should store and retrieve data
- Should handle encryption
- Should clear storage
- Should handle errors

// tests/platform/storage/expo-storage.test.ts
- Should use SecureStore
- Should fallback to AsyncStorage
- Should handle async operations

// tests/platform/storage/native-storage.test.ts
- Should use AsyncStorage
- Should handle React Native environment
- Should batch operations
```

### 5. Upload Adapters (43.71% → 70%)
**Estimated Time**: 4-5 hours

```typescript
// tests/platform/upload/expo-upload.test.ts
- Should upload using DocumentPicker
- Should upload using ImagePicker
- Should handle progress
- Should handle cancellation

// tests/platform/upload/native-upload.test.ts
- Should upload files from React Native
- Should handle multiple files
- Should track progress
```

## Priority 3: Utilities & Error Handling (30-50% → 70%)

### 6. Error Classes (55.86% → 80%)
**Estimated Time**: 2-3 hours

```typescript
// tests/errors/minder-error.test.ts
- MinderError: Basic error creation
- MinderError: Adding suggestions
- MinderError: toJSON serialization
- MinderError: toString formatting
- MinderConfigError: Config-specific errors
- MinderNetworkError: HTTP status suggestions
- MinderAuthError: Auth-specific suggestions
- MinderValidationError: Validation errors
```

### 7. Security Utilities (8% → 60%)
**Estimated Time**: 3-4 hours

```typescript
// tests/utils/security.test.ts
- Should validate tokens
- Should sanitize inputs
- Should detect XSS attempts
- Should validate URLs
- Should hash sensitive data
- Should generate secure random values
```

### 8. Complexity Analyzer (0% → 70%)
**Estimated Time**: 2-3 hours

```typescript
// tests/utils/complexity-analyzer.test.ts
- Should analyze query complexity
- Should calculate depth
- Should count fields
- Should detect circular references
- Should suggest optimizations
```

## Priority 4: Platform-Specific Features

### 9. Platform Entry Files (0% → 60%)
**Estimated Time**: 2-3 hours

```typescript
// tests/platforms/exports.test.ts
- Web: Should export web-compatible features
- Next.js: Should export SSR utilities
- Native: Should export React Native adapters
- Expo: Should export Expo-specific features
- Electron: Should export desktop features
- Node: Should export server-only features
```

### 10. Security Managers (54.26% → 70%)
**Estimated Time**: 3-4 hours

```typescript
// tests/platform/security/native-security.test.ts
- Should initialize secure storage
- Should encrypt tokens
- Should handle biometric auth
- Should detect jailbreak/root

// tests/platform/security/electron-security.test.ts
- Should use safe-storage
- Should handle main/renderer process
- Should validate certificates
```

## Testing Strategy

### Phase 1: Quick Wins (8-10 hours)
1. Components (ErrorBoundary, DevTools)
2. Hooks (useConfiguration, useEnvironment)
3. Platform entry files

**Result**: ~15% coverage increase → 50%

### Phase 2: Platform Adapters (8-10 hours)
1. Storage adapters (Electron, Expo, Native)
2. Upload adapters (Expo, Native)
3. Security managers

**Result**: ~10% coverage increase → 60%

### Phase 3: Utilities & Edge Cases (8-10 hours)
1. Error classes (all variants)
2. Security utilities
3. Complexity analyzer
4. Version validator
5. Edge cases and error paths

**Result**: ~10% coverage increase → 70%+

## Total Estimated Time: 24-30 hours

## Best Practices for New Tests

1. **Arrange-Act-Assert Pattern**
```typescript
it('should do something', () => {
  // Arrange: Set up test data
  const input = 'test';
  
  // Act: Execute the function
  const result = myFunction(input);
  
  // Assert: Verify the result
  expect(result).toBe('expected');
});
```

2. **Mock External Dependencies**
```typescript
jest.mock('@react-native-async-storage/async-storage');
```

3. **Test Edge Cases**
```typescript
- Empty inputs
- Null/undefined values
- Very large inputs
- Invalid formats
- Network failures
- Timeout scenarios
```

4. **Test Accessibility**
```typescript
- ARIA attributes
- Keyboard navigation
- Screen reader compatibility
- Focus management
```

5. **Test Error Paths**
```typescript
- Should throw on invalid input
- Should handle network errors
- Should recover from failures
- Should provide helpful error messages
```

## Immediate Next Steps

If you want to improve coverage now, start with:

1. **ErrorBoundary tests** (2-3 hours, high value)
2. **DevTools tests** (3-4 hours, validates accessibility work)
3. **Hook tests** (2-3 hours, tests user-facing API)

These three alone would add ~8-10% coverage and validate your recent accessibility improvements!

## Running Coverage Reports

```bash
# Full coverage report
npm test -- --coverage

# Coverage for specific file
npm test -- --coverage --collectCoverageFrom='src/components/**'

# Coverage with HTML report
npm test -- --coverage --coverageReporters=html
open coverage/lcov-report/index.html
```

## Coverage Goals by Module

| Module | Current | Target | Priority |
|--------|---------|--------|----------|
| Components | 0% | 85% | 🔴 High |
| Hooks | 14.67% | 80% | 🔴 High |
| Storage Adapters | 32.18% | 70% | 🟡 Medium |
| Upload Adapters | 43.71% | 70% | 🟡 Medium |
| Error Classes | 55.86% | 80% | 🟡 Medium |
| Security Utils | 8% | 60% | 🟡 Medium |
| Platform Entry | 0% | 60% | 🟢 Low |
| Complexity Analyzer | 0% | 70% | 🟢 Low |

---

**Conclusion**: Yes, the package needs significantly more tests, especially for components, hooks, and platform adapters. The estimated 24-30 hours is realistic to reach 70% coverage with quality tests.
