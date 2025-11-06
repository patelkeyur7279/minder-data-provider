# 🛡️ Automatic Version Conflict Prevention

This package includes **automatic safeguards** to prevent React version conflicts that could cause runtime errors.

## 🎯 The Problem We Solve

When using `minder-data-provider` in your project, version conflicts can occur if:

1. **Multiple React Copies**: Your project and this package both install React
2. **Version Mismatch**: React and ReactDOM have different versions
3. **Monorepo Issues**: Parent and child packages have different React versions

These issues cause errors like:
```
❌ Invalid hook call
❌ Cannot read properties of null (reading 'useContext')
❌ _reactdom.default.preload is not a function
```

## ✅ Our Multi-Layer Protection

### Layer 1: Strict Peer Dependencies

We declare React as a **peer dependency** (not a regular dependency):

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

**What this means:**
- ✅ We use YOUR React version (no conflicts)
- ✅ Works with React 18.x and 19.x
- ✅ Single React instance in your app

### Layer 2: Post-Install Checks

When you install `minder-data-provider`, we automatically:

```bash
✓ Checking React versions...
✓ Main package React: 19.2.0
✓ demo React: 19.2.0
✅ All version checks passed!
```

**If issues are found:**
```bash
❌ Issues found:
  • Multiple React versions detected!
    - main: 18.3.0
    - demo: 19.2.0

💡 Suggested fixes:
  1. Run: npm run fix-versions
  2. Or manually remove React from main node_modules
```

### Layer 3: Runtime Validation (Development Only)

In development mode, we check for conflicts when you import the package:

```javascript
import { minder } from 'minder-data-provider';
// ⚠️ Multiple React versions detected!
// Detected versions: ["18.2.0", "19.0.0"]
// 🔧 To fix this issue:
// 1. Check your package.json...
```

### Layer 4: Auto-Fix Script

One command to fix all issues:

```bash
npm run fix-versions
```

This automatically:
- ✅ Removes React from wrong locations
- ✅ Detects monorepo structure
- ✅ Suggests next steps
- ✅ Validates configuration

## 🚀 Quick Start (Zero Config)

### For Regular Projects

Just install normally:

```bash
npm install minder-data-provider
# Automatic checks run after install ✓
```

If you see warnings, run:

```bash
npm run fix-versions
npm install
```

### For Monorepo/Workspace Projects

1. **Install in your workspace:**

```bash
cd my-app
npm install minder-data-provider react react-dom
```

2. **Parent package.json should have:**

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

**NOT:**
```json
{
  "dependencies": {
    "react": "^19.0.0"  // ❌ Don't do this in libraries!
  }
}
```

3. **If using npm workspaces, add to root package.json:**

```json
{
  "workspaces": ["packages/*", "apps/*"],
  "overrides": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

### For Next.js Projects

#### Next.js 14.x

```json
{
  "dependencies": {
    "next": "^14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "minder-data-provider": "^2.0.0"
  }
}
```

#### Next.js 15+ (Recommended)

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "minder-data-provider": "^2.0.0"
  }
}
```

**Next.js 16+ uses Turbopack** which handles module resolution better.

## 🔧 Manual Troubleshooting

### Check for Multiple React Instances

```bash
npm ls react react-dom
```

You should see:
```
├─┬ minder-data-provider@2.0.0
│ └── react@19.0.0 deduped  ✅ Good!
└── react@19.0.0
```

**NOT:**
```
├─┬ minder-data-provider@2.0.0
│ └── react@18.3.0  ❌ Bad! (different version)
└── react@19.0.0
```

### Fix Multiple Versions

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Or use our auto-fixer
npm run fix-versions
```

### Monorepo - Remove Parent React

```bash
# In monorepo root
rm -rf node_modules/react node_modules/react-dom
cd packages/my-app
npm install
```

## 📋 Compatibility Matrix

| Next.js | React | ReactDOM | Status |
|---------|-------|----------|--------|
| 14.2.0-14.2.2 | 18.3.x | 18.3.x | ⚠️ Known bugs |
| 14.2.3+ | 18.3.x | 18.3.x | ✅ Stable |
| 15.x | 19.0.0 RC | 19.0.0 RC | ✅ Stable |
| 16.x | 19.0.0+ | 19.0.0+ | ✅ Recommended |

## 🎓 Best Practices

### ✅ DO

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0"
  }
}
```

### ❌ DON'T

```json
{
  "dependencies": {
    "react": "^19.0.0"  // ❌ For libraries
  },
  "devDependencies": {
    "react": "^18.0.0"  // ❌ Can cause conflicts
  }
}
```

## 🐛 Still Having Issues?

1. **Run diagnostics:**
   ```bash
   npm run check-versions
   ```

2. **Check for hoisting issues (Yarn/pnpm):**
   ```bash
   # Add to .yarnrc.yml
   nodeLinker: node-modules
   
   # Or use npm instead
   npm install
   ```

3. **Clear all caches:**
   ```bash
   rm -rf node_modules .next
   npm cache clean --force
   npm install
   ```

4. **Report an issue:**
   - Run: `npm run check-versions > version-check.txt`
   - Include the output in your issue
   - https://github.com/minder-data-provider/issues

## 🔍 How It Works

### Installation Flow

```
npm install minder-data-provider
    ↓
postinstall hook runs
    ↓
check-peer-deps.js executes
    ↓
✅ Checks passed → Continue
❌ Issues found → Show warnings + fix suggestions
    ↓
Your app runs
    ↓
Development mode → Runtime validation
    ↓
✅ All good! OR ⚠️ Console warnings
```

### What Gets Checked

1. ✅ React version in main package
2. ✅ React version in all workspaces
3. ✅ React vs ReactDOM match
4. ✅ Peer dependency compatibility
5. ✅ Multiple instance detection
6. ✅ Runtime validation (dev only)

## 📚 Resources

- [NPM Peer Dependencies](https://docs.npmjs.com/cli/v8/configuring-npm/package-json#peerdependencies)
- [React Version Policy](https://react.dev/blog/2023/03/16/introducing-react-dev#versioning-policy)
- [Monorepo Best Practices](https://monorepo.tools/)
- [Next.js + React 19](https://nextjs.org/blog/next-16)

## 💪 Summary

With minder-data-provider, you get:

- ✅ **Zero-config** version management
- ✅ **Automatic** conflict detection
- ✅ **One-command** fixes
- ✅ **Runtime** validation in development
- ✅ **Clear** error messages and solutions
- ✅ **Monorepo** ready

**Just install and it works!** 🎉
