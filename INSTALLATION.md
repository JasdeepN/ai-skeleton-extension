# AI Skeleton Extension - Installation & Testing Guide

## Quick Install (VSIX)

Note: VSIX installation provides full functionality on VS Code 1.95+ (Language Model Tools API is stable). You may still use the Extension Development Host (F5) for development workflows.

### 1. Install the Extension

From the extension directory:

```bash
cd /home/admin/BASE_VSCODE/ai-skeleton-extension

# Install the latest VSIX
code --install-extension ./vsix/ai-skeleton-prompts-0.1.8.vsix
```

Or use VS Code UI:
- **Extensions** view → **...** menu → **Install from VSIX...**
- Select `./vsix/ai-skeleton-prompts-0.1.8.vsix`

### 2. Reload Window

**Required** after installation:
- `Ctrl+Shift+P` → **Developer: Reload Window**

Or:
- `Ctrl+R` (on Linux/Windows)
- `Cmd+R` (on macOS)

### 3. Verify Tools Registration

Run command:
```
AI Skeleton: List Registered LM Tools
```

Expected: Quick Pick showing 7 tools:
- aiSkeleton_showMemory
- aiSkeleton_logDecision
- aiSkeleton_updateContext
- aiSkeleton_updateProgress
- aiSkeleton_updatePatterns
- aiSkeleton_updateProjectBrief
- aiSkeleton_markDeprecated

If you do not see tools listed, ensure VS Code is 1.95+ and reload the window.

## Extension Development Host (Full Agent Integration)

The Language Model Tools API is stable in VS Code 1.95+. For development:

1. Open this extension folder in VS Code: `ai-skeleton-extension`
2. Press F5 (or Run → Start Debugging) to launch an Extension Development Host
3. In the Extension Development Host window, open your project workspace
4. Use the commands below to install assets and create the Memory Bank

You should see an "AI Skeleton" icon in the Activity Bar with a Diagnostics view. The status bar will show Memory: ACTIVE/INACTIVE and reflect Read/Write activity.

## Full Setup in a New Workspace

### Step 1: Create/Open Workspace

```bash
# Create a test workspace
mkdir -p ~/test-ai-skeleton
cd ~/test-ai-skeleton
code .
```

### Step 2: Install All Assets

Run command:
```
AI Skeleton: Install All (Prompts, Agents, Protected)
```

This installs:
- `.github/prompts/*.prompt.md` (7 workflow prompts)
- `.github/agents/memory-deep-think.agent.md` (agent definition)
- `.github/.copilotignore` & `.github/PROTECTED_FILES.md` (protection rules)

### Step 3: Install MCP Servers (Optional)

Run command:
```
AI Skeleton: Install MCP Servers (.vscode/mcp.json)
```

This installs MCP configuration to `.vscode/mcp.json` with:
- context7 (library documentation)
- sequential-thinking (deep reasoning)
- filesystem (file operations)
- fetch (web content)
- git (repository operations)

After installing MCP config, you can:
- Manually start MCP servers: `AI Skeleton: Start MCP Servers`
- Enable auto-start: Settings → `AI Skeleton: MCP Auto Start` (prompts on first run)

### Step 4: Create AI-Memory

Run command:
```
AI Skeleton: Create Memory Bank
```

Or it will auto-prompt on first activation if `aiSkeleton.memory.autoStart` is enabled (default: true).

This creates:
- `AI-Memory/activeContext.md`
- `AI-Memory/decisionLog.md`
- `AI-Memory/progress.md`
- `AI-Memory/systemPatterns.md`
- `AI-Memory/projectBrief.md`

### Step 5: Verify Setup

1. Check Memory Status:
   ```
   AI Skeleton: Memory Bank Status
   ```

2. List Tools (Extension Development Host only; should show 7 aiSkeleton_* tools + MCP tools if installed):
   ```
   AI Skeleton: List Registered LM Tools
   ```

3. Test agent:
   - Open Copilot Chat
   - Switch to **Memory-Deep-Thinking-Mode** agent
   - Try: `@memory-deep-think Use aiSkeleton_showMemory to show me the current memory bank`

## Troubleshooting

### "Unknown tool" errors

**Symptoms:**
- Agent reports `aiSkeleton_*` tools as unknown
- Tools not visible in "List Registered LM Tools"

**Solution:**
1. Ensure VS Code version is 1.95.0 or newer
2. Run in Extension Development Host (press F5). VSIX install will not expose LM tools to agents.
3. Reload window: `Ctrl+Shift+P` → **Developer: Reload Window**
4. Check Developer Tools console for errors:
   - `Help > Toggle Developer Tools`
   - Look for `[AI Skeleton]` log messages

### Tools disappear after MCP installation

If tools appear missing:
1. Verify you are running in Extension Development Host
2. Reload window **after** installing MCPs
3. Re-run `AI Skeleton: List Registered LM Tools`

### MCP servers not working

**Context7 API key:**
- Optional but recommended for higher rate limits
- Get key at https://context7.com/dashboard
- VS Code will prompt for key on first MCP use

**Python-based MCPs (fetch, git):**
- Require `uvx` (part of `uv` Python package manager)
- Install: `curl -LsSf https://astral.sh/uv/install.sh | sh`

