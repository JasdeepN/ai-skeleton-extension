# AI Skeleton Extension - Language Model Tools Fix

## Problem

After installing the extension in a fresh workspace, the `aiSkeleton_*` tools were reported as "unknown" by Copilot agents, even though they were correctly registered and listed in the agent file.

### Root Cause

The **Language Model Tools API** (`vscode.lm.registerTool`) is a **proposed API** in VS Code, meaning:

1. It requires explicit opt-in via `enabledApiProposals` in `package.json`
2. Without this declaration, the API is unavailable at runtime
3. Even with engines >= 1.95.0, the API won't work unless proposals are enabled

## Solution

Added `enabledApiProposals` to `package.json`:

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

### Why Two Proposals?

- `languageModelSystem`: Core Language Model API access
- `contribLanguageModelToolSets`: Tool contribution and registration mechanisms

## Verification Steps

After installing the new VSIX (v0.1.2+):

### 1. Check Tool Registration

Run command: **AI Skeleton: List Registered LM Tools**

You should see all 7 tools:
- `aiSkeleton_showMemory`
- `aiSkeleton_logDecision`
- `aiSkeleton_updateContext`
- `aiSkeleton_updateProgress`
- `aiSkeleton_updatePatterns`
- `aiSkeleton_updateProjectBrief`
- `aiSkeleton_markDeprecated`

### 2. Verify in Agent

Open `.github/agents/memory-deep-think.agent.md` installed by the extension. The tools list should include all `aiSkeleton_*` tools alongside MCP tools.

### 3. Test Agent Usage

In a Copilot chat with the Memory-Deep-Thinking-Mode agent:

```
@memory-deep-think Use aiSkeleton_showMemory to read the current memory bank
```

The agent should successfully invoke the tool without "unknown tool" errors.

## MCP vs Language Model Tools

**Two separate tool systems:**

### MCP (Model Context Protocol) Tools
- Defined in `.vscode/mcp.json`
- External servers that provide tools (filesystem, git, context7, etc.)
- Installed via "AI Skeleton: Install MCP Servers"

### Language Model Tools (Extension-provided)
- Registered by VS Code extensions via `vscode.lm.registerTool`
- Declared in `package.json` under `languageModelTools`
- Our `aiSkeleton_*` memory tools use this mechanism

**Both can coexist** - agents can use MCP tools AND extension-provided LM tools together.

## Testing Checklist

- [ ] Install extension v0.1.2+
- [ ] Run "AI Skeleton: List Registered LM Tools" - verify 7 tools listed
- [ ] Install prompts/agents via "AI Skeleton: Install All"
- [ ] Install MCPs via "AI Skeleton: Install MCP Servers"
- [ ] Reload window
- [ ] Run "AI Skeleton: List Registered LM Tools" again - tools should still be there
- [ ] Test agent invoking `aiSkeleton_showMemory` - should succeed

## Packaging

Automated version bumping:

```bash
# Auto-bumps version by 0.0.1 if unchanged since last package
npm run package:vsix

# Force version bump
node scripts/package-vsix.js --forceBump

# Skip version bump
node scripts/package-vsix.js --noBump
```

Output: `./vsix/ai-skeleton-prompts-<version>.vsix`

## Files Changed

- `package.json`:
  - Added `enabledApiProposals`: `["languageModelSystem", "contribLanguageModelToolSets"]`
  - Added `repository` field
  - Version: 0.1.2
- `scripts/package-vsix.js`: New automated packaging script
- Memory logs updated with decision and progress entries

## Known Issues

If tools still show as "unknown":

1. Ensure VS Code is 1.95.0 or newer
2. Reload window after installing extension
3. Check Developer Tools console for errors: `Help > Toggle Developer Tools`
4. Verify proposals enabled: search for `enabledApiProposals` in extension's `package.json`

## Next Steps

- Test in a completely clean workspace
- Verify tools persist after MCP installation
- Confirm agent can invoke all memory tools
- Update documentation with setup instructions
