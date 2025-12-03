// AI-Memory Service - Core memory management functionality
// Provides file operations for AI-Memory/*.md files with auto-detection and timestamps

import * as vscode from 'vscode';

export interface MemoryBankState {
  active: boolean;
  path: vscode.Uri | null;
  activity?: 'idle' | 'read' | 'write';
  files: {
    activeContext: boolean;
    decisionLog: boolean;
    systemPatterns: boolean;
    progress: boolean;
    projectBrief: boolean;
  };
}

export interface MemoryEntry {
  type: 'DECISION' | 'CONTEXT' | 'PROGRESS' | 'PATTERN' | 'BRIEF' | 'DEPRECATED' | 'SUPERSEDED';
  date: string; // ISO date YYYY-MM-DD
  content: string;
}

// Consolidated to 5 essential files (removed redundant architect.md and productContext.md)
const MEMORY_FILES = [
  'activeContext.md',   // Current session focus, blockers, state
  'decisionLog.md',     // Historical decisions with rationale
  'progress.md',        // Task tracking (Done/Doing/Next)
  'systemPatterns.md',  // Architecture, patterns, conventions, tech stack
  'projectBrief.md'     // Product overview, features, goals
] as const;

export type MemoryFileName = typeof MEMORY_FILES[number];

const FILE_KEY_MAP: Record<string, keyof MemoryBankState['files']> = {
  'activeContext.md': 'activeContext',
  'decisionLog.md': 'decisionLog',
  'systemPatterns.md': 'systemPatterns',
  'progress.md': 'progress',
  'projectBrief.md': 'projectBrief'
};

// Support both old 'memory-bank' and new 'AI-Memory' folder names
const FOLDER_NAMES = ['AI-Memory', 'memory-bank'];

export class MemoryBankService {
  private _state: MemoryBankState = {
    active: false,
    path: null,
    activity: 'idle',
    files: {
      activeContext: false,
      decisionLog: false,
      systemPatterns: false,
      progress: false,
      projectBrief: false
    }
  };

  private _onDidChangeState = new vscode.EventEmitter<MemoryBankState>();
  readonly onDidChangeState = this._onDidChangeState.event;

  get state(): MemoryBankState {
    return this._state;
  }

  get memoryFiles(): readonly string[] {
    return MEMORY_FILES;
  }

  private getToday(): string {
    return new Date().toISOString().split('T')[0];
  }

  private formatTag(type: MemoryEntry['type']): string {
    return `[${type}:${this.getToday()}]`;
  }

  private encode(text: string): Uint8Array {
    const g: any = globalThis as any;
    if (typeof g.TextEncoder === 'function') {
      return new g.TextEncoder().encode(text);
    } else if (g.Buffer && typeof g.Buffer.from === 'function') {
      return g.Buffer.from(text, 'utf8');
    }
    return new Uint8Array(text.split('').map((c: string) => c.charCodeAt(0)));
  }

  /**
   * Detect AI-Memory folder in the workspace and update state
   * Supports both 'AI-Memory' (new) and 'memory-bank' (legacy) folder names
   */
  async detectMemoryBank(): Promise<MemoryBankState> {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) {
      this._state = { 
        active: false, 
        path: null, 
        activity: 'idle',
        files: { activeContext: false, decisionLog: false, systemPatterns: false, progress: false, projectBrief: false } 
      };
      this._onDidChangeState.fire(this._state);
      return this._state;
    }

    // Search for AI-Memory or memory-bank folder in workspace
    for (const folder of ws) {
      for (const folderName of FOLDER_NAMES) {
        const memoryPath = vscode.Uri.joinPath(folder.uri, folderName);
        try {
          const stat = await vscode.workspace.fs.stat(memoryPath);
          if (stat.type === vscode.FileType.Directory) {
            // Found memory folder, check for required files
            const filesState: MemoryBankState['files'] = {
              activeContext: false,
              decisionLog: false,
              systemPatterns: false,
              progress: false,
              projectBrief: false
            };

            for (const file of MEMORY_FILES) {
              try {
                await vscode.workspace.fs.stat(vscode.Uri.joinPath(memoryPath, file));
                const key = FILE_KEY_MAP[file];
                if (key) filesState[key] = true;
              } catch {
                // File doesn't exist
              }
            }

            // Memory bank is active if at least the core files exist
            const coreFilesExist = filesState.activeContext && 
                                    filesState.decisionLog && 
                                    filesState.systemPatterns && 
                                    filesState.progress;

            this._state = {
              active: coreFilesExist,
              path: memoryPath,
              activity: 'idle',
              files: filesState
            };
            this._onDidChangeState.fire(this._state);
            return this._state;
          }
        } catch {
          // folder doesn't exist, try next
        }
      }
    }

