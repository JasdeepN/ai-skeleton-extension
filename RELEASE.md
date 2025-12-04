# Release Checklist & Embedding Gate

## Overview

The embedding verification gate prevents stale assets from being released to users. Both local releases (via `./scripts/release.sh`) and CI releases (GitHub Actions workflow) are protected.

## How It Works

### Release Flow with Embedding Gate

```
┌─────────────────────────────────────────────────────────────────┐
│ DEVELOPER: Make changes to prompts, agents, or protected files   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Re-embed assets (LOCAL)                                  │
│ $ npm run embed-all                                              │
│ → Generates src/promptStore.ts, src/agentStore.ts               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Verify embeddings (LOCAL - GATE #1)                      │
│ $ npm run test:verify-embeddings                                 │
│ ✓ Checks hashes of all source files vs embedded versions        │
│ ✗ BLOCKS if mismatch found                                       │
│ → Shows which files are out of sync                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                  ❌ FAIL? → Fix & restart
                            │ ✓ PASS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Commit & push to main (LOCAL)                            │
│ $ git add -A && git commit -m "..." && git push origin main      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Create tag & push (LOCAL or CI)                          │
│ Option A: ./scripts/release.sh 0.1.X                             │
│ Option B: git tag v0.1.X && git push origin v0.1.X              │
│ → Triggers GitHub Actions workflow                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: GitHub Actions Workflow                                  │
│ .github/workflows/release.yml                                    │
├─────────────────────────────────────────────────────────────────┤
│ ✓ Checkout code                                                  │
│ ✓ Install dependencies                                           │
│ ✓ npm run test:verify-embeddings (GATE #2)                       │
│ ✗ BLOCKS workflow if embeddings stale                            │
│ ✓ Build (npm run build)                                          │
│ ✓ Package VSIX                                                   │
│ ✓ Upload artifact                                                │
│ ✓ Create GitHub release                                          │
│ ✓ Publish to VS Code Marketplace                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                  ❌ FAIL? → Workflow stops
                            │ ✓ PASS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ ✨ Extension published to marketplace                            │
│ Users auto-update (5-15 min propagation)                        │
└─────────────────────────────────────────────────────────────────┘
```

## Release Methods

### Option A: Automated Release Script (Recommended)

Handles everything with embedded gates:

```bash
./scripts/release.sh 0.1.19
```

**What it does:**
1. ✓ Updates version in package.json
2. ✓ Runs `npm run embed-all`
3. ✓ Builds extension
4. ✓ **GATE**: Verifies embeddings (`npm run test:verify-embeddings`)
5. ✓ Prompts to update CHANGELOG.md
6. ✓ Commits changes
7. ✓ Pushes to main
8. ✓ Creates and pushes tag v0.1.19
9. ↪ Triggers workflow → marketplace publish

**Fails if:**
- Version format invalid
- npm run embed-all fails
- Embedding verification fails (GATE)

### Option B: Manual Tag Release

For quick releases with minimal changes:

```bash
# 1. Make changes
nano prompts/Think.prompt.md

# 2. Re-embed
npm run embed-all

# 3. Verify (GATE)
npm run test:verify-embeddings

# 4. If ✓, commit and tag
git add -A
git commit -m "fix: update Think prompt"
git tag v0.1.19
git push origin main v0.1.19
```

## Pre-Release Checklist

**Before running release script or tagging:**

