# Local Package Testing Guide

This guide explains how to properly test the `minder-data-provider` package locally before publishing to npm.

## ⚠️ IMPORTANT: This is a LOCAL DEVELOPMENT Issue Only

**End users who install from npm will NOT experience any of these issues!**

This problem ONLY affects developers working on the package locally in a monorepo structure. When published to npm:
- ✅ Only `/dist` folder is included
- ✅ No TypeScript source files  
- ✅ No `.js` extension resolution issues
- ✅ Single React Context instance
- ✅ Everything works perfectly

## The Problem (Local Development Only)

When developing a package in a monorepo structure (like this one), using `npm install /path/to/package` creates issues:

## ✅ Correct Way: Using `npm pack`

This method creates a tarball **exactly like npm publish**, containing only the `/dist` folder.

### Step 1: Build and Pack the Package

```bash
# From the package root
cd /Users/patelkeyur7279/Desktop/ReactCourse/minder-data-provider

# Build the package
npm run build

# Create a tarball (exactly like npm publish would)
npm pack
```

This creates a file like `minder-data-provider-2.0.0.tgz`

### Step 2: Install in Demo

```bash
# From the demo directory
cd demo

# Install the local tarball
npm install ../minder-data-provider-2.0.0.tgz

# Start the dev server
npm run dev
```

### Step 3: After Making Changes

Whenever you modify the source code:

```bash
# 1. Rebuild
npm run build

# 2. Repack
npm pack

# 3. Reinstall in demo
cd demo
npm install ../minder-data-provider-2.0.0.tgz --force

# 4. Restart dev server
npm run dev
```

## Automated Script

For convenience, here's a script to automate the process:

```bash
#!/bin/bash
# File: test-local-package.sh

echo "🔨 Building package..."
npm run build

echo "📦 Creating tarball..."
npm pack

echo "📥 Installing in demo..."
cd demo
npm install ../minder-data-provider-*.tgz --force

echo "✅ Package installed! Run 'npm run dev' in demo folder"
```

Make it executable:
```bash
chmod +x test-local-package.sh
./test-local-package.sh
```

## Why This Works

1. **`npm pack`** uses the `files` field from package.json, packaging only `/dist`
2. **No `/src` folder** is included in the tarball
3. **No `.js` extension issues** because dist files are properly compiled
4. **Single React Context instance** because it's a real package install
5. **Identical to npm publish** experience

## For End Users

### Published Package (npm)
```bash
npm install minder-data-provider
```
✅ Works perfectly - gets only the dist folder from npm registry

### Local Path Installation
```bash
npm install /path/to/minder-data-provider
```
❌ Problematic - gets entire project including src

### Local Tarball (Recommended for Testing)
```bash
npm install /path/to/minder-data-provider-2.0.0.tgz
```
✅ Works perfectly - gets only dist folder like npm

## Summary

| Method | End User | Issues | Recommendation |
|--------|----------|--------|----------------|
| `npm install minder-data-provider` | ✅ Yes | ✅ None | Use in production |
| `npm install /path/to/package` | ❌ No | ❌ Includes src | Don't use |
| `npm install /path/to/package.tgz` | ✅ Testing | ✅ None | Use for local testing |

## Best Practice for Your Workflow

1. **Development**: Work in `/src` with `.js` extensions (required for ESM)
2. **Build**: Run `npm run build` to compile to `/dist`
3. **Test Locally**: Use `npm pack` + install tarball
4. **Publish**: Run `npm publish` (users get the same thing as the tarball)

This ensures **zero difference** between local testing and production usage! 🎯
