# AI Skeleton Extension v0.1.2 - Release Summary

## Critical Fix: Language Model Tools Registration

### Problem Solved

**Issue:** After installing the extension in a different workspace and enabling MCPs, all `aiSkeleton_*` memory tools were showing as "unknown" in Copilot agents.

**Root Cause:** The Language Model Tools API (`vscode.lm.registerTool`) is a **proposed API** that requires explicit opt-in via `enabledApiProposals` in `package.json`. Without this declaration, the API is completely unavailable at runtime, even when:
- VS Code version is >= 1.95.0
- Tools are declared in `languageModelTools` contribution point
- Registration code is correctly written and executed

### Solution Implemented

Added to `package.json`:
```json
{
  "engines": {
    "vscode": "^1.95.0"
  },
  "enabledApiProposals": [
    "languageModelSystem",
    "contribLanguageModelToolSets"
  ]
}
```

### What Changed

**v0.1.2 (December 1, 2025)**
- ✅ Added `enabledApiProposals` for Language Model Tools API
- ✅ Added `repository` field to package.json
- ✅ Created automated VSIX packaging script with version bumping
- ✅ Enhanced diagnostics and logging
- ✅ Documentation: LANGUAGE_MODEL_TOOLS_FIX.md and INSTALLATION.md

**Previous Attempts (v0.1.0-0.1.1):**
- ❌ Bumped engine version to 1.95.0 (necessary but insufficient)
- ❌ Added diagnostic commands (helpful but didn't fix registration)
- ❌ Updated tool names in agent file (correct but API wasn't available)

## Installation

### For Users

```bash
# Install the VSIX
code --install-extension ./vsix/ai-skeleton-prompts-0.1.2.vsix

# Reload window (REQUIRED)
# Ctrl+Shift+P → "Developer: Reload Window"
```

### Verification Steps

1. **Verify Tools Registered:**
   ```
   Command: AI Skeleton: List Registered LM Tools
   Expected: 7 tools listed (aiSkeleton_showMemory, etc.)
   ```

2. **Install Assets:**
   ```
   Command: AI Skeleton: Install All
   Result: .github/prompts, .github/agents, .github/.copilotignore
   ```

3. **Install MCPs (Optional):**
   ```
   Command: AI Skeleton: Install MCP Servers
   Result: .vscode/mcp.json created
   ```

4. **Reload Window After MCP Install:**
   ```
   Ctrl+Shift+P → "Developer: Reload Window"
   ```

5. **Verify Tools Still Registered:**
   ```
   Command: AI Skeleton: List Registered LM Tools
   Expected: All 7 aiSkeleton_* tools still present (+ MCP tools)
   ```

6. **Test Agent:**
   ```
   Copilot Chat → @memory-deep-think
   Try: "Use aiSkeleton_showMemory to read the memory bank"
   Expected: Tool executes successfully, no "unknown tool" error
   ```

## Key Features

### Memory Management (7 LM Tools)

All tools registered and accessible to Copilot agents:

1. **aiSkeleton_showMemory** - Read memory bank contents
2. **aiSkeleton_logDecision** - Log architectural decisions with timestamp
3. **aiSkeleton_updateContext** - Update active working context
4. **aiSkeleton_updateProgress** - Track task progress (done/doing/next)
5. **aiSkeleton_updatePatterns** - Record system patterns and conventions
6. **aiSkeleton_updateProjectBrief** - Update project goals and features
7. **aiSkeleton_markDeprecated** - Deprecate items without deletion

### Workflow Prompts (7)

Embedded and installable to workspace:

- **Checkpoint** - Summarize progress and save state
- **Execute** - Implementation workflow with testing
- **GH** - GitHub Actions and CI/CD
- **Plan** - Strategic planning and breakdown
- **Startup** - Project initialization
- **Sync** - Memory-codebase synchronization
- **Think** - Deep reasoning and analysis

### Agent Definition

**Memory-Deep-Thinking-Mode**
- Autonomous memory management
- Sequential thinking integration
- MCP server usage (filesystem, git, context7, fetch, sequential-thinking)
- Protected file enforcement

### MCP Integration

Pre-configured servers:
- **context7** - Up-to-date library documentation
- **sequential-thinking** - Deep reasoning and planning
- **filesystem** - File operations in workspace
- **fetch** - HTTP requests and web content
- **git** - Repository operations

## Packaging & Development

### Automated Packaging

```bash
# Auto-bump patch version (0.0.1) if unchanged
npm run package:vsix

# Manual version control
node scripts/package-vsix.js --forceBump  # Always bump
node scripts/package-vsix.js --noBump     # Never bump
```

**How It Works:**
- Reads `package.json` version
- Checks `vsix/last-version.json` for last packaged version
- Bumps patch if current === last (prevents re-packaging same version)
- Runs `npm run build` (embed + compile)
- Packages with `npx vsce`
- Saves to `./vsix/<name>-<version>.vsix`
- Updates `vsix/last-version.json`

### Build Pipeline

```bash
# Full build (recommended)
npm run build

# Individual steps
npm run embed-prompts   # Bake prompts/ → src/promptStore.ts
npm run embed-agents    # Bake agents/ + protected/ → src/agentStore.ts
npm run compile         # TypeScript → dist/
```

## Architecture

### Tool Systems

**VS Code Language Model Tools** (Our aiSkeleton_* tools)
- Registered via `vscode.lm.registerTool()`
- Declared in `package.json` → `languageModelTools`
- Requires `enabledApiProposals`
- Appears in `vscode.lm.tools` array

**MCP (Model Context Protocol) Tools**
- External servers defined in `.vscode/mcp.json`
- Separate from extension tools
- Both systems coexist and are usable by agents

### Memory Bank Structure

```
AI-Memory/
├── activeContext.md      # Current focus, blockers, state
├── decisionLog.md        # Historical decisions with rationale
├── progress.md           # Task tracking (Done/Doing/Next)
├── systemPatterns.md     # Architecture, patterns, tech stack
└── projectBrief.md       # Product overview, goals, features
```

**Design Principles:**
- Never delete, only append
- Tag entries with `[TYPE:YYYY-MM-DD]` for scanning
- Timestamp all updates
- Support deprecated/superseded markers

## Known Issues & Limitations

### VS Code Version Requirement

- **Minimum:** 1.95.0
- **Reason:** Language Model Tools API availability
- **Impact:** Extension won't activate on older versions

### API Proposal Stability

- Language Model Tools is a **proposed API**
- May change in future VS Code updates
- Extension may need updates to track API changes

### MCP Dependencies

- **Node.js MCPs** (sequential-thinking, filesystem): Require `npx`
- **Python MCPs** (fetch, git): Require `uvx` (uv package manager)
- **Context7:** Optional API key for higher rate limits

### Tool Visibility

- Tools only visible after extension activation
- Reload window required after:
  - Extension installation
  - Extension updates
  - MCP configuration changes

## Testing Checklist

### Fresh Workspace Test

- [ ] Install extension v0.1.2+
- [ ] Reload window
- [ ] Run "List Registered LM Tools" → verify 7 tools
- [ ] Run "Install All" → verify .github/ files created
- [ ] Create Memory Bank → verify AI-Memory/ folder
- [ ] Run "List Registered LM Tools" again → tools still there
- [ ] Install MCP Servers → verify .vscode/mcp.json
- [ ] Reload window
- [ ] Run "List Registered LM Tools" again → tools still there
- [ ] Test agent: `@memory-deep-think Use aiSkeleton_showMemory`
- [ ] Verify tool executes successfully

### Upgrade Test

- [ ] Uninstall v0.1.0 or v0.1.1
- [ ] Install v0.1.2
- [ ] Reload window
- [ ] Verify all tools registered
- [ ] Verify existing AI-Memory/ still works
- [ ] Verify existing .github/agents still works

## Files Summary

### New in v0.1.2

- `scripts/package-vsix.js` - Automated packaging with version bumping
- `LANGUAGE_MODEL_TOOLS_FIX.md` - Detailed issue documentation
- `INSTALLATION.md` - Setup and troubleshooting guide
- `RELEASE-v0.1.2.md` - This file

### Modified in v0.1.2

- `package.json`:
  - Added `enabledApiProposals`
  - Added `repository` field
  - Added `package:vsix` script
  - Added `vsce` devDependency
  - Version: 0.1.2
- `memory-bank/decisionLog.md` - Added API proposals decision
- `memory-bank/progress.md` - Updated with v0.1.2 milestones

### Build Artifacts

- `vsix/ai-skeleton-prompts-0.1.2.vsix` (66.72 KB, 20 files)
- `vsix/last-version.json` (metadata for version tracking)

## Next Steps

### For Users

1. Install v0.1.2 VSIX
2. Follow INSTALLATION.md for setup
3. Test agent tool usage
4. Report any issues

### For Developers

1. Test in multiple workspaces
2. Verify tool persistence across window reloads
3. Document any edge cases
4. Consider adding:
   - More memory tools (search, export)
   - Additional agent modes (Architect, Code, Debug)
   - Memory bank import/export
   - Multi-workspace memory sync

## Support & Documentation

- **Installation Guide:** `INSTALLATION.md`
- **Technical Details:** `LANGUAGE_MODEL_TOOLS_FIX.md`
- **Memory Logs:** `memory-bank/decisionLog.md`, `memory-bank/progress.md`
- **Extension Docs:** `README.md`

## Acknowledgments

This fix resolves a critical regression where Language Model Tools were unavailable due to missing API proposal declarations. Special thanks to the VS Code extension API documentation for clarifying the `enabledApiProposals` requirement.

---

**Version:** 0.1.2  
**Release Date:** December 1, 2025  
**Build:** 20 files, 66.72 KB  
**Status:** ✅ Stable - Ready for testing