- [ ] All code changes committed to `main`
- [ ] Prompts/agents/protected files updated (if applicable)
- [ ] Run `npm run embed-all` to re-embed
- [ ] Run `npm run test:verify-embeddings` to verify (GATE #1)
- [ ] Verify no uncommitted changes: `git status`
- [ ] Update CHANGELOG.md with release notes
- [ ] Verify version bump is correct: `grep "version" package.json`

**Example:**

```bash
# After editing prompts
npm run embed-all

# Verify gate (required)
npm run test:verify-embeddings

# If ✓, continue
npm run compile
git add -A
git commit -m "docs: update prompts for v0.1.19"

# Start release
./scripts/release.sh 0.1.19
```

## What Happens if Embedding Verification Fails

### Scenario 1: Local Release Script

```bash
$ ./scripts/release.sh 0.1.19
...
🔍 Step 4: Verifying embeddings...
✓ Checkpoint.prompt.md - OK
✗ Execute.prompt.md - Content mismatch
  Source:   abc123...
  Embedded: def456...
❌ Embedding verification failed!
⚠️  Run 'npm run embed-all' to fix, then try again

$ npm run embed-all
$ npm run test:verify-embeddings
$ ./scripts/release.sh 0.1.19  # Try again
```

### Scenario 2: GitHub Actions Workflow

If embeddings are stale when tag is pushed:

```
Workflow Name: Release VSIX
Event: v0.1.19 tag pushed

❌ FAILED: Verify embeddings (GATE - must pass to release)
   
   Output:
   ✗ Execute.prompt.md - Content mismatch
   
   ⚠️  Run 'npm run embed-all' to fix
   
   Subsequent steps skipped:
   ⊘ Build (skipped)
   ⊘ Package VSIX (skipped)
   ⊘ Upload artifact (skipped)
   ⊘ Create GitHub Release (skipped)
   ⊘ Publish to Marketplace (skipped)

Fix:
1. git tag -d v0.1.19 && git push origin :v0.1.19
2. npm run embed-all
3. git add src/promptStore.ts src/agentStore.ts
4. git commit --amend
5. git tag v0.1.19
6. git push origin v0.1.19
```

## Embedding Gate Details

### What Gets Verified

- ✓ All 7 prompts in `prompts/*.md` match embedded versions in `promptStore.ts`
- ✓ All agents in `agents/*.agent.md` match embedded versions in `agentStore.ts`
- ✓ Protected files (`.copilotignore`, `PROTECTED_FILES.md`) match embeddings
- ✓ Base64 encoding/decoding works correctly
- ✓ SHA256 hashes match between source and embedded
- ✓ Agent tool declarations are current (no old `JasdeepN.ai-skeleton-prompts` names)

### How It Works

1. Read each source file from disk
2. Calculate SHA256 hash of source content
3. Extract base64 from store file
4. Decode base64 to original content
5. Calculate SHA256 hash of decoded content
6. Compare hashes:
   - ✓ Match → File is current
   - ✗ Mismatch → File is out of date

### Running the Gate Manually

```bash
# CLI verification (fast)
npm run test:verify-embeddings

# Jest unit tests (comprehensive)
npm run test:embeddings

# Both
npm test
```

## Common Scenarios

### Scenario A: Modified a Prompt File

```bash
# 1. Edit prompt
nano prompts/Think.prompt.md

# 2. Re-embed (required!)
npm run embed-all

# 3. Verify (GATE)
npm run test:verify-embeddings
✓ All embeddings valid - Ready for release

# 4. Commit & release
git add -A && git commit -m "docs: update Think prompt"
./scripts/release.sh 0.1.19
```

### Scenario B: Modified Agent Tool Declarations

```bash
# 1. Edit agent
nano agents/memory-deep-think.agent.md
# (update tools list, fix tool names, etc.)

# 2. Re-embed
npm run embed-all

# 3. Verify (GATE checks tool names!)
npm run test:verify-embeddings
✓ All embeddings valid - Ready for release

# 4. Commit & release
git add -A && git commit -m "chore(agent): update tool declarations"
./scripts/release.sh 0.1.19
```

### Scenario C: Forgot to Re-Embed Before Tagging

```bash
# 1. You accidentally tagged without re-embedding
git tag v0.1.19
git push origin v0.1.19

# 2. GitHub Actions workflow starts...
# 3. Workflow FAILS at embedding gate
# 4. Marketplace NOT updated (good!)

# Fix:
git tag -d v0.1.19
git push origin :v0.1.19
npm run embed-all
npm run test:verify-embeddings
git add -A && git commit --amend
git tag v0.1.19 && git push origin v0.1.19
# Workflow reruns and succeeds
```

## Why This Matters

The embedding gate prevents:

❌ **Stale prompts** - Users get old/outdated workflow prompts  
❌ **Broken agents** - Agent tool declarations don't match actual tools  
❌ **Auto-updates with bad assets** - Bad extension reaches users automatically  
❌ **Silent failures** - Issues caught during development, not in production  

✅ **Verified releases** - Only valid, current embeddings reach users  
✅ **Safety net** - Gate catches mistakes before they ship  
✅ **Peace of mind** - No more v0.1.17-style embedded asset failures  

## Reference

**Files:**
- Release script: `scripts/release.sh`
- Embedding verification: `scripts/verify-embeddings.js`
- Jest tests: `tests/embeddings.test.js`
- CI workflow: `.github/workflows/release.yml`

**Commands:**
- `npm run embed-all` - Re-embed all assets
- `npm run test:verify-embeddings` - CLI gate check
- `npm run test:embeddings` - Jest tests
- `npm test` - All tests
- `./scripts/release.sh 0.1.X` - Automated release (includes gates)

**Documentation:**
- `tests/README.md` - Detailed test documentation
- `.github/workflows/release.yml` - CI/CD workflow
- This file - Release process & gates
