# Changelog

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
