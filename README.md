# AI Skeleton Prompts & Memory

[![CI Tests](https://github.com/JasdeepN/ai-skeleton-extension/actions/workflows/test.yml/badge.svg)](https://github.com/JasdeepN/ai-skeleton-extension/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/JasdeepN/ai-skeleton-extension/branch/main/graph/badge.svg)](https://codecov.io/gh/JasdeepN/ai-skeleton-extension)

**Complete AI agent toolkit for VS Code**: Native memory management, workflow prompts, MCP integration, and agent definitions.

## 🎯 Purpose

This extension extends **Copilot agent** context and memory capabilities by providing:

1. **AI-Memory Tools** - 7 Language Model Tools that agents can invoke autonomously
2. **Workflow Prompts** - Structured prompts for Think → Plan → Execute workflows
3. **MCP Integration** - Easy installation of Model Context Protocol servers
4. **Agent Definitions** - Pre-configured agent modes (Memory & Deep Thinking)

## 📦 Installation

### Requirements

- **VS Code:** 1.95.0 or newer (for Language Model Tools API)
- **License:** Proprietary — see LICENSE (explicit written approval required)

### Install from VS Code Marketplace (Recommended)

1. Search "AI Skeleton" in VS Code Extensions
2. Click Install on "AI Skeleton Prompts & Memory" by JasdeepN

Or install via command line:
```bash
code --install-extension JasdeepN.ai-skeleton-extension
```

### Install from VSIX

1. Download latest `.vsix` from [releases](https://github.com/JasdeepN/ai-skeleton-extension/releases)
2. In VS Code: Extensions → `...` menu → "Install from VSIX..."
3. Select the downloaded `.vsix` file
4. Reload VS Code

### Verify Installation

Run command: `AI Skeleton: List Registered LM Tools`

You should see 7 registered tools including `showMemory`, `logDecision`, `updateContext`, etc.

## 🚀 Quick Start

### 1. Install Agent Assets

Run command:
```
AI Skeleton: Install All
```

This installs:
- Prompts to `.github/prompts/`
- Agents to `.github/agents/`
- Protected files to `.github/`
- MCP configuration to `.vscode/mcp.json`

Tip: After installing MCP config, you can auto-start MCP servers on startup. See Settings → `AI Skeleton: MCP Auto Start`.

### 2. Verify Memory Tools

In Copilot chat, type `#` and you should see the memory tools appear in the picker:
- `#showMemory` - Read AI-Memory contents
- `#logDecision` - Log decisions
- `#updateContext` - Update active context
- And 4 more...

### 3. Use Agent Mode

Switch to agent mode in Copilot and select the Memory & Deep Thinking agent from `.github/agents/`.




## 📦 Features

### 1. AI-Memory Tools (Language Model Tools)

Agents can autonomously invoke these tools on VS Code 1.95+:

| Tool | Purpose | Parameters |
|------|---------|------------|
| `aiSkeleton_showMemory` | Read memory bank contents | `fileType` (optional): "all", "activeContext", "decisionLog", etc. |
| `aiSkeleton_logDecision` | Log architectural/technical decisions | `decision`, `rationale` |
| `aiSkeleton_updateContext` | Update active working context | `contextUpdate` |
| `aiSkeleton_updateProgress` | Track task progress | `item`, `status` ("done", "doing", "next") |
| `aiSkeleton_updatePatterns` | Record system patterns/conventions | `pattern`, `context` |
| `aiSkeleton_updateProjectBrief` | Update project goals/scope | `briefUpdate` |
| `aiSkeleton_markDeprecated` | Mark items deprecated without deletion | `item`, `reason`, `replacement` |

**Example Agent Usage:**
```typescript
// Agent automatically invokes:
aiSkeleton_logDecision({
  decision: "Use TypeScript for type safety",
  rationale: "Catches errors at compile time"
})

aiSkeleton_updateProgress({
  item: "Implement user authentication",
  status: "done"
})
```

### 2. Memory Bank Structure

```
AI-Memory/
├── activeContext.md      # Current work focus
├── decisionLog.md        # Architectural decisions
├── progress.md           # Task tracking (done/doing/next)
├── systemPatterns.md     # Code patterns/conventions
└── projectBrief.md       # Project goals/context
```

### 3. Workflow Prompts

Embedded (baked) versions of:
- **Think.prompt.md** - Deep research and analysis
- **Plan.prompt.md** - Task breakdown and planning
- **Execute.prompt.md** - Implementation guidance
- **Checkpoint.prompt.md** - Progress review
- **Sync.prompt.md** - Memory-codebase synchronization
- **GH.prompt.md** - GitHub Actions workflows
- **Startup.prompt.md** - Session initialization

Optional workspace override: if your repository has `.github/prompts/*.prompt.md` files they will automatically be used (when `aiSkeleton.prompts.source` = `auto` or `workspace`).

### 4. Memory & Deep Thinking Agent

Pre-configured agent mode (`memory-deep-think.agent.md`) with:
- Autonomous memory updates
- Structured reasoning workflows
- MCP tool integration
- Tagged entry system for efficient scanning (`[TYPE:YYYY-MM-DD]` format)

### 5. Visual Interface

- **Memory Bank Tree View**: Visual browser for `AI-Memory/` files in Explorer
- **AI Skeleton Prompts Tree View**: Browse and interact with embedded prompts
- **Memory Status Bar**: Shows ACTIVE/INACTIVE status; click to create or view
- **Commands & Tools**: Both manual commands and agent-invokable tools available

## 🛠️ Usage

### Creating Memory Bank

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run: `AI Skeleton: Create Memory Bank`
3. Select workspace folder
4. Memory bank files created in `AI-Memory/`

### Installing Prompts & Agents

```
Command Palette → AI Skeleton: Install All
```

Installs to `.github/prompts/` and `.github/agents/` in your workspace.

### Agent Memory Integration

On VS Code 1.95+, agents can autonomously use memory tools. Use Extension Development Host (F5) for development/debugging if needed:

```yaml
# .github/agents/memory-deep-think.agent.md
tools:
  - aiSkeleton_showMemory
  - aiSkeleton_logDecision
  - aiSkeleton_updateContext
  - aiSkeleton_updateProgress
  - aiSkeleton_updatePatterns
  - aiSkeleton_updateProjectBrief
  - aiSkeleton_markDeprecated
```

Agent automatically invokes tools during conversation. No manual intervention needed.

## 📋 Commands

### Prompts
- `AI Skeleton: List Prompts` - Quick pick prompt browser
- `AI Skeleton: Save Prompt to File...` - Save to disk
- `AI Skeleton: Insert Prompt at Cursor` - Insert into editor
- `AI Skeleton: Copy Prompt to Clipboard` - Copy content
- `AI Skeleton: Install Built-in Prompts` - Install all to `.github/prompts`
- `AI Skeleton: Install Single Prompt` - Install one prompt

### Installation
- `AI Skeleton: Install Agent Templates` - Install to `.github/agents`
- `AI Skeleton: Install Protected Files` - Install to `.github/`
- `AI Skeleton: Install All` - One-click full setup
- `AI Skeleton: Install MCP Servers` - Add `.vscode/mcp.json` with recommended servers

### Memory Management (Manual)
- `AI Skeleton: Memory Bank Status` - Check/create memory bank
- `AI Skeleton: Create Memory Bank` - Initialize memory-bank folder
- `AI Skeleton: Show Memory Summary` - View all memory contents
- `AI Skeleton: Log Decision` - Record a decision
- `AI Skeleton: Update Context` - Update active context
- `AI Skeleton: Update Progress` - Track progress items
- `AI Skeleton: Update System Patterns` - Record patterns
- `AI Skeleton: List Registered LM Tools` - Verify agent tools availability

### MCP
- `AI Skeleton: Start MCP Servers` — Reads `.vscode/mcp.json` and starts configured command-based MCP servers in terminals

### Settings
- `aiSkeleton.mcp.autoStart` (boolean): Automatically start MCP servers on window startup. Prompts on first run per-workspace.
- `aiSkeleton.prompts.source`: `auto` | `embedded` | `workspace`

### Configuration
- `aiSkeleton.prompts.source`: `auto` | `embedded` | `workspace`

## 🤔 FAQ

### Why doesn't it work when I install the VSIX?

It should, provided you're on **VS Code 1.95+**. The Language Model Tools API is **stable** in these versions.

If tools don't appear in agent mode or the tool picker:
1. Verify VS Code version (Help → About): must be 1.95 or newer
2. Reload VS Code after installation
3. Run `AI Skeleton: List Registered LM Tools` to verify 7 tools are registered

### MCP server fails with `ModuleNotFoundError: pydantic_core`
Some systems load extra Python site-packages (e.g., from SDK toolchains) that clash with `uvx`-installed MCP servers. Run MCP servers with a clean Python env:

```
scripts/uvx-clean.sh mcp-server-git --help
scripts/uvx-clean.sh mcp-server-git -r /path/to/repo
scripts/uvx-clean.sh mcp-server-fetch --help
```

The wrapper unsets `PYTHONPATH` and enables `PYTHONNOUSERSITE=1`, preventing conflicting site-packages from being injected.

### Can I use this without the extension?

Yes! The prompts and agents work standalone:
- Copy `.github/prompts/` and `.github/agents/` to your project
- Agents can still read/write `AI-Memory/` files via filesystem MCP
- The extension adds enhanced UX and autonomous tool invocation

### What about production use?

For production VSIX distribution, you would need:
1. Publish to VS Code Marketplace
2. Request proposed API access from Microsoft
3. Get publisher ID allowlisted

Or, use the file-based approach (agents read/write memory files directly via MCP filesystem tool).

### How do I know if tools are available?

Run command: `AI Skeleton: List Registered LM Tools`

Expected: 7 tools registered (`showMemory`, `logDecision`, `updateContext`, `updateProgress`, `updatePatterns`, `updateBrief`, `markDeprecated`).

## 🔧 Development

### Building

```bash
npm install
npm run build  # Embeds assets + compiles TypeScript
```

Press F5 in VS Code to launch an Extension Development Host and test the extension.

### Packaging

```bash
npm run package:vsix
# or
node scripts/package-vsix.js
```

Automated versioning: auto-bumps patch version (0.0.1) if unchanged since last package.

### Project Structure

```
ai-skeleton-extension/
├── src/
│   ├── extension.ts          # Main activation
│   ├── memoryTools.ts         # LM Tools registration (7 tools)
│   ├── memoryService.ts       # Core memory operations
│   ├── promptStore.ts         # Embedded prompts (auto-generated)
│   ├── agentStore.ts          # Embedded agents (auto-generated)
│   └── mcpStore.ts            # MCP configurations
├── agents/
│   └── memory-deep-think.agent.md  # Agent definition (source)
├── prompts/
│   ├── Think.prompt.md
│   ├── Plan.prompt.md
│   └── Execute.prompt.md
│   └── ...
├── scripts/
│   ├── embed-prompts.js       # Build-time embedding
│   ├── embed-agents.js        # Build-time embedding
│   └── package-vsix.js        # Auto-versioning packager
└── package.json               # Extension manifest
```

## 📖 Documentation

- **[INSTALLATION.md](./INSTALLATION.md)** - Setup guide and troubleshooting
- **[LANGUAGE_MODEL_TOOLS_FIX.md](./LANGUAGE_MODEL_TOOLS_FIX.md)** - Technical details on LM Tools API
- **[ARCHITECTURE_v0.1.3.md](./ARCHITECTURE_v0.1.3.md)** - Command-based architecture attempt (deprecated)
- **[memory-bank/decisionLog.md](../../memory-bank/decisionLog.md)** - Full decision history

## 🧪 Testing

Quick CLI checks:

```bash
npm install
npm run build  # Full build with asset embedding
npm run verify # Verify embedded prompts
```

Manual interactive tests (in VS Code):

1. Open repository in VS Code (`ai-skeleton-extension` folder)
2. Press `F5` to start Extension Development Host
3. In the new window:
   - Check Status Bar for `AI Prompts: N` and `Memory: ACTIVE/INACTIVE`
   - Run `AI Skeleton: List Registered LM Tools` → verify 7 tools
   - Expand `AI Skeleton Prompts` in Explorer
   - Create Memory Bank → Log Decision → Show Summary
   - Test agent integration with Copilot chat

## 📝 Memory Management Rules (Enforced)

- **Never delete** from memory files - only append new entries
- **Tag all entries** with `[TYPE:YYYY-MM-DD]` format for efficient scanning
- **Timestamp everything** automatically
- **Read selectively**: Use tags/timestamps to scan only recent/relevant entries

## 📄 License

Proprietary. See `LICENSE`. Usage requires explicit written approval by the publisher.

## 🙏 Credits

Built for agent-assisted development workflows. Uses VS Code's Language Model Tools API for seamless agent integration.

---

**Marketplace**: [JasdeepN.ai-skeleton-extension](https://marketplace.visualstudio.com/items?itemName=JasdeepN.ai-skeleton-extension)  
**Install**: `code --install-extension JasdeepN.ai-skeleton-extension`  
**Status**: Production-ready on VS Code 1.95+