**Node-based MCPs (sequential-thinking, filesystem):**
- Require `npx` (part of Node.js/npm)
- Should work if you have Node.js installed

## Development Workflow

### Building the Extension

```bash
cd /home/admin/BASE_VSCODE/ai-skeleton-extension

# Install dependencies
npm install

# Build (embeds assets + compiles TypeScript)
npm run build
```

### Packaging

```bash
# Auto-bump version if unchanged since last package
npm run package:vsix

# Force version bump
node scripts/package-vsix.js --forceBump

# Skip version bump
node scripts/package-vsix.js --noBump
```

Output: `./vsix/ai-skeleton-prompts-<version>.vsix`

### Testing Changes

1. Make code changes
2. Run `npm run build`
3. Run `npm run package:vsix`
4. Uninstall old version: `code --uninstall-extension your-publisher-name.ai-skeleton-prompts`
5. Install new VSIX: `code --install-extension ./vsix/ai-skeleton-prompts-<version>.vsix`
6. Reload window

### Diagnostics View

In Extension Development Host, expand the "AI Skeleton" container in the Activity Bar and open the Diagnostics view to verify:
- Environment: VS Code version, LM API availability
- Language Model Tools: Registration status of 7 aiSkeleton_* tools
- MCP: Presence of `.vscode/mcp.json`, and guidance for starting servers
- Agent Configuration: Presence of `.github/agents/memory-deep-think.agent.md`
- Prompts: Count of embedded and workspace prompts
- Memory Bank: Active/inactive, path, required files

## Files & Folders

### Extension Structure

```
ai-skeleton-extension/
├── src/                    # TypeScript source
│   ├── extension.ts        # Main activation & commands
│   ├── memoryService.ts    # Memory bank operations
│   ├── memoryTools.ts      # LM Tools registration
│   ├── memoryTreeProvider.ts
│   ├── promptStore.ts      # Auto-generated (embed-prompts)
│   ├── agentStore.ts       # Auto-generated (embed-agents)
│   ├── mcpStore.ts         # MCP configs
│   └── treeProvider.ts
├── prompts/                # Source workflow prompts
├── agents/                 # Source agent definitions
├── protected/              # Protected files (.copilotignore, etc.)
├── scripts/
│   ├── embed-prompts.js    # Bake prompts into code
│   ├── embed-agents.js     # Bake agents into code
│   └── package-vsix.js     # Auto-versioning packager
├── dist/                   # Compiled output
├── vsix/                   # Packaged extensions
│   ├── ai-skeleton-prompts-*.vsix
│   └── last-version.json
├── package.json
├── tsconfig.json
└── .vscodeignore
```

### Workspace After Install

```
your-workspace/
├── .github/
│   ├── prompts/            # Workflow prompts
│   ├── agents/             # Agent definitions
│   ├── .copilotignore      # Protection rules
│   └── PROTECTED_FILES.md  # Protection docs
├── .vscode/
│   └── mcp.json            # MCP server configs (if installed)
└── AI-Memory/              # Memory bank (if created)
    ├── activeContext.md
    ├── decisionLog.md
    ├── progress.md
    ├── systemPatterns.md
    └── projectBrief.md
```

## Commands Reference

### Prompts
- `AI Skeleton: List Prompts` - Browse and preview prompts
- `AI Skeleton: Open Prompt` - Open prompt in editor
- `AI Skeleton: Insert Prompt at Cursor` - Insert into active file
- `AI Skeleton: Copy Prompt to Clipboard`
- `AI Skeleton: Save Prompt to File...` - Export to workspace

### Installation
- `AI Skeleton: Install Built-in Prompts to Workspace (.github/prompts)`
- `AI Skeleton: Install Agent Templates to Workspace (.github/agents)`
- `AI Skeleton: Install Protected Files (.github)`
- `AI Skeleton: Install Single Prompt to Workspace (.github/prompts)`
- `AI Skeleton: Install All (Prompts, Agents, Protected)`
- `AI Skeleton: Install MCP Servers (.vscode/mcp.json)`
- `AI Skeleton: Start MCP Servers` — Starts command-based MCP servers defined in `.vscode/mcp.json`

### Memory Management
- `AI Skeleton: Memory Bank Status`
- `AI Skeleton: Create Memory Bank`
- `AI Skeleton: Show Memory Summary`
- `AI Skeleton: Log Decision`
- `AI Skeleton: Update Context`
- `AI Skeleton: Update Progress`
- `AI Skeleton: Update System Patterns`

### Diagnostics
- `AI Skeleton: List Registered LM Tools` - Verify tool registration (expect 7 tools on VS Code 1.95+)

## Configuration

### Settings

```jsonc
{
  // Prompt loading strategy
  "aiSkeleton.prompts.source": "auto", // "auto" | "embedded" | "workspace"
  
  // Auto-detect and offer to create Memory Bank on startup
  "aiSkeleton.memory.autoStart": true,
  
  // Show welcome notification when Memory Bank is active
   "aiSkeleton.memory.showWelcome": true,

   // Automatically start MCP servers on startup (prompts on first run)
   "aiSkeleton.mcp.autoStart": false
}
```

## Support

- Review Developer Tools console for error messages
- Ensure VS Code version >= 1.95.0
- Verify extension version >= 0.1.8
