---
description: Startup prompt for new chat sessions
---

# Startup Prompt

**⚠️ CRITICAL: THIS FILE IS READ-ONLY ⚠️**
**DO NOT MODIFY THIS PROMPT FILE. It is a template for agent workflows.**
**All work, plans, and context must be saved to AI-Memory/, NOT here.**


[New Task Or Continuing Session?]

## Instructions for Every New Chat

**Step 1: Determine Session Type**
- Ask whether this is a new task or continuation of a previous session.
- Check if AI-Memory exists and is populated.
- Check if MCPs are enabled; if not, enable them.

**Step 2: Route to Appropriate Workflow**
- If AI-Memory is empty or doesn't exist → Execute **Initial Setup** workflow
- If AI-Memory exists with content → Execute **Continuing Session** workflow
- If user explicitly requests new task → Execute **New Task** workflow

---

## Initial Setup Workflow (First Time in Workspace)

**This is a comprehensive onboarding process. Take your time and be thorough.**

### Phase 1: Workspace Discovery & Analysis

1. **Scan Repository Structure**
   ```bash
   # Get complete directory tree
   find . -type f -name "*.json" -o -name "*.md" -o -name "*.ts" -o -name "*.js" | head -100
   ls -la
   ```
   - Identify project type (extension, web app, library, CLI tool, etc.)
   - Map directory structure (common patterns: `src/`, `lib/`, `dist/`, `test/`, etc.)
   - Locate configuration files (package.json, tsconfig.json, etc.)
   - Find documentation (README.md, CONTRIBUTING.md, docs/)

2. **Read Core Documentation**
   - Read README.md thoroughly - understand purpose, features, usage
   - Read package.json - identify dependencies, scripts, metadata
   - Read CONTRIBUTING.md or similar if present
   - Check for existing architecture docs in docs/ or .github/

3. **Analyze Code Structure**
   - Identify entry points (main.ts, index.ts, extension.ts, etc.)
   - Map module organization and folder patterns
   - Identify key frameworks/libraries in use
   - Understand build/test/deploy tooling
   - Note any configuration patterns (env vars, settings, etc.)

4. **Technology Stack Inventory**
   - Programming language(s) and versions
   - Frameworks and major libraries
   - Build tools (webpack, vite, esbuild, tsc, rollup, etc.)
   - Testing frameworks (jest, vitest, mocha, pytest, etc.)
   - Development tools (ESLint, Prettier, formatters, linters, etc.)
   - Deployment/CI/CD (GitHub Actions, GitLab CI, Jenkins, etc.)

### Phase 2: Architecture & Pattern Analysis

1. **Identify Architectural Patterns**
   - Overall architecture style (MVC, plugin-based, microservices, etc.)
   - Code organization patterns (feature-based, layer-based, etc.)
   - Design patterns in use (factory, singleton, observer, etc.)
   - State management approach (if applicable)
   - Data flow patterns

2. **Document System Patterns**
   - File/folder naming conventions
   - Import/export patterns
   - Error handling approach
   - Logging and debugging patterns
   - Testing patterns and conventions
   - Configuration management patterns

3. **Identify Integration Points**
   - External APIs or services
   - Database or storage systems
   - Third-party libraries and their purposes
   - Platform-specific APIs (if applicable)
   - Runtime environment integrations

### Phase 3: Memory Bank Initialization

**Use `aiSkeleton_*` tools to create comprehensive initial memories:**

1. **Create productContext.md**
   ```
   aiSkeleton_updateProjectBrief {
     "briefUpdate": "
       # Project Brief
       
       ## Project Overview
       [Comprehensive description from README and code analysis]
       
       ## Purpose & Goals
       - [Primary purpose]
       - [Key objectives]
       - [Target users/audience]
       
       ## Core Features
       - [Feature 1 with description]
       - [Feature 2 with description]
       ...
       
       ## Technical Stack
       - **Language**: [Language + version]
       - **Framework**: [Framework + version]
       - **Key Libraries**: [List major dependencies]
       - **Build Tools**: [Build toolchain]
       - **Testing**: [Test framework]
       - **Deployment**: [Deployment method]
       
       ## Project Structure
       - [Key directories and their purposes]
       
       ## Development Workflow
       - [Build command]
       - [Test command]
       - [Deploy process]
       
       ## Constraints & Requirements
       - [Technical constraints]
       - [Performance requirements]
       - [Compatibility requirements]
     "
   }
   ```

