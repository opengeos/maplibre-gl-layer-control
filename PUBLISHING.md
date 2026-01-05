# Publishing to npm

This guide explains how to publish `maplibre-gl-layer-control` to npm.

## Prerequisites

1. **npm account**: Create one at https://www.npmjs.com/signup
2. **Email verification**: Verify your npm email address
3. **2FA (recommended)**: Enable two-factor authentication for security

## One-Time Setup

### 1. Login to npm

```bash
npm login
```

You'll be prompted for:
- Username
- Password
- Email
- 2FA code (if enabled)

Verify login:
```bash
npm whoami
```

### 2. Check Package Name Availability

```bash
npm search maplibre-gl-layer-control
```

If the name is taken, you'll need to either:
- Choose a different name
- Use a scoped package: `@yourusername/maplibre-gl-layer-control`

## Pre-Publish Checklist

Before publishing, ensure:

- [ ] `package.json` version is updated
- [ ] README.md is complete and accurate
- [ ] LICENSE file exists
- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] dist/ folder contains expected files
- [ ] .npmignore excludes development files

### Verify Package Contents

See what will be published:
```bash
npm pack --dry-run
```

This shows all files that will be included in the package.

## Publishing Steps

### 1. Update Version

Follow [semantic versioning](https://semver.org/):

```bash
# Patch release (0.1.0 -> 0.1.1) - bug fixes
npm version patch

# Minor release (0.1.0 -> 0.2.0) - new features, backward compatible
npm version minor

# Major release (0.1.0 -> 1.0.0) - breaking changes
npm version major
```

Or manually edit `package.json`:
```json
{
  "version": "0.1.0"  // Change this
}
```

### 2. Build the Package

```bash
npm run build
```

Verify build output in `dist/`:
- `index.mjs` - ES module
- `index.cjs` - CommonJS module
- `maplibre-gl-layer-control.css` - Styles
- `types/` - TypeScript definitions

### 3. Test Locally (Optional but Recommended)

Test the package in another project:

```bash
# In this project
npm pack

# This creates maplibre-gl-layer-control-0.1.0.tgz

# In another project
npm install /path/to/maplibre-gl-layer-control-0.1.0.tgz
```

### 4. Publish to npm

**For first release:**
```bash
npm publish
```

**For pre-release versions (alpha, beta, rc):**
```bash
# Update version to something like 0.1.0-alpha.1
npm version 0.1.0-alpha.1

# Publish with tag
npm publish --tag alpha
```

**For scoped packages (if using @username/package-name):**
```bash
# Public scoped package
npm publish --access public

# Private scoped package (requires paid npm account)
npm publish --access restricted
```

### 5. Verify Publication

Check your package on npm:
```bash
npm view maplibre-gl-layer-control
```

Or visit: https://www.npmjs.com/package/maplibre-gl-layer-control

## Post-Publishing

### 1. Create Git Tag

```bash
git tag v0.1.0
git push origin v0.1.0
```

### 2. Create GitHub Release

Go to your repository on GitHub:
1. Click "Releases"
2. Click "Create a new release"
3. Choose the tag you just created
4. Add release notes (changelog)
5. Publish release

### 3. Update CHANGELOG.md

Document what changed in this version:

```markdown
## [0.1.0] - 2024-01-05

### Added
- Initial release
- Layer visibility and opacity controls
- Advanced style editor for all layer types
- Auto-detection of layer properties
- React integration
```

## Updating the Package

When you need to publish updates:

1. Make your changes
2. Update tests
3. Update documentation
4. Run `npm version patch/minor/major`
5. Update CHANGELOG.md
6. Run `npm run build`
7. Run `npm publish`
8. Push to GitHub: `git push && git push --tags`

## Automation with GitHub Actions

For automated publishing on GitHub releases, create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

To use this:
1. Generate npm token: https://www.npmjs.com/settings/[username]/tokens
2. Add to GitHub secrets: Settings → Secrets → New repository secret
3. Name it `NPM_TOKEN`

## Troubleshooting

### "You do not have permission to publish"
- Check you're logged in: `npm whoami`
- Check package name isn't taken
- Use scoped package or different name

### "Package name too similar to existing package"
- npm may reject names similar to popular packages
- Choose a more distinctive name

### "Missing required field"
- Verify package.json has all required fields:
  - name, version, main, module, types

### "Cannot publish over existing version"
- You're trying to publish a version that already exists
- Update the version number: `npm version patch`

## Resources

- [npm documentation](https://docs.npmjs.com/)
- [Semantic Versioning](https://semver.org/)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Package.json fields](https://docs.npmjs.com/cli/v10/configuring-npm/package-json)
