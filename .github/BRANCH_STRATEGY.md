# Branch Strategy & Workflow

## 🌳 Branch Structure

### `dev` (Development)
- **Purpose**: Active development, experimental features
- **Stability**: Unstable, may break
- **Merges from**: Feature branches
- **Merges to**: `test`
- **CI**: Runs tests, no deployment

### `test` (QA/Staging)
- **Purpose**: Release candidates, final testing
- **Stability**: Should be stable, ready for QA
- **Merges from**: `dev` (via PR)
- **Merges to**: `main`
- **CI**: Runs full test suite, build validation

### `main` (Production)
- **Purpose**: Production-ready code
- **Stability**: Always stable, auto-publishes to npm
- **Merges from**: `test` (via PR with version bump)
- **Merges to**: None
- **CI**: Auto-publishes to npm registry

---

## 🔄 Complete Workflow

### 1. Feature Development
```bash
# Create feature branch from dev
git checkout dev
git pull origin dev
git checkout -b feature/my-feature

# Make changes
# ... code ...

# Commit
git add .
git commit -m "feat: Add my feature"

# Push and create PR to dev
git push origin feature/my-feature
```

**→ Create PR: `feature/my-feature` → `dev`**

### 2. Development Testing
```bash
# After PR merged to dev
git checkout dev
git pull origin dev

# Test locally
npm test
npm run build

# When ready for QA, create PR to test
```

**→ Create PR: `dev` → `test`**

### 3. QA/Release Candidate
```bash
# After PR merged to test
git checkout test
git pull origin test

# Run full validation
npm run release:check

# If issues found, fix in dev and merge again
# If all good, prepare for production
```

### 4. Production Release
```bash
# Checkout test branch
git checkout test
git pull origin test

# Bump version (REQUIRED before merging to main)
npm version patch  # or minor, major

# Push version bump
git push origin test

# Create PR to main
```

**→ Create PR: `test` → `main`**

### 5. Auto-Publish
```bash
# After PR merged to main
# GitHub Actions automatically:
# 1. Detects version change
# 2. Runs tests
# 3. Builds package
# 4. Creates git tag
# 5. Publishes to npm with provenance
# 6. Creates GitHub release
```

---

## 📊 Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Developer                                                  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Create feature branch
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  feature/my-feature                                         │
│  - Active development                                       │
│  - Commits & pushes                                         │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ PR to dev
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  dev branch                                                 │
│  ✓ CI runs (tests, build)                                  │
│  ✓ Integration with other features                         │
│  ✗ No publish                                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ PR to test (when ready)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  test branch                                                │
│  ✓ Full CI validation                                      │
│  ✓ QA testing                                               │
│  ✓ Release candidate                                        │
│  ✗ No publish                                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ npm version patch
                           │ PR to main
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  main branch                                                │
│  ✓ Version check                                            │
│  ✓ Full tests                                               │
│  ✓ Build                                                    │
│  ✓ Create git tag                                           │
│  ✓ Publish to npm ← AUTOMATIC                               │
│  ✓ Create GitHub release                                    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
                    📦 npm Registry
```

---

## ✅ Pull Request Checklist

### PR to `dev`:
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Tests pass locally
- [ ] No merge conflicts

### PR to `test`:
- [ ] All features complete
- [ ] Full test suite passes
- [ ] Documentation updated
- [ ] Ready for QA review

### PR to `main`:
- [ ] ⚠️ **Version bumped** (npm version patch/minor/major)
- [ ] All tests pass
- [ ] QA approved
- [ ] CHANGELOG updated (if exists)
- [ ] Breaking changes documented

---

## 🚫 Protection Rules (Recommended)

### `dev` branch:
- ✅ Require PR for merges
- ✅ Require 1 approval
- ✅ Require CI to pass

### `test` branch:
- ✅ Require PR from `dev` only
- ✅ Require 1 approval
- ✅ Require all CI checks to pass

### `main` branch:
- ✅ Require PR from `test` only
- ✅ Require version bump
- ✅ Require 2 approvals
- ✅ Require all CI checks to pass
- ✅ Do not allow force push
- ✅ Do not allow deletion

---

## 🎯 Version Bumping Strategy

### Patch (2.0.1 → 2.0.2)
```bash
npm version patch
```
- Bug fixes
- Documentation updates
- Performance improvements
- Dependency updates

### Minor (2.0.1 → 2.1.0)
```bash
npm version minor
```
- New features
- New functionality
- Backward-compatible changes
- New exports/hooks

### Major (2.0.1 → 3.0.0)
```bash
npm version major
```
- Breaking API changes
- Removed features
- Changed behavior
- Incompatible updates

---

## 🔧 Common Tasks

### Create a feature
```bash
git checkout dev
git pull origin dev
git checkout -b feature/feature-name
# ... make changes ...
git push origin feature/feature-name
# Create PR to dev
```

### Hotfix production
```bash
git checkout main
git pull origin main
git checkout -b hotfix/issue-name
# ... fix issue ...
npm version patch
git push origin hotfix/issue-name
# Create PR to main (emergency only!)
```

### Sync branches
```bash
# Keep test in sync with dev
git checkout test
git merge dev
git push origin test

# Keep dev in sync with main (after publish)
git checkout dev
git merge main
git push origin dev
```

---

## 📈 Release Schedule Suggestion

- **Daily**: Merge features to `dev`
- **Weekly**: Merge `dev` → `test` for QA
- **Bi-weekly**: Merge `test` → `main` for npm publish

Or release on-demand when ready!

---

## 🆘 Emergency Procedures

### Rollback npm version
```bash
# Unpublish within 72 hours
npm unpublish minder-data-provider@x.x.x

# Or publish hotfix
npm version patch
# Fix issue, then merge to main
```

### Revert main
```bash
git revert <commit-hash>
npm version patch
git push origin main
# Auto-publishes fixed version
```

---

## 📚 Resources

- **CI Workflows**: `.github/workflows/`
- **PR Template**: `.github/pull_request_template.md`
- **Release Guide**: `QUICK_RELEASE.md`
- **Setup Guide**: `GIT_NPM_SETUP.md`
