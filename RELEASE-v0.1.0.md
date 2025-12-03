# AI Skeleton Extension v0.1.0 Release

**Package:** ai-skeleton-prompts-0.1.0.vsix (62KB)
**Release Date:** December 1, 2025

## Installation

```bash
code --install-extension ai-skeleton-prompts-0.1.0.vsix
```

Or via VS Code:
1. Extensions → Views and More Actions (⋯) → Install from VSIX...
2. Select `ai-skeleton-prompts-0.1.0.vsix`

## What's New

### 🧠 Native Memory Management
- **AI-Memory** folder with 5 consolidated files:
  - `projectBrief.md` - Project overview and goals
  - `activeContext.md` - Current focus and blockers
  - `systemPatterns.md` - Architecture and patterns
  - `decisionLog.md` - Timestamped decisions
  - `progress.md` - Task tracking (Done/Doing/Next)
- **7 Language Model Tools** for Copilot agents
- **Tree view** with memory status indicator
- **Auto-detection** on startup with creation prompt

### 🔌 MCP Integration
- One-click installation of 5 MCP servers:
  - `context7` - Library documentation
  - `sequential-thinking` - Structured reasoning
  - `filesystem` - File operations
  - `fetch` - Web content retrieval
  - `git` - Repository management

### 📝 Prompts & Agents
- **7 Workflow Prompts**: Checkpoint, Execute, GH, Plan, Startup, Sync, Think
- **Updated Agent**: Memory-Deep-Thinking-Mode with AI-Memory support
- All references updated from `memory-bank/` to `AI-Memory/`

### 🛠 Developer Experience
- **Automated build pipeline**: `npm run build`
- Source prompts in `prompts/` folder
- Source agents in `agents/` folder
- Auto-encoding on build

## Features

### Commands
- `AI Skeleton: Install All` - Install prompts, agents, and protected files
- `AI Skeleton: Open Prompt` - Browse and insert workflow prompts
- `AI Skeleton: Save Prompt As...` - Export prompts to custom location
- `AI Skeleton: Install Agents` - Install agent definitions
- `AI Skeleton: Install MCPs` - Configure MCP servers
- `AI Skeleton: Memory Bank Status` - Check memory status
- `AI Skeleton: Create Memory Bank` - Initialize AI-Memory folder
- `AI Skeleton: Show Memory` - View all memory files

### Language Model Tools (for Copilot Agents)
- `showMemory` - Retrieve memory contents
- `logDecision` - Log architectural decisions
- `updateContext` - Update current focus
- `updateProgress` - Track task completion
- `updateSystemPatterns` - Document patterns
- `updateProjectBrief` - Update project info
- `markDeprecated` - Mark outdated items

## Configuration

### Settings
- `aiSkeleton.prompts.source` - Prompt loading strategy (auto/embedded/workspace)
- `aiSkeleton.memory.autoStart` - Auto-detect memory on startup
- `aiSkeleton.memory.showWelcome` - Show welcome notification

### Memory Folder
The extension supports both:
- `AI-Memory/` (new, recommended)
- `memory-bank/` (legacy, still supported)

## Testing Checklist

- [ ] Install extension from VSIX
- [ ] Verify activation on startup
- [ ] Test "Install All" command
- [ ] Test Memory Bank creation
- [ ] Test opening prompts
- [ ] Test MCP installation
- [ ] Test Language Model Tools in Copilot chat
- [ ] Verify tree view displays correctly
- [ ] Test memory status indicator

## Known Issues
- None reported yet

## Upgrade from v0.0.1
If upgrading from v0.0.1:
1. Backup your `memory-bank/` folder
2. Install new version
3. Rename `memory-bank/` to `AI-Memory/`
4. Merge files:
   - `productContext.md` → `projectBrief.md`
   - `architect.md` → `systemPatterns.md`
5. Remove deprecated files

Or let the extension auto-create fresh AI-Memory structure.

## Support
For issues or questions, refer to the extension README or project documentation.

---
Built with ❤️ for AI-assisted development
