# Enum Migration Guide

## Overview
This guide shows how to migrate from string literals to type-safe enums for all static values in the minder-data-provider codebase.

## Benefits
- ✅ **Type Safety**: Compile-time checks prevent typos
- ✅ **IDE Autocomplete**: Better developer experience
- ✅ **Refactoring**: Easy to rename values across entire codebase
- ✅ **Documentation**: Self-documenting code
- ✅ **Consistency**: Single source of truth

---

## Import Statement

```typescript
import {
  HttpMethod,
  LogLevel,
  Platform,
  StorageType,
  SecurityLevel,
  DEFAULT_VALUES,
  // ... other enums
} from 'minder-data-provider/constants';
```

---

## Migration Examples

### 1. HTTP Methods
**Before:**
```typescript
const method = 'GET';
fetch(url, { method: 'POST' });
```

**After:**
```typescript
import { HttpMethod } from 'minder-data-provider/constants';

const method = HttpMethod.GET;
fetch(url, { method: HttpMethod.POST });
```

---

### 2. Log Levels
**Before:**
```typescript
type LogLevel = 'error' | 'warn' | 'info' | 'debug';
config.logLevel = 'error';
```

**After:**
```typescript
import { LogLevel } from 'minder-data-provider/constants';

config.logLevel = LogLevel.ERROR;
```

---

### 3. Storage Types
**Before:**
```typescript
const storage: 'memory' | 'localStorage' = 'memory';
if (this.storage === 'localStorage') { /* ... */ }
```

**After:**
```typescript
import { StorageType } from 'minder-data-provider/constants';

const storage: StorageType = StorageType.MEMORY;
if (this.storage === StorageType.LOCAL_STORAGE) { /* ... */ }
```

---

### 4. Platform Detection
**Before:**
```typescript
type Platform = 'web' | 'nextjs' | 'react-native' | 'expo' | 'electron' | 'node';
const platform = 'web';
```

**After:**
```typescript
import { Platform } from 'minder-data-provider/constants';

const platform = Platform.WEB;
```

---

### 5. Security Levels
**Before:**
```typescript
level?: 'basic' | 'standard' | 'strict';
security: { level: 'basic' }
```

**After:**
```typescript
import { SecurityLevel } from 'minder-data-provider/constants';

security: { level: SecurityLevel.BASIC }
```

---

### 6. Data Size
**Before:**
```typescript
function calculateDataSizeEstimate(): 'small' | 'medium' | 'large' {
  if (routeCount <= 5) return 'small';
  if (routeCount <= 15) return 'medium';
  return 'large';
}
```

**After:**
```typescript
import { DataSize } from 'minder-data-provider/constants';

function calculateDataSizeEstimate(): DataSize {
  if (routeCount <= 5) return DataSize.SMALL;
  if (routeCount <= 15) return DataSize.MEDIUM;
  return DataSize.LARGE;
}
```

---

### 7. Config Presets
**Before:**
```typescript
type ConfigPreset = 'minimal' | 'standard' | 'advanced' | 'enterprise';
const preset = 'standard';
```

**After:**
```typescript
import { ConfigPreset } from 'minder-data-provider/constants';

const preset = ConfigPreset.STANDARD;
```

---

### 8. Cache Types
**Before:**
```typescript
type: 'memory' | 'persistent' | 'hybrid';
cacheRequirements: 'basic' | 'advanced';
```

**After:**
```typescript
import { CacheType, CacheRequirements } from 'minder-data-provider/constants';

type: CacheType.MEMORY;
cacheRequirements: CacheRequirements.BASIC;
```

---

### 9. Query Status
**Before:**
```typescript
status: 'idle' | 'loading' | 'success' | 'error';
if (status === 'loading') { /* ... */ }
```

**After:**
```typescript
import { QueryStatus } from 'minder-data-provider/constants';

status: QueryStatus;
if (status === QueryStatus.LOADING) { /* ... */ }
```

---

### 10. Notification Types
**Before:**
```typescript
type: 'success' | 'error' | 'warning' | 'info';
```

**After:**
```typescript
import { NotificationType } from 'minder-data-provider/constants';

type: NotificationType.SUCCESS;
```

---

## Using Constants

**Before:**
```typescript
const DEFAULT_PAGE_SIZE = 10;
const CACHE_TTL = 300000;
const REQUEST_TIMEOUT = 30000;
```

**After:**
```typescript
import { DEFAULT_VALUES } from 'minder-data-provider/constants';

const pageSize = DEFAULT_VALUES.PAGE_SIZE;
const cacheTtl = DEFAULT_VALUES.CACHE_TTL;
const timeout = DEFAULT_VALUES.REQUEST_TIMEOUT;
```