2. **Create systemPatterns.md**
   ```
   aiSkeleton_updatePatterns {
     "pattern": "Initial Architecture",
     "context": "
       # System Patterns
       
       ## Architectural Patterns
       - [High-level architecture description]
       - [Module organization approach]
       - [Dependency management strategy]
       
       ## Design Patterns
       - [Pattern 1: Description and usage]
       - [Pattern 2: Description and usage]
       
       ## Code Conventions
       - [Naming conventions]
       - [File organization rules]
       - [Import/export patterns]
       - [Error handling patterns]
       - [Testing patterns]
       
       ## Common Idioms
       - [Project-specific patterns]
       - [Utility usage patterns]
       - [Configuration patterns]
     "
   }
   ```

3. **Set Initial Context**
   ```
   aiSkeleton_updateContext "Initial workspace setup complete. Ready for development work."
   ```

4. **Initialize Progress Tracking**
   ```
   aiSkeleton_updateProgress "Setup complete: Memory bank initialized with project context and patterns"
   ```

5. **Log Initial Setup Decision**
   ```
   aiSkeleton_logDecision {
     "decision": "Completed initial workspace analysis and memory setup",
     "rationale": "Analyzed [X] files, documented [Y] patterns, mapped [Z] dependencies. Foundation established for productive work."
   }
   ```

### Phase 4: Validation & Summary

1. **Verify Memory Completeness**
   - [ ] productContext.md contains comprehensive project overview
   - [ ] systemPatterns.md documents all major patterns
   - [ ] Technical stack fully documented
   - [ ] Project structure mapped
   - [ ] No critical gaps in understanding

2. **Generate Setup Summary**
   ```markdown
   ## Initial Setup Summary
   
   ### Project Identified
   - Type: [Extension/App/Library/etc.]
   - Name: [Project name]
   - Purpose: [Brief purpose]
   
   ### Analysis Completed
   - Files analyzed: [Count]
   - Directories mapped: [Count]
   - Patterns documented: [Count]
   - Dependencies cataloged: [Count]
   
   ### Memory Initialized
   - ✓ productContext.md created
   - ✓ systemPatterns.md created
   - ✓ activeContext.md initialized
   - ✓ progress.md initialized
   - ✓ decisionLog.md initialized
   
   ### Ready For
   - Feature development
   - Bug fixes
   - Refactoring
   - Testing
   - Documentation
   
   **Status**: Workspace fully analyzed. Ready for productive work.
   ```

3. **Print Completion Message**
   ```
   [MEMORY BANK: ACTIVE]
   
   Initial setup complete! I've analyzed the workspace and initialized memory bank.
   
   Ready for new instructions.
   ```

---

## New Task Checklist (Memory Exists, New Work)

1. **Load Current State**
   ```
   aiSkeleton_showMemory
   ```
   - Read productContext.md - understand project scope
   - Read systemPatterns.md - understand architecture
   - Read activeContext.md - check for ongoing work

2. **Clear Active Context**
   ```
   aiSkeleton_updateContext "New task: [briefly describe if known]. Previous context cleared."
   ```

3. **Archive Previous Work (if any)**
   - Move any in-progress research/plans to archive
   - Clean up temporary files
   - Reset progress.md for new work

4. **Report Readiness**
   ```
   [MEMORY BANK: ACTIVE]
   
   Current project: [Project name from productContext]
   Architecture: [Brief architecture summary]
   Previous work: [Summary of last completed work]
   
   Ready for new instructions.
   ```

---

## Continuing Session Checklist (Resume Previous Work)

1. **Load Complete Context**
   ```
   aiSkeleton_showMemory
   ```
   - Read all memory files in order:
     1. productContext.md
     2. activeContext.md
     3. systemPatterns.md
     4. decisionLog.md
     5. progress.md

2. **Analyze Current State**
   - Identify in-progress tasks from progress.md
   - Check for blockers in activeContext.md
   - Review recent decisions from decisionLog.md
   - Understand current focus area

3. **Report Session Context**
   ```
   [MEMORY BANK: ACTIVE]
   
   Project: [Project name]
   Last session: [Summary of last work]
   
   Current tasks:
   - [In-progress task 1]
   - [In-progress task 2]
   
   Blockers: [List blockers or "None"]
   
   Ready to continue. What would you like to work on?
   ```

---

## Important Notes

**Initial Setup is Critical:**
- First-time setup should be thorough and comprehensive
- Take time to understand the codebase deeply
- Document everything you discover
- Ask clarifying questions if architecture is unclear
- This investment pays off in all future sessions

**Don't Rush:**
- Initial setup may take 5-10 minutes of analysis
- This is expected and valuable
- Thorough understanding prevents mistakes later
- Complete memory enables faster execution in future

**When in Doubt:**
- If unsure whether memory exists, check for AI-Memory/ directory
- If memory seems incomplete, re-run initial setup
- If memory seems stale, consider running Sync.prompt.md

---

**Tip:** You can always ask for a summary of the current context, memory, or workflow at any time.

This prompt ensures every session starts with proper context and orientation, enabling productive work from the first interaction.
