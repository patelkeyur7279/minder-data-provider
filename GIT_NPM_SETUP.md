# Git-npm Connection Configuration

## ✅ Configuration Complete!

Your Git repository is now fully connected to npm with automated workflows.

## 📋 What's Configured

### 1. **Basic Git-npm Links** ✅
- **Repository**: https://github.com/patelkeyur7279/minder-data-provider
- **Issues**: https://github.com/patelkeyur7279/minder-data-provider/issues
- **Homepage**: GitHub README
- **npm Package**: https://www.npmjs.com/package/minder-data-provider

### 2. **GitHub Actions Workflows** ✅
Three automated workflows have been created:

#### **CI Workflow** (`.github/workflows/ci.yml`)
- **When**: Every push to `main`, every PR
- **What**: Runs tests on Node.js 18 & 20
- **Benefits**: Catch bugs before merging

#### **Publish Workflow** (`.github/workflows/publish.yml`)
- **When**: Tag pushed (e.g., `v2.0.2`)
- **What**: Build → Test → Publish to npm
- **Security**: Includes npm provenance attestation

#### **Release Workflow** (`.github/workflows/release.yml`)
- **When**: Tag pushed
- **What**: Creates GitHub release with changelog
- **Benefits**: Organized version history

### 3. **README Badges** ✅
Added live badges showing:
- npm version
- npm downloads
- Bundle size
- GitHub stars
- CI status
- Test coverage

### 4. **Release Scripts** ✅
New commands in `package.json`:
```bash
npm run release:patch  # Version bump + tag + push
npm run release:minor  # Version bump + tag + push
npm run release:major  # Version bump + tag + push
npm run release:check  # Pre-release validation
```

## 🚀 How to Use

### Current Process (Manual)
```bash
# 1. Make changes
# 2. Commit changes
git add .
git commit -m "feat: Add new feature"

# 3. Create version & publish
npm version patch
npm publish

# 4. Push tags
git push --follow-tags
```

### New Automated Process
```bash
# 1. Make changes
# 2. Commit changes
git add .
git commit -m "feat: Add new feature"

# 3. Use release script (does everything!)
npm run release:patch
```

**What happens automatically:**
1. ✅ Version bumped in package.json
2. ✅ Git tag created
3. ✅ Pushed to GitHub
4. ✅ GitHub Actions triggered
5. ✅ Tests run
6. ✅ Package built
7. ✅ Published to npm (with provenance)
8. ✅ GitHub release created

## 🔑 Required Setup (One-time)

### Get npm Token
1. Go to [npmjs.com](https://www.npmjs.com/settings/patelkeyur7279/tokens)
2. Click **Generate New Token** → **Classic Token**
3. Select **Automation**
4. Copy the token (starts with `npm_`)

### Add to GitHub
1. Go to [Repository Settings](https://github.com/patelkeyur7279/minder-data-provider/settings/secrets/actions)
2. Click **New repository secret**
3. Name: `NPM_TOKEN`
4. Paste your token
5. Click **Add secret**

### Test It
```bash
# Create test version
npm run release:patch

# Watch GitHub Actions
# https://github.com/patelkeyur7279/minder-data-provider/actions

# Verify npm
# https://www.npmjs.com/package/minder-data-provider
```

## 📊 Benefits

### 🔒 **Security**
- **npm Provenance**: Cryptographic proof package came from your GitHub
- **Automated Testing**: Can't publish if tests fail
- **Audit Trail**: Every publish tracked in GitHub Actions logs

### ⚡ **Speed**
- **One Command**: `npm run release:patch` does everything
- **No Manual Steps**: Fully automated pipeline
- **Consistent**: Same process every time

### 📈 **Visibility**
- **Badges**: Real-time status in README
- **Releases**: Professional changelog on GitHub
- **Downloads**: Track npm usage over time
- **CI Status**: See build health at a glance

### 🔗 **Integration**
- **GitHub ↔ npm**: Automatic syncing
- **Version Tags**: Git tags match npm versions
- **Changelog**: Auto-generated from commits
- **Issues**: Can reference in releases

## 📝 Release Checklist

Before releasing:
```bash
# 1. Verify tests pass
npm test

# 2. Check bundle size
npm run release:check

# 3. Review changes
git log --oneline $(git describe --tags --abbrev=0)..HEAD

# 4. Release!
npm run release:patch  # or minor, major
```

## 🎯 Version Strategy

- **Patch** (2.0.1 → 2.0.2): Bug fixes, small changes
- **Minor** (2.0.1 → 2.1.0): New features (backward compatible)
- **Major** (2.0.1 → 3.0.0): Breaking changes

## 📚 Documentation

- **Setup Guide**: `.github/SETUP.md` (detailed instructions)
- **Workflows**: `.github/workflows/` (CI, publish, release)
- **Examples**: `examples/` (platform demos)

## ✅ Verification

Check that everything works:

1. **npm Package**: https://www.npmjs.com/package/minder-data-provider
   - Should show repository link
   - Should show homepage link
   - Should show issues link
   - Should have provenance badge (after next publish)

2. **GitHub**: https://github.com/patelkeyur7279/minder-data-provider
   - README badges should be visible
   - Releases tab should show versions
   - Actions tab shows workflow runs

3. **Local**:
   ```bash
   npm view minder-data-provider
   # Should show repository, homepage, bugs URLs
   ```

## 🚨 Troubleshooting

### Workflow fails
- Check Actions tab for logs
- Verify `NPM_TOKEN` is set correctly
- Ensure tests pass locally first

### Token expired
- Generate new token on npmjs.com
- Update GitHub secret
- Retry release

### Wrong version published
- Unpublish within 72 hours: `npm unpublish minder-data-provider@x.x.x`
- Or publish new patch version with fix

## 🎉 You're All Set!

Your Git repository is now professionally connected to npm with:
- ✅ Automated publishing
- ✅ Security attestation
- ✅ Professional releases
- ✅ Live status badges
- ✅ One-command deployment

**Next publish**: Just run `npm run release:patch` and everything happens automatically! 🚀
