---
description: Comprehensive memory bank checkpoint and update workflow
version: "1.0.0"
---

# AI-Memory Checkpoint

**⚠️ CRITICAL: THIS FILE IS READ-ONLY ⚠️**
**DO NOT MODIFY THIS PROMPT FILE. It is a template for agent workflows.**
**All work, plans, and context must be saved to AI-Memory/, NOT here.**


This prompt guides a comprehensive review and update of all memory bank files, captures recent progress, documents decisions, and generates a commit message summarizing the session.

## Instructions

Run this checkpoint at the end of a coding session or when significant work has been completed.

### Step 1: Review Current State

1. **Read all memory files** in this order:
   - `AI-Memory/productContext.md` - Understand the project scope
   - `AI-Memory/activeContext.md` - Current goals and blockers
   - `AI-Memory/systemPatterns.md` - Architectural patterns
   - `AI-Memory/decisionLog.md` - Past decisions
   - `AI-Memory/progress.md` - Recent work

2. **Gather session context**:
   - Review recent git changes: `git status` and `git diff`
   - Check for new or modified files in key directories:
     - `app/`, `components/`, `lib/`
     - Configuration files (`.github/`, `.vscode/`, root configs)
   - Note any test runs, builds, or deployments attempted

### Step 2: Update Memory Files

Update each memory file based on recent work:

#### activeContext.md
- Update **Current Goals** using `aiSkeleton_updateContext`
- Update **Current Blockers** with any unresolved issues
- Remove completed goals
- Add new goals discovered during this session

#### progress.md
- Move completed items using `aiSkeleton_updateProgress`
- Update "Doing" with current in-progress work
- Update "Next" with planned upcoming tasks
- Keep entries concise and timestamped

#### decisionLog.md
- Add decisions using `aiSkeleton_logDecision`
- Format: `| YYYY-MM-DD | Decision | Rationale |`

#### systemPatterns.md
- Document new patterns using `aiSkeleton_updatePatterns`
- Update existing patterns if they evolved
- Categories:
  - **Architectural Patterns**: High-level system design
  - **Design Patterns**: Code organization and structure
  - **Common Idioms**: Project-specific conventions

#### projectBrief.md
- Update using `aiSkeleton_updateProjectBrief` if core features changed
- Add new libraries or technologies to Technical Stack
- Update overview if project scope shifted

### Step 3: Review Workflow and Instruction Files

Check if any workflow or instruction files need updates:

1. **Review `.github/workflows/`** for CI/CD changes
2. **Review `.vscode/settings.json`** and `mcp.json` for tooling updates
3. **Review root configuration files**:
   - `package.json` - dependency changes
   - `next.config.js` - build configuration
   - `tsconfig.json` - TypeScript settings
   - `jest.config.cjs`, `playwright.config.ts` - testing configs

4. **Document recommendations**:
   - Workflow improvements discovered
   - Configuration optimizations
   - Tooling enhancements
   - Process refinements

### Step 4: Generate Summary Report

Create a structured summary:

```markdown
## Checkpoint Summary

### Session Overview
[Brief description of work completed]

### Files Modified
- [List key files changed]

### Decisions Made
- [List major decisions from this session]

### Progress Updates
**Completed:**
- [Items moved to Done]

**In Progress:**
- [Current work]

**Blocked:**
- [Any blockers identified]

### Recommendations
- [Workflow improvements]
- [Configuration updates]
- [Process changes]

### Next Steps
- [Immediate next actions]
- [Future work to consider]
```

### Step 5: Generate Commit Message

Based on the session summary, generate a conventional commit message:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:** feat, fix, docs, style, refactor, test, chore, build, ci, perf

**Guidelines:**
- Subject: Imperative mood, max 72 characters
- Body: Explain what and why (not how)
- Footer: Breaking changes, issue references

**Example:**
```
chore(memory): update memory bank checkpoint workflow

- Added comprehensive checkpoint prompt for session reviews
- Updated progress tracking with recent test coverage work
- Documented Next.js 15.5.6 build blocker decision
- Enhanced system patterns with R2 fallback details

Related to ongoing gallery and deployment workflow improvements.
```

### Step 6: Validation

Before completing:

- [ ] All memory files have current dates
- [ ] DecisionLog entries follow table format
- [ ] Progress items are timestamped
- [ ] Active blockers are clearly documented
- [ ] System patterns reflect current architecture
- [ ] Commit message follows conventional commits format
- [ ] Recommendations are actionable and specific

## Usage

To run this checkpoint:

1. Say "Checkpoint" or "Run checkpoint" to the assistant
2. The assistant will execute all steps above using `aiSkeleton_*` tools
3. Review the generated summary and commit message
4. Manually commit using the provided message, or edit as needed

## Output Format

The assistant should respond with:

1. **Status**: `[MEMORY BANK: UPDATING]` at start
2. **Updates**: Confirmation of each file updated via `aiSkeleton_*` tools
3. **Summary**: Structured session summary
4. **Commit Message**: Ready-to-use git commit message
5. **Final Status**: `[MEMORY BANK: ACTIVE]`

---

This checkpoint ensures consistent project memory maintenance and provides clear session documentation for future reference.
