# Branch Protection Setup Instructions

## Release Branch Protection Rules

To complete the workflow setup, configure GitHub branch protection rules for the `release` branch:

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

For now, this file documents the manual setup needed. Automated via GitHub CLI would be:

```bash
gh api repos/JasdeepN/ai-skeleton-extension/branches/release/protection \
  -X PUT \
  -f required_status_checks='{"strict":true,"contexts":["CI Tests"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"dismissal_restrictions":{},"require_code_owner_reviews":false}' \
  -f restrictions=null
```

But GitHub API requires authentication scope. Manual UI setup is recommended for security.