    this._state = { 
      active: false, 
      path: null, 
      activity: 'idle',
      files: { activeContext: false, decisionLog: false, systemPatterns: false, progress: false, projectBrief: false } 
    };
    this._onDidChangeState.fire(this._state);
    return this._state;
  }

  private setActivity(activity: 'idle' | 'read' | 'write') {
    // Only update when memory bank path known; otherwise treat as idle
    if (this._state) {
      this._state.activity = activity;
      this._onDidChangeState.fire(this._state);
    }
  }

  /**
   * Create a new AI-Memory folder with initial files
   */
  async createMemoryBank(folder?: vscode.WorkspaceFolder): Promise<boolean> {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return false;
    }

    const targetFolder = folder || ws[0];
    const memoryPath = vscode.Uri.joinPath(targetFolder.uri, 'AI-Memory');

    try {
      await vscode.workspace.fs.createDirectory(memoryPath);

      // Create initial files with improved templates
      const templates: Record<MemoryFileName, string> = {
        'activeContext.md': `# Active Context

## Current Goals

- Goal 1
- Goal 2

## Current Blockers

- None yet

---

${this.formatTag('CONTEXT')} Initial setup - AI-Memory initialized
`,
        'decisionLog.md': `# Decision Log

Track all architectural, technical, and project decisions here.
Format: | Date | Decision | Rationale |

| Date | Decision | Rationale |
|------|----------|-----------|
| ${this.getToday()} | Initialize AI-Memory | Setting up project memory management for AI context persistence |

---

${this.formatTag('DECISION')} AI-Memory initialized | Providing persistent context across AI sessions
`,
        'systemPatterns.md': `# System Patterns

## Technical Stack

- Technology 1: Purpose
- Technology 2: Purpose

## Architectural Patterns

- Pattern 1: Description

## Design Patterns

- Pattern 1: Description

## Common Idioms

- Idiom 1: Description

---

${this.formatTag('PATTERN')} Initial setup: Document patterns as they emerge
`,
        'progress.md': `# Progress

## Done

- [x] Initialize AI-Memory

## Doing

- [ ] Current task

## Next

- [ ] Upcoming task

---

${this.formatTag('PROGRESS')} Initialized tracking
`,
        'projectBrief.md': `# Project Brief

## Overview

Provide a high-level overview of the project.

## Goals

- Goal 1
- Goal 2

## Core Features

- Feature 1
- Feature 2

## Technical Stack

- Tech 1
- Tech 2

## Scope & Constraints

Define the project scope and any constraints.

## Success Criteria

- Criterion 1
- Criterion 2

---

${this.formatTag('BRIEF')} Initial project brief created
`
      };

      for (const [filename, content] of Object.entries(templates)) {
        const filePath = vscode.Uri.joinPath(memoryPath, filename);
        await vscode.workspace.fs.writeFile(filePath, this.encode(content));
      }

      await this.detectMemoryBank();
      vscode.window.showInformationMessage(`AI-Memory created at ${memoryPath.fsPath}`);
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create AI-Memory: ${err}`);
      return false;
    }
  }

  /**
   * Read a memory file's content
   */
  async readFile(filename: MemoryFileName): Promise<string | null> {
    if (!this._state.path) {
      await this.detectMemoryBank();
    }
    if (!this._state.path) return null;

    try {
      const filePath = vscode.Uri.joinPath(this._state.path, filename);
      const content = await vscode.workspace.fs.readFile(filePath);
      this.setActivity('read');
      return Buffer.from(content).toString('utf8');
    } catch {
      return null;
    }
  }

  /**
   * Append content to a memory file (never delete, only append)
   */
  async appendToFile(filename: MemoryFileName, content: string): Promise<boolean> {
    if (!this._state.path) {
      await this.detectMemoryBank();
    }
    if (!this._state.path) {
      vscode.window.showErrorMessage('AI-Memory not found. Create one first.');
      return false;
    }

    try {
      const filePath = vscode.Uri.joinPath(this._state.path, filename);
      const existing = await this.readFile(filename) || '';
      const newContent = existing.trimEnd() + '\n\n' + content;
      await vscode.workspace.fs.writeFile(filePath, this.encode(newContent));
      this.setActivity('write');
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to update ${filename}: ${err}`);
      return false;
    }
  }

  /**
   * Log a decision to decisionLog.md
   */
  async logDecision(decision: string, rationale: string): Promise<boolean> {
    const tag = this.formatTag('DECISION');
    const entry = `| ${this.getToday()} | ${decision} | ${rationale} |`;
    return this.appendToFile('decisionLog.md', `${tag} ${entry}`);
  }

  /**
   * Update active context
   */
  async updateContext(context: string): Promise<boolean> {
    const tag = this.formatTag('CONTEXT');
    return this.appendToFile('activeContext.md', `${tag}\n${context}`);
  }

  /**
   * Update progress tracking
   */
  async updateProgress(item: string, status: 'done' | 'doing' | 'next'): Promise<boolean> {
    const tag = this.formatTag('PROGRESS');
    const marker = status === 'done' ? '[x]' : '[ ]';
    const section = status.charAt(0).toUpperCase() + status.slice(1);
    return this.appendToFile('progress.md', `${tag} ${section}: - ${marker} ${item}`);
  }

  /**
   * Update system patterns (includes architecture)
   */
  async updateSystemPatterns(pattern: string, description: string): Promise<boolean> {
    const tag = this.formatTag('PATTERN');
    return this.appendToFile('systemPatterns.md', `${tag} ${pattern}: ${description}`);
  }

  /**
   * Update project brief (includes product context)
   */
  async updateProjectBrief(content: string): Promise<boolean> {
    const tag = this.formatTag('BRIEF');
    return this.appendToFile('projectBrief.md', `${tag}\n${content}`);
  }

  /**
   * Mark a pattern or decision as deprecated (not deleted)
   */
  async markDeprecated(filename: MemoryFileName, item: string, reason: string): Promise<boolean> {
    const tag = this.formatTag('DEPRECATED');
    return this.appendToFile(filename, `${tag} ${item} - Reason: ${reason}`);
  }

  /**
   * Mark a decision as superseded
   */
  async markSuperseded(originalDecision: string, newApproach: string): Promise<boolean> {
    const tag = this.formatTag('SUPERSEDED');
    return this.appendToFile('decisionLog.md', `${tag} ${originalDecision} → ${newApproach}`);
  }

  /**
   * Get full memory summary
   */
  async showMemory(): Promise<string> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }

    if (!this._state.active || !this._state.path) {
      return '[MEMORY BANK: INACTIVE]\n\nNo AI-Memory found. Use "AI Skeleton: Create Memory Bank" to initialize.';
    }

    this.setActivity('read');
    const sections: string[] = [`[MEMORY BANK: ACTIVE]\nPath: ${this._state.path.fsPath}\n`];

    // Read each file in recommended order
    const fileOrder: MemoryFileName[] = [
      'projectBrief.md',
      'activeContext.md',
      'systemPatterns.md',
      'decisionLog.md',
      'progress.md'
    ];

    for (const filename of fileOrder) {
      const content = await this.readFile(filename);
      if (content) {
        // Get last 50 lines or less for summary
        const lines = content.split('\n');
        const summary = lines.slice(-50).join('\n');
        sections.push(`## ${filename}\n\n${summary}\n`);
      }
    }

    return sections.join('\n---\n\n');
  }

  /**
   * Get the URI for a specific memory file
   */
  getMemoryFileUri(filename: MemoryFileName): vscode.Uri | null {
    if (!this._state.path) return null;
    return vscode.Uri.joinPath(this._state.path, filename);
  }
}

// Singleton instance
let _memoryService: MemoryBankService | undefined;

export function getMemoryService(): MemoryBankService {
  if (!_memoryService) {
    _memoryService = new MemoryBankService();
  }
  return _memoryService;
}
