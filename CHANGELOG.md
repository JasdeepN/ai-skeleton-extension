# Changelog

## 0.1.15 - 2025-12-03

### Fixed
- Removed all hardcoded version references from README footer and installation instructions
- Updated marketplace install command to use correct publisher (JasdeepN)

## 0.1.14 - 2025-12-03

### Changed
- **Publisher Correction**: Changed publisher back to `JasdeepN` to match GitHub username
- Extension now published under `JasdeepN.ai-skeleton-extension` on VS Code Marketplace

## 0.1.13 - 2025-12-03

### Changed
- Updated README with marketplace installation instructions as primary method
- Enhanced documentation with correct marketplace links and install commands

## 0.1.12 - 2025-12-03

### Fixed
- **Marketplace Publishing**: Resolved display name conflict
  - Changed displayName from "AI Skeleton - Memory & Prompts" to "AI Skeleton Prompts & Memory"
- Successfully published to VS Code Marketplace under JasdeepN4 publisher

## 0.1.11 - 2025-12-03

### Fixed
- **Marketplace Publishing**: Resolved extension name conflict
  - Changed package name from `ai-skeleton-prompts` to `ai-skeleton-extension`
  - Required due to name already taken on marketplace

## 0.1.10 - 2025-12-03

### Changed
- Initial marketplace publishing attempt under JasdeepN4 publisher
- Changed publisher from JasdeepN to JasdeepN4

## 0.1.9 - 2025-12-03

### Added
- **VS Code Marketplace Publishing**: Automated marketplace deployment via GitHub Actions
  - Release workflow now publishes to both GitHub Releases and VS Code Marketplace
  - Requires VSCE_PAT secret with marketplace Personal Access Token
- First public marketplace release under JasdeepN publisher

## 0.1.8 - 2025-12-03

### Added
- **Automated GitHub Releases**: GitHub Actions workflow for VSIX packaging and releases
  - Triggered by version tags (v*)
  - Automatically builds, packages, and creates GitHub releases with VSIX attachment
  - Uses `scripts/package-vsix.js --noBump` for clean packaging

### Fixed
- README status line clarification: Extension works via VSIX on VS Code 1.95+
  - Removed misleading "Development tool" language
  - Clarified Extension Development Host (F5) is optional for development only
- GitHub Actions workflow npm configuration
  - Changed from `npm ci` to `npm install` (no package-lock.json)
  - Removed npm cache (incompatible with .gitignore policy)

### Verified
- Extension functionality confirmed in production VS Code (not just EDH)
- LM Tools appear correctly in agent mode and tool picker
- Stable LM Tools API works in VSIX distributions on VS Code 1.95+

## Unreleased (Post-0.1.15)

### Added
- **Enhanced Prompt System**:
  - Step 7 Cleanup & Archive workflow in Checkpoint prompt
    - Systematic temp file cleanup
    - Archive structure: `AI-Memory/archive/YYYY-MM-DD-<tag>/`
    - Organizes completed research/plans for audit trail
  - Comprehensive Initial Setup workflow in Startup prompt
    - 4-phase workspace analysis (Discovery, Architecture, Memory Init, Validation)
    - Creates complete productContext.md and systemPatterns.md on first run
    - Expected 5-10 minute thorough analysis for future productivity
  - Updated all prompts to use actual `aiSkeleton_*` LM Tools
    - Replaced generic `#MemoryManagement` references with concrete tool names
    - Instructions now reference: showMemory, updateContext, updateProgress, logDecision, updatePatterns, updateProjectBrief, markDeprecated

### Changed
- **100% Generic Prompts**: Removed all project-specific references
  - Eliminated Next.js, Cloudflare, R2, schema.org, Toronto/GTA examples
  - Replaced with generic equivalents (cloud storage, current stack, performance aspects)
  - Prompts now work for ANY project type: CLI, library, web, desktop, mobile, extension
  - No tech stack or domain assumptions

## 0.1.0 - 2025-12-01

### Added
- **Native Memory Management**: Full AI-Memory integration with Language Model Tools API
  - 7 memory tools: showMemory, logDecision, updateContext, updateProgress, updateSystemPatterns, updateProjectBrief, markDeprecated
  - Memory tree view with status indicator
  - Auto-detect and create memory bank on startup
- **Consolidated Memory Structure**: Renamed to AI-Memory with 5 files (projectBrief, activeContext, systemPatterns, decisionLog, progress)
- **MCP Integration**: One-click installation of 5 MCP servers (context7, sequential-thinking, filesystem, fetch, git)
  - Auto-reload window after MCP installation to enable servers immediately
- **Automated Build Pipeline**: 
  - `npm run embed-prompts` - Auto-encode prompts from source
  - `npm run embed-agents` - Auto-encode agents and protected files
  - `npm run build` - Full build with embedding + compilation
- **New Prompts**: Added Sync.prompt.md for memory-codebase synchronization
- **Updated Agent**: Memory-Deep-Thinking-Mode agent with AI-Memory references

### Changed
- Renamed memory-bank to AI-Memory folder
- Updated all prompts and agents to reference AI-Memory
- Consolidated memory tools from 9 to 7 (merged productContext→projectBrief, architect→systemPatterns)
- Enhanced extension description and metadata

### Technical
- Source prompts in `prompts/` folder, auto-embedded into `promptStore.ts`
- Source agents in `agents/` folder, auto-embedded into `agentStore.ts`
- Protected files in `protected/` folder for .copilotignore and documentation
- Backward compatibility for both memory-bank and AI-Memory folder names

## 0.0.1 - 2025-11-21

### Initial Release
- Initial scaffold
- Embedded prompt set (Checkpoint, Execute, GH Actions, Plan, Startup, Think)
- Tree view + commands + status bar integration
- Workspace override logic
