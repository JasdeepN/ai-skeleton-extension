# Embedding Verification Tests

## Overview

These tests ensure that all source files (prompts, agents, protected files) are properly embedded with their latest content before releases. This prevents the v0.1.17 issue where outdated embedded assets were shipped.

## Test Types

### 1. CLI Verification Script (`scripts/verify-embeddings.js`)

Fast, lightweight verification that can be run locally or in CI/CD.

```bash
# Run manually
node scripts/verify-embeddings.js

# Or via npm
npm run test:verify-embeddings
```

**What it checks:**
- All prompt files are embedded in `promptStore.ts`
- All agent files are embedded in `agentStore.ts`
- All protected files are embedded
- Content hashes match between source and embedded versions
- Outputs detailed report with color coding

**Output:**
- ✓ (green) = File properly embedded with current content
- ✗ (red) = File missing or content mismatch
- Exit code 0 = All embeddings valid
- Exit code 1 = One or more embeddings out of sync

**Example output:**
```
=== Verifying Prompts ===
✓ Checkpoint.prompt.md - OK
✓ Execute.prompt.md - OK
✓ GH.prompt.md - OK
✓ Plan.prompt.md - OK
✓ Startup.prompt.md - OK
✓ Sync.prompt.md - OK
✓ Think.prompt.md - OK

=== Verifying Agents ===
✓ memory-deep-think.agent.md - OK

=== Verifying Protected Files ===
✓ PROTECTED_FILES.md - OK (embedded as protected-files)

=========================================
✓ All embeddings valid - Ready for release
```

### 2. Jest Unit Tests (`tests/embeddings.test.js`)

Comprehensive test suite with detailed assertions.

```bash
# Run all Jest tests
npm test

# Run only embedding tests
npm run test:embeddings

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

**Test suites:**
- **Prompts** - Verifies all 7 prompts are embedded
  - Files exist and are readable
  - Hashes match between source and embedded
  - Metadata is correct
  - Base64 decodes properly
  
- **Agents** - Verifies agent definitions
  - All agent files are embedded
  - Content hashes match
  - YAML frontmatter is valid
  - Tool declarations are current (no old names like `JasdeepN.ai-skeleton-prompts`)

- **Protected Files** - Verifies `.copilotignore` and `PROTECTED_FILES.md`
  - Files exist or test gracefully skips
  - Content is properly embedded
  - Files are readable and valid

- **Store File Integrity** - Validates generated files
  - `promptStore.ts` is valid TypeScript
  - `agentStore.ts` is valid TypeScript
  - Both have AUTO-GENERATED comments
  - Exports are present

- **Release Readiness** - Master check
  - All embeddings are up to date
  - Fails with detailed mismatch report if issues found

## Usage in CI/CD

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:
```bash
#!/bin/bash
npm run test:verify-embeddings || exit 1
```

### GitHub Actions

Add to workflow:
```yaml
- name: Verify embeddings before release
  run: npm run test:verify-embeddings

- name: Run embedding tests
  run: npm run test:embeddings
```

### Release Process

**Always run before releasing:**
```bash
# 1. Make changes to prompts, agents, or protected files
# 2. Re-embed
npm run embed-all

# 3. Verify embeddings before committing
npm run test:verify-embeddings

# 4. If all pass, commit and push
git add -A
git commit -m "..."
git push
git tag v0.x.x && git push origin v0.x.x
```

## How It Works

### Hash-Based Verification

Each file is verified by comparing SHA256 hashes:

1. **Source file** → Read from disk → Calculate hash
2. **Embedded content** → Extract from store file → Decode base64 → Calculate hash
3. **Compare** → If hashes match, embedding is current

This detects:
- ✅ Out-of-date embedded content
- ✅ Missing embeddings
- ✅ Corrupted base64 encoding
- ✅ File deletion or renaming

### ID Mapping

Prompt files use ID mapping (set in `scripts/embed-prompts.js`):
- `Checkpoint.prompt.md` → ID: `checkpoint`
- `Execute.prompt.md` → ID: `execute`
- `GH.prompt.md` → ID: `githubActions` (special case)
- `Plan.prompt.md` → ID: `plan`
- etc.

The verification script knows about this mapping.

### Agent Tool Declaration Checks

Special test verifies that agent tool declarations are current:
- ✅ Contains `jasdeepn.ai-skeleton-extension/*`
- ✅ Does NOT contain `JasdeepN.ai-skeleton-prompts` (old)
- ✅ Does NOT contain `modelcontextprotocol.servers` (incorrect prefix)

## Troubleshooting

### Error: "Content mismatch - run 'npm run embed-all' to fix"

This means source files were modified but not re-embedded.

**Fix:**
```bash
npm run embed-all
npm run test:verify-embeddings
```

### Error: "File not embedded in promptStore.ts"

A source file exists but isn't in the store.

**Fix:**
1. Check the file exists: `ls prompts/Filename.prompt.md`
2. Check the ID mapping in `scripts/embed-prompts.js`
3. Re-embed: `npm run embed-all`

### Error: "All embedded agents have valid YAML frontmatter" failed

Agent file doesn't start with `---\nname:`.

**Fix:** Verify agent file has valid YAML frontmatter:
```yaml
---
name: Agent-Name
description: ...
tools: [...]
---
```

## Test File Structure

```
ai-skeleton-extension/
├── prompts/                      # Source files
│   ├── Checkpoint.prompt.md
│   ├── Execute.prompt.md
│   ├── GH.prompt.md
│   └── ...
├── agents/                       # Source files
│   ├── memory-deep-think.agent.md
│   └── ...
├── protected/                    # Source files (optional)
│   ├── .copilotignore
│   └── PROTECTED_FILES.md
├── src/                          # Generated (DO NOT EDIT)
│   ├── promptStore.ts            # Base64 embedded prompts
│   └── agentStore.ts             # Base64 embedded agents
├── scripts/
│   ├── embed-prompts.js          # Generates promptStore.ts
│   ├── embed-agents.js           # Generates agentStore.ts
│   └── verify-embeddings.js      # CLI verification
├── tests/
│   └── embeddings.test.js        # Jest unit tests
└── jest.config.json              # Jest configuration
```

## Best Practices

1. **Always verify before releasing:**
   ```bash
   npm run test:verify-embeddings
   ```

2. **Make re-embedding part of your workflow:**
   - Edit `prompts/Prompt.prompt.md`
   - Run `npm run embed-all`
   - Run `npm run test:verify-embeddings`
   - Commit both source and generated files

3. **Use in CI/CD:**
   - Add embedding verification to pre-commit hooks
   - Add to GitHub Actions workflow
   - Fail release if embeddings are stale

4. **Never edit store files manually:**
   - `src/promptStore.ts` - Auto-generated
   - `src/agentStore.ts` - Auto-generated
   - Always re-run embedding scripts

## Related Scripts

- `npm run embed-all` - Re-embed all prompts, agents, and protected files
- `npm run build` - Build extension (includes embedding)
- `npm run verify` - General project verification
- `npm run package:vsix` - Package VSIX (verify-embeddings should pass first)

## References

- [Embedding Architecture](../src/promptStore.ts)
- [Agent Embedding](../src/agentStore.ts)
- [Embed Prompts Script](./embed-prompts.js)
- [Embed Agents Script](./embed-agents.js)
