# Contributing to AI Skeleton Extension

## Overview

This project uses a **permanent dev/release branch model** for stable, controlled releases to the VS Code Marketplace.

## Branch Structure

| Branch | Purpose | Protection |
|--------|---------|-----------|
| **dev** | Primary development | None (direct pushes allowed) |
| **release** | Stable releases only | PR-only, all CI checks required |
| **feature/*** | Feature development | Short-lived, merge to dev via PR |

## Development Workflow

### For New Features/Fixes

1. **Create feature branch from dev**
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/my-feature
   ```

2. **Make changes and commit**
   ```bash
   git add .
   git commit -m "feat: description of changes"
   ```

3. **Push and create PR to dev**
   ```bash
   git push -u origin feature/my-feature
   # Then create PR on GitHub to merge into 'dev'
   ```

4. **CI Tests Run**
   - GitHub Actions automatically runs test.yml on PR
   - All checks must pass before merge
   - Merge when approved

5. **Merge to dev**
   ```bash
   # After PR approval and CI passes
   # Click "Squash and merge" or "Create a merge commit" on GitHub
   ```

## Release Workflow

### Creating a Release

The release process is intentionally manual and gated:

1. **Version Bump** (optional, do this on dev if needed)
   ```bash
   git checkout dev
   npm version patch  # or minor, major
   git push origin dev
   ```

2. **Create Release PR**
   ```bash
   # On GitHub: Create a PR from 'dev' to 'release'
   # Title: "Release v0.1.30" (or whatever version)
   # Description: List major changes since last release
   ```

3. **Code Review**
   - At least one approval required
   - Final validation before releasing to production

4. **Merge to Release**
   - Once approved, merge PR to release branch
   - GitHub automatically triggers `release.yml` workflow

5. **Release Workflow (Automated)**
   - ✅ Full test suite runs (all platforms, Node versions)
   - ✅ Creates 'latest-stable' tag
   - ✅ Publishes to VS Code Marketplace
   - ✅ Creates GitHub Release
   - All automatic - you're notified on completion

6. **Users Auto-Update**
   - VS Code Marketplace shows 'latest-stable' tag
   - Users with auto-update enabled get new version

## Hotfix Process

For urgent fixes needed in production (release branch):

### Option A: Cherry-Pick from Dev (Recommended)
```bash
# If fix is already in dev:
git checkout release
git pull origin release
git cherry-pick <commit-hash>
git push origin release
# This triggers release.yml again
```

### Option B: Direct Commit (Emergency Only)
```bash
# If fix is urgent and not in dev yet:
git checkout release
git pull origin release
# Make fix
git add .
git commit -m "hotfix: critical issue"
git push origin release
# Requires branch protection override (admin)
```

### Option C: Feature Branch from Release
```bash
git checkout release
git pull origin release
git checkout -b hotfix/critical-fix
# Make fix
git add .
git commit -m "hotfix: critical issue"
git push -u origin hotfix/critical-fix
# Create PR from hotfix to release
```

## Version Strategy

### Development (dev branch)
- Tag versions as `v0.x.x` (pre-release semantic versioning)
- Increment patch for each dev release tag
- Example: v0.1.30, v0.1.31, etc.

### Release (release branch)
- Tag version as `latest-stable` (always points to latest production)
- Also tagged with specific version: `v0.2.0` (stable release)
- Only released when explicitly merged to release branch

### Marketplace Publishing
- Only publishes on `latest-stable` tag
- Users auto-update to latest-stable
- Rollback: Revert latest-stable tag to previous commit if critical bug found

## Workflow Diagram

```
feature/my-feature (your work)
        ↓ PR to dev
dev ←─────┬──── Runs CI on PR, merge when green
          │
          ├─ dev branch: continuous development
          │  (push directly or via PR, up to you)
          │
          └─ When ready to release: Create PR to release
                          ↓
                    release ←── PR from dev (review gate)
                          ↓ Merge
                    release.yml (triggered)
                     • Full test suite
                     • Create latest-stable tag
                     • Publish to marketplace
                          ↓
                    Users auto-update
```

## Branch Protection Rules (release branch)

The release branch has GitHub protection rules enabled:

- ✅ **Require pull request before merging**
  - All changes must go through code review
  - Cannot force-push directly

- ✅ **Require status checks to pass**
  - All CI tests must pass before merge
  - Branch must be up-to-date with main

- ✅ **Require branches to be up to date**
  - PR must be rebased/merged with latest before merge
  - Prevents merge conflicts

- ✅ **Include administrators**
  - Admin can override rules for emergency hotfixes
  - Override requires admin account and direct push

## Testing Before Release

Before creating a PR to release:

1. **Run full test suite locally**
   ```bash
   npm run test:coverage
   npm run test:e2e
   npm run package:vsix
   ```

2. **Verify VSIX works**
   - Install locally in VS Code
   - Test core functionality
   - Check for any errors in extension console

3. **Check git log**
   ```bash
   git log release..dev --oneline
   # Should show all changes since last release
   ```

## Questions?

- For contribution guidelines: See main README.md
- For architecture: See docs/MEMORY_DATABASE.md
- For development setup: See INSTALLATION.md

---

**Happy contributing! All releases are now intentional, tested, and user-safe.** 🎉