---

## HTTP Status Codes

**Before:**
```typescript
if (response.status === 200) { /* ... */ }
if (response.status === 401) { /* ... */ }
```

**After:**
```typescript
import { HTTP_STATUS } from 'minder-data-provider/constants';

if (response.status === HTTP_STATUS.OK) { /* ... */ }
if (response.status === HTTP_STATUS.UNAUTHORIZED) { /* ... */ }
```

---

## Type Guards

Use type guards to check if a value belongs to an enum:

```typescript
import { isPlatform, isLogLevel } from 'minder-data-provider/constants';

function checkPlatform(value: string) {
  if (isPlatform(value)) {
    // TypeScript knows value is Platform type here
    console.log('Valid platform:', value);
  }
}

function checkLogLevel(value: string) {
  if (isLogLevel(value)) {
    // TypeScript knows value is LogLevel type here
    console.log('Valid log level:', value);
  }
}
```

---

## Complete File Migration Example

**Before (src/utils/security.ts):**
```typescript
private storage: 'memory' | 'localStorage';

constructor(storage: 'memory' | 'localStorage' = 'memory') {
  this.storage = storage;
}

setToken(token: string) {
  if (this.storage === 'localStorage' && typeof localStorage !== 'undefined') {
    localStorage.setItem('auth_token', token);
  }
}
```

**After (src/utils/security.ts):**
```typescript
import { StorageType, STORAGE_KEYS } from 'minder-data-provider/constants';

private storage: StorageType;

constructor(storage: StorageType = StorageType.MEMORY) {
  this.storage = storage;
}

setToken(token: string) {
  if (this.storage === StorageType.LOCAL_STORAGE && typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  }
}
```

---

## Search & Replace Patterns

### Platform Types
```bash
Find:    'web'
Replace: Platform.WEB

Find:    'nextjs'
Replace: Platform.NEXT_JS

Find:    'electron'
Replace: Platform.ELECTRON
```

### Storage Types
```bash
Find:    'memory'
Replace: StorageType.MEMORY

Find:    'localStorage'
Replace: StorageType.LOCAL_STORAGE
```

### Log Levels
```bash
Find:    'error'
Replace: LogLevel.ERROR

Find:    'warn' (or 'warning')
Replace: LogLevel.WARN

Find:    'info'
Replace: LogLevel.INFO

Find:    'debug'
Replace: LogLevel.DEBUG
```

---

## Files to Migrate

### High Priority
1. `src/utils/security.ts` - Storage types
2. `src/platform/PlatformDetector.ts` - Platform enum
3. `src/utils/complexityAnalyzer.ts` - Data size, cache requirements
4. `src/core/types.ts` - Log level, notification type
5. `src/config/presets.ts` - Config preset
6. `src/core/SmartConfig.ts` - Security level, storage type

### Medium Priority
7. `src/platform/PlatformCapabilities.ts` - Storage type
8. `src/platform/adapters/storage/StorageAdapterFactory.ts` - Storage type
9. `src/core/LightConfig.ts` - Log level, storage type
10. All HTTP request methods

### Low Priority
11. Test files
12. Documentation examples

---

## Testing After Migration

### 1. Type Checking
```bash
npm run type-check
```

### 2. Build
```bash
npm run build
```

### 3. Unit Tests
```bash
npm test
```

### 4. Integration Tests
Check that all enum values work correctly in runtime.

---

## Common Pitfalls

### ❌ Don't compare with strings
```typescript
if (platform === 'web') { } // BAD
```

### ✅ Use enum values
```typescript
if (platform === Platform.WEB) { } // GOOD
```

### ❌ Don't use enum as type in function params
```typescript
function log(level: LogLevel.ERROR) { } // BAD - not a type
```

### ✅ Use enum type
```typescript
function log(level: LogLevel) { } // GOOD
```

---

## Summary

**Total Enums Created**: 22
- HttpMethod
- QueryStatus
- LogLevel
- StorageType
- CacheType
- CacheRequirements
- SecurityLevel
- Platform
- DataSize
- PrefetchStrategy
- ConfigPreset
- NotificationType
- Environment
- WebSocketState
- UploadState
- NetworkState
- CrudOperation
- AuthState
- TokenType
- RetryStrategy
- SortOrder
- PaginationType
- ErrorCode

**Total Constants**: 5
- DEFAULT_VALUES
- HTTP_STATUS
- MIME_TYPES
- STORAGE_KEYS
- EVENTS

**Location**: `src/constants/enums.ts`

**Usage**: Import from `'minder-data-provider/constants'`
