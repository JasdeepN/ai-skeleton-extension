# project Brief

[BRIEF:2025-12-05] AI-Memory initialized

[BRIEF:2025-12-05] ## AI Skeleton Extension

**Version:** 0.1.28  
**Repository:** https://github.com/JasdeepN/ai-skeleton-extension  
**Publisher:** JasdeepN (VS Code Marketplace)

### Product Overview
Complete AI agent toolkit providing native memory management (AI-Memory), workflow prompts, MCP integration, and agent definitions. Enables structured, stateful AI interactions in VS Code with persistent knowledge graphs backed by SQLite.

### Core Features
1. **AI-Memory (SQLite-backed)**: Native memory management with database storage
   - 5 core memory files: projectBrief, activeContext, systemPatterns, decisionLog, progress
   - SQLite backend (sql.js WebAssembly + optional better-sqlite3 native)
   - Migration/export scripts for markdown ↔ SQLite conversion
   - 138 unit tests with comprehensive coverage
   
2. **Workflow Prompts**: 7 structured prompts for agent workflows
   - Think, Plan, Execute, Checkpoint, Sync, Startup, GH (GitHub)
   - Embedded directly in extension (no external dependencies)
   
3. **Agent Definitions**: 3 specialized agents with tool restrictions
   - memory-prompt (execution agent with edit tools)
   - memory-mcp-research (research agent, read-only)
   - memory-deep-think (analysis agent, read-only)
   
4. **MCP Integration**: Auto-start MCP servers from .vscode/mcp.json
5. **Protected Files**: GUARDRAILS.md system for AI safety restrictions
6. **Setup Dialog**: Smart detection and installation of all components

### Technical Stack
- **Language**: TypeScript 5.7.2
- **Runtime**: Node.js 18.x/20.x
- **Database**: sql.js 1.12.0 (WebAssembly SQLite), optional better-sqlite3
- **Testing**: Jest 29.7.0, @vscode/test-electron 2.5.2, c8 coverage
- **Build**: TypeScript compiler, vsce packaging
- **CI/CD**: GitHub Actions (6-platform matrix)
- **VS Code API**: 1.95.0+

### Release Strategy
- **Development**: db branch for testing, main for stable
- **Minor Releases**: Manual workflow trigger (minor-release.yml)
- **Critical Patches**: Emergency workflow (critical-patch.yml)
- **Stable Releases**: Promote pre-release to stable (stable-release.yml)

[BRIEF:2025-12-05] [BRIEF:2025-12-05] Coverage/Codecov investigation: CI test workflow runs c8 via `npm run test:coverage` and uploads using codecov/codecov-action@v4 only on ubuntu-latest Node 20. Release workflows auto-commit with `[skip ci]` and do not run tests or coverage upload, so latest main commits (release bumps) lack coverage, causing Codecov badge to show 0%. Codecov action also lacks explicit coverage file path and OIDC permissions; if CODECOV_TOKEN is unset uploads may silently fail (`fail_ci_if_error: false`).

[BRIEF:2025-12-05] 

[BRIEF:2025-12-05] **Version Updated:** Now at v0.1.32 on main (bumped by pre-release workflow). Package.json version reflects latest pre-release from automated patch bumps.
