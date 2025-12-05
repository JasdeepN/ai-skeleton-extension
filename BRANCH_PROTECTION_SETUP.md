# Branch Protection Setup Instructions

## Release Branch Protection Rules

To complete the workflow setup, configure GitHub branch protection rules for the `release` branch:

### Set default branch to `dev`
- In GitHub → Settings → Branches → Default branch: **set to `dev`**.
- Rationale: all development happens on `dev`; `release` is protected and only updated via PR merges.

### Steps
1. Go to: https://github.com/JasdeepN/ai-skeleton-extension/settings/branches
2. Add rule for branch: `release`
3. Enable the following settings:

**Required Settings:**
- ✅ Require a pull request before merging
  - ✅ Require approval reviews (can set to 0 for solo dev)
  - ✅ Require review from Code Owners (optional)
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - Required status checks to pass: `CI Tests` (or specific job names)
  - **NEW:** Required status checks: `codecov/project` (once Codecov is installed)
  
- ✅ Include administrators (so protection can be overridden if needed)

- ✅ Restrict who can push to matching branches
  - (Optional - allow only specific teams/users)

### Result
Once configured:
- Direct pushes to `release` are blocked
- All merges to `release` require PR
- All CI checks must pass
- Branch must be up-to-date with base
- Admin can override for emergency hotfixes

### Verification
After configuration, verify by attempting a direct push to `release`:
```bash
git checkout release
echo "test" >> test.txt
git add test.txt
git commit -m "test"
git push origin release  # Should be rejected
```

---

## Coverage Gates Setup (Code Coverage Enforcement)

### Installing Codecov Integration

Codecov automatically enforces minimum code coverage on all PRs merging to `release`:

1. Go to: https://github.com/marketplace/codecov
2. Click "Install it for free"
3. Select your GitHub account and authorize
4. Choose the `ai-skeleton-extension` repository to install on

The `codecov.yml` file in the repo root configures:
- **Minimum coverage:** 95% (project-level)
- **Threshold variance:** 1% (94% is failure, 95%+ passes)
- **Auto-flagging:** Carryforward coverage to prevent regressions

### How It Works

Once installed, Codecov will:

1. **On every PR:**
   - Download coverage reports from CI tests
   - Comment with coverage changes (e.g., "-0.5%")
   - Show coverage breakdown by file
   - Block merge if coverage drops below 95%

2. **On merge to release:**
   - Final validation that coverage meets 95% threshold
   - Status check `codecov/project` required to pass
   - Release cannot publish if coverage fails

### Coverage Configuration

The `codecov.yml` file specifies:

```yaml
coverage:
  range: "95..100"          # Must be between 95-100%
  project:
    target: 95%             # Minimum 95%
    threshold: 1%           # Allow 1% variance
```

### Monitoring

- **Coverage reports:** https://app.codecov.io/gh/JasdeepN/ai-skeleton-extension
- **Current coverage:** View in `npm run test:coverage` output
- **PR comments:** Codecov bot comments on every PR with changes
- **Dashboard:** Track trends over time in Codecov dashboard

### If Coverage Drops

If a PR drops coverage below 95%:

1. Codecov bot will comment with the issue
2. Add more unit tests to increase coverage
3. Run `npm run test:coverage` locally to verify
4. Commit additional tests
5. Codecov will automatically recheck and update the status check

---

For now, this file documents the manual setup needed. Automated via GitHub CLI would be:

```bash
gh api repos/JasdeepN/ai-skeleton-extension/branches/release/protection \
  -X PUT \
  -f required_status_checks='{"strict":true,"contexts":["CI Tests","codecov/project"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"dismissal_restrictions":{},"require_code_owner_reviews":false}' \
  -f restrictions=null
```

But GitHub API requires authentication scope. Manual UI setup is recommended for security.
