# GitHub Actions Setup Guide

## Required Secrets

To enable automated publishing to npm, you need to configure GitHub secrets:

### 1. Get npm Access Token

1. Log in to [npmjs.com](https://www.npmjs.com)
2. Click your profile → **Access Tokens**
3. Click **Generate New Token** → **Classic Token**
4. Select **Automation** (for CI/CD)
5. Copy the token (starts with `npm_...`)

### 2. Add Token to GitHub

1. Go to your repository: https://github.com/patelkeyur7279/minder-data-provider
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click **Add secret**

## Workflows Configured

### 1. **CI Workflow** (`.github/workflows/ci.yml`)
- **Trigger**: Push to `main` or Pull Requests
- **Runs**: Tests on Node.js 18 & 20
- **Actions**: Lint, test, build, upload coverage

### 2. **Publish to npm** (`.github/workflows/publish.yml`)
- **Trigger**: Git tags (`v*`)
- **Runs**: Build, test, publish to npm
- **Features**: 
  - npm provenance (security attestation)
  - Automated testing before publish
  - Public access

### 3. **GitHub Release** (`.github/workflows/release.yml`)
- **Trigger**: Git tags (`v*`)
- **Runs**: Creates GitHub release with changelog
- **Features**: 
  - Auto-generates changelog from commits
  - Links to npm package
  - Includes installation instructions

## Publishing Process

### Manual Publish (Current Method)
```bash
npm version patch  # or minor, major
npm publish
git push --tags
```

### Automated Publish (After Setup)
```bash
npm version patch  # Creates tag locally
git push --tags    # Triggers GitHub Actions
```

The GitHub Actions will automatically:
1. ✅ Run all tests
2. ✅ Build the package
3. ✅ Publish to npm with provenance
4. ✅ Create GitHub release
5. ✅ Generate changelog

## Benefits of Git-npm Connection

### 🔒 Security
- **npm Provenance**: Cryptographic proof of package origin
- **Automated Testing**: No manual publish without tests passing
- **Audit Trail**: All publishes tracked in GitHub Actions

### 🚀 Automation
- **One Command**: `git push --tags` publishes everything
- **Consistency**: Same process every time
- **CI/CD**: Continuous integration and deployment

### 📊 Visibility
- **Badges**: Real-time status in README
- **Releases**: Organized changelog on GitHub
- **Downloads**: Track npm usage

### 🔗 Integration
- **GitHub ↔ npm**: Automatic linking
- **Issues**: Reference from changelog
- **Versions**: Synced between platforms

## Verification

After setting up `NPM_TOKEN`:

1. **Create a test tag**:
   ```bash
   git tag v2.0.2-test
   git push origin v2.0.2-test
   ```

2. **Check GitHub Actions**:
   - Go to: https://github.com/patelkeyur7279/minder-data-provider/actions
   - Watch workflows run

3. **Verify npm**:
   - Check: https://www.npmjs.com/package/minder-data-provider
   - Should see new version with provenance badge

4. **Clean up test**:
   ```bash
   git tag -d v2.0.2-test
   git push origin :refs/tags/v2.0.2-test
   npm unpublish minder-data-provider@2.0.2-test
   ```

## Troubleshooting

### Token Issues
- Ensure token has "Automation" type
- Check token hasn't expired
- Verify secret name is exactly `NPM_TOKEN`

### Workflow Failures
- Check Actions tab for error logs
- Verify tests pass locally first
- Ensure `npm ci` can install dependencies

### Provenance Errors
- Requires Node.js 20+
- Needs `id-token: write` permission
- Only works on GitHub Actions runners

## Next Steps

1. ✅ Add `NPM_TOKEN` secret to GitHub
2. ✅ Test with a patch version
3. ✅ Monitor first automated publish
4. ✅ Update documentation with new process
