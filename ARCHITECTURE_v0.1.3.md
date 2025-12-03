# Architecture v0.1.3 - Command-Based Memory Tools

## Overview

Version 0.1.3 represents a **critical architectural shift** from the Language Model Tools API to a pure command-based approach. This change ensures the extension works in **all VS Code installations** without proposed API restrictions.

## Problem: Proposed API Restrictions

### What Went Wrong in v0.1.1 and v0.1.2

- Used `vscode.lm.registerTool()` to register memory tools for Copilot agents
- Added `enabledApiProposals: ["languageModelSystem", "contribLanguageModelToolSets"]` to package.json
- **Result**: Tools worked in Extension Development Host but showed as "unknown" when VSIX was installed in production environments

### Root Cause

The Language Model Tools API (`vscode.lm.*`) is a **PROPOSED API** that:
- Only works in Extension Development Host during development
- Only works for extensions with publisher IDs explicitly allowlisted by the VS Code team
- Does NOT work for regular VSIX installations, even with `enabledApiProposals` set

The `enabledApiProposals` mechanism is designed for **development and testing**, not for distributing extensions to end users.

## Solution: Stable Command Architecture

### Core Principle

**Use only stable VS Code APIs** that work universally in all installations:
- `vscode.commands.registerCommand()` - Stable since VS Code 1.0
- Agent's `runCommands` tool - Stable mechanism for agents to invoke extension commands

### How It Works

1. **Extension registers commands** (in `src/extension.ts`):
   ```typescript
   vscode.commands.registerCommand('aiSkeleton.memory.show', async () => {...})
   vscode.commands.registerCommand('aiSkeleton.memory.logDecision', async () => {...})
   // etc.
   ```

2. **Agents invoke commands via runCommands tool** (in `agents/memory-deep-think.agent.md`):
   ```markdown
   Use the `runCommands` tool to invoke extension commands:
   - `aiSkeleton.memory.show` - Display memory bank contents
   - `aiSkeleton.memory.logDecision` - Log a decision
   - `aiSkeleton.memory.updateContext` - Update active context
   ```

3. **No proposed APIs involved** - everything uses stable, documented VS Code APIs

## Changes Made in v0.1.3

### Code Changes

1. **memoryTools.ts** - Gutted LM Tools registration:
   ```typescript
   // Language Model Tools API is proposed/restricted
   // Agents now use runCommands tool to invoke VS Code commands
   export function registerMemoryTools(context: any): void {
     console.log('[AI Skeleton] Memory commands registered - agents use runCommands tool');
     // No LM Tools registration - commands only
   }
   ```

2. **extension.ts** - Removed diagnostic logging:
   - Removed vscode.lm.tools enumeration
   - Removed "unknown tool" warnings
   - Kept all command registrations (they work and are needed)

3. **package.json** - Cleaned up manifest:
   - Removed `languageModelTools` contribution section (~180 lines)
   - Removed `enabledApiProposals` array
   - Downgraded `engines.vscode` from `^1.95.0` to `^1.80.0`
   - Downgraded `@types/vscode` from `^1.95.0` to `^1.80.0`

4. **agents/memory-deep-think.agent.md** - Updated documentation:
   - Removed `aiSkeleton_*` tool names from tools array
   - Added "Memory Commands - Pure VS Code Integration" section
   - Documented runCommands usage with examples

### Package Results

- **Version**: 0.1.3
- **Size**: 77KB (increased from 67KB due to agent documentation)
- **Files**: 25
- **VS Code Compatibility**: 1.80.0+ (widest compatibility)
- **API Surface**: Stable commands only - works everywhere

## Benefits

1. **Universal Compatibility**: Works in any VS Code installation (local, remote, SSH, dev containers)
2. **No Special Permissions**: Doesn't require allowlisted publisher ID or proposed API access
3. **Simpler Architecture**: Direct command invocation is easier to understand and maintain
4. **Better Error Handling**: Commands can show UI dialogs and provide clear feedback
5. **Future-Proof**: Not dependent on proposed APIs that might change

## Command Reference

All memory commands are registered under the `aiSkeleton.memory.*` namespace:

| Command | Description |
|---------|-------------|
| `aiSkeleton.memory.showStatus` | Show memory bank status notification |
| `aiSkeleton.memory.show` | Display full memory bank contents |
| `aiSkeleton.memory.create` | Create new memory bank |
| `aiSkeleton.memory.logDecision` | Log a decision with rationale |
| `aiSkeleton.memory.updateContext` | Update active context |
| `aiSkeleton.memory.updateProgress` | Update progress tracking |
| `aiSkeleton.memory.updatePatterns` | Update system patterns |
| `aiSkeleton.memory.refresh` | Refresh memory tree view |

## Agent Integration

Agents use the stable `runCommands` tool to invoke memory commands:

```json
{
  "command": "aiSkeleton.memory.show"
}
```

The agent file documents autonomous usage patterns:
- Read memory at session start using `showMemory`
- Log decisions automatically using `logDecision`
- Update context when focus shifts using `updateContext`
- Update progress after completing tasks using `updateProgress`

## Testing v0.1.3

To verify the command-based approach works:

1. **Install VSIX** in a clean workspace:
   ```bash
   code --install-extension ./vsix/ai-skeleton-prompts-0.1.3.vsix
   ```

2. **Create Memory Bank**:
   - Open Command Palette (Ctrl+Shift+P)
   - Run "AI Skeleton: Create Memory Bank"

3. **Invoke from Agent**:
   - Open Copilot chat in agent mode (@workspace)
   - Agent should be able to use runCommands to invoke memory operations

## Lessons Learned

1. **Proposed APIs ≠ Production APIs**: Just because an API exists doesn't mean it can be used in distributed extensions
2. **enabledApiProposals is for development**: This mechanism is NOT a way to enable proposed APIs for end users
3. **Commands are universal**: When in doubt, use stable command registration - it works everywhere
4. **Read the fine print**: VS Code API documentation clearly states which APIs are proposed/stable
5. **Simpler is better**: The command approach is actually simpler than LM Tools registration

## Future Considerations

If VS Code's Language Model Tools API becomes stable (moves out of proposed):
- We could add it as an **optional enhancement**
- Keep command-based approach as fallback
- Use feature detection: `if (typeof vscode.lm?.registerTool === 'function')`
- This would provide best of both worlds: rich tool interfaces where available, universal compatibility everywhere

For now, **commands-only is the right architecture** for maximum compatibility and simplicity.

---

**Version**: 0.1.3  
**Date**: 2025-12-01  
**Status**: Stable, production-ready with universal compatibility
