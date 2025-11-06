# 🚀 Quick Release Guide

## TL;DR - How to Publish

```bash
npm run release:patch
```

That's it! Everything else is automated. ✨

---

## What Happens Automatically

1. ✅ Version bumped in `package.json`
2. ✅ Git commit created
3. ✅ Git tag created (e.g., `v2.0.2`)
4. ✅ Pushed to GitHub
5. ✅ GitHub Actions triggered:
   - Runs all tests
   - Builds package
   - Publishes to npm with provenance
   - Creates GitHub release with changelog

---

## Commands

| Command | What It Does | Example |
|---------|-------------|---------|
| `npm run release:check` | Pre-release validation | Check before publish |
| `npm run release:patch` | Bug fix release | 2.0.1 → 2.0.2 |
| `npm run release:minor` | Feature release | 2.0.1 → 2.1.0 |
| `npm run release:major` | Breaking changes | 2.0.1 → 3.0.0 |

---

## Setup (One-time Only)

### 1. Get npm Token
- Go to: https://www.npmjs.com/settings/patelkeyur7279/tokens
- Generate **Automation** token
- Copy it (format: `npm_xxxxx`)

### 2. Add to GitHub
- Go to: https://github.com/patelkeyur7279/minder-data-provider/settings/secrets/actions
- Click **New repository secret**
- Name: `NPM_TOKEN`
- Paste token
- Save

### 3. Done!
Now `npm run release:patch` will automatically publish.

---

## Pre-Release Checklist

```bash
# 1. Commit all changes
git status

# 2. Run validation
npm run release:check
```

If validation passes → You're ready to release!

---

## Watch It Work

After running `npm run release:patch`:

1. **GitHub Actions**: https://github.com/patelkeyur7279/minder-data-provider/actions
2. **npm Package**: https://www.npmjs.com/package/minder-data-provider
3. **Releases**: https://github.com/patelkeyur7279/minder-data-provider/releases

---

## Troubleshooting

**Q: Workflow failed?**  
A: Check the Actions tab for logs. Usually means tests failed or `NPM_TOKEN` is missing.

**Q: Wrong version published?**  
A: Within 72 hours: `npm unpublish minder-data-provider@x.x.x`  
After 72 hours: Publish a new patch version with the fix.

**Q: Token expired?**  
A: Generate new token on npmjs.com and update GitHub secret.

---

## Version Strategy

- **Patch** (2.0.1 → 2.0.2): Bug fixes, documentation
- **Minor** (2.0.1 → 2.1.0): New features (backward compatible)
- **Major** (2.0.1 → 3.0.0): Breaking changes

---

## Current Status

✅ **Git-npm Connection**: Configured  
✅ **GitHub Actions**: Ready  
✅ **Release Scripts**: Working  
✅ **Package Size**: Optimized (555.7 KB)  
✅ **Tests**: 441 passing  

**Ready to publish!** 🎉

---

**Full Documentation**: See `GIT_NPM_SETUP.md` for detailed guide.
