# AI Skeleton Extension - Quick Reference

## Installation

```bash
# Install VSIX
code --install-extension ./vsix/ai-skeleton-prompts-0.1.8.vsix

# Reload window (REQUIRED)
# Ctrl+Shift+P → "Developer: Reload Window"
```

## Verification

```bash
# Open command palette (Ctrl+Shift+P) and run:
AI Skeleton: List Registered LM Tools
```

Expected: 7 tools listed:
- aiSkeleton_showMemory
- aiSkeleton_logDecision
- aiSkeleton_updateContext
- aiSkeleton_updateProgress
- aiSkeleton_updatePatterns
- aiSkeleton_updateProjectBrief
- aiSkeleton_markDeprecated

## Setup in New Workspace

```bash
# 1. Install all assets
Command: AI Skeleton: Install All

# 2. Create memory bank
Command: AI Skeleton: Create Memory Bank

# 3. Install MCPs (optional)
Command: AI Skeleton: Install MCP Servers

# 4. Start MCP servers (optional)
Command: AI Skeleton: Start MCP Servers

# 4. Reload window
Ctrl+Shift+P → "Developer: Reload Window"

# 5. Verify tools still registered
Command: AI Skeleton: List Registered LM Tools
```

## Test Agent

```
Copilot Chat → @memory-deep-think
"Use aiSkeleton_showMemory to read AI-Memory"
```

Expected: Tool executes successfully, no errors.

## Troubleshooting

### "Unknown tool" errors

1. Ensure VS Code >= 1.95.0
2. Ensure extension version >= 0.1.8
3. Reload window
4. Check Developer Tools console for errors

### Tools not listed

1. Uninstall extension
2. Install v0.1.8 VSIX
3. Reload window
4. Run "List Registered LM Tools"

### Tools disappear after MCP install

**Fixed in v0.1.2** - This was caused by missing API proposals.

If still experiencing:
1. Verify extension version: `code --list-extensions --show-versions | grep ai-skeleton`
2. Should show: `JasdeepN.ai-skeleton-prompts@0.1.8`
3. If not, reinstall v0.1.2

## Key Commands

### Setup
- `AI Skeleton: Install All` - One-click setup
- `AI Skeleton: Install MCP Servers` - Configure MCP tools
- `AI Skeleton: Create Memory Bank` - Initialize AI-Memory

### Verification
- `AI Skeleton: List Registered LM Tools` - Check tool registration
- `AI Skeleton: Memory Bank Status` - Check memory status

### Memory Management
- `AI Skeleton: Show Memory Summary` - View all memory
- `AI Skeleton: Log Decision` - Record decision
- `AI Skeleton: Update Context` - Update working context
- `AI Skeleton: Update Progress` - Track tasks

## File Structure After Setup

```
workspace/
├── .github/
│   ├── prompts/            # 7 workflow prompts
│   ├── agents/             # memory-deep-think.agent.md
│   ├── .copilotignore      # Protection rules
│   └── PROTECTED_FILES.md
├── .vscode/
│   └── mcp.json            # MCP servers (if installed)
└── AI-Memory/              # Memory bank (if created)
    ├── activeContext.md
    ├── decisionLog.md
    ├── progress.md
    ├── systemPatterns.md
    └── projectBrief.md
```

## Documentation

- **Setup:** [INSTALLATION.md](./INSTALLATION.md)
- **Technical:** [LANGUAGE_MODEL_TOOLS_FIX.md](./LANGUAGE_MODEL_TOOLS_FIX.md)
- **Release:** [RELEASE-v0.1.2.md](./RELEASE-v0.1.2.md)

## Requirements

- **VS Code:** >= 1.95.0
- **Reason:** Language Model Tools API (stable)

## Support

If tools show as "unknown":
1. Check VS Code version: `code --version`
2. Check extension version: `code --list-extensions --show-versions`
3. Review console: `Help > Toggle Developer Tools`
4. See [LANGUAGE_MODEL_TOOLS_FIX.md](./LANGUAGE_MODEL_TOOLS_FIX.md)
