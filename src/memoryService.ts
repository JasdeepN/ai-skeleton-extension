// AI-Memory Service - Core memory management with SQLite backend
// Provides queryable memory operations with markdown fallback

import * as vscode from 'vscode';
import * as path from 'path';
import { getMemoryStore, MemoryStore } from './memoryStore';
import { migrateMarkdownToSQLite, isMigrationNeeded } from './memoryMigration';
import { exportSQLiteToMarkdown, createBackupMarkdown } from './memoryExport';

export interface MemoryBankState {
  active: boolean;
  path: vscode.Uri | null;
  activity?: 'idle' | 'read' | 'write';
  dbPath?: string;
  backend?: 'better-sqlite3' | 'sql.js' | 'none';
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

const MEMORY_FILES = [
  'activeContext.md',
  'decisionLog.md',
  'progress.md',
  'systemPatterns.md',
  'projectBrief.md'
] as const;

export type MemoryFileName = typeof MEMORY_FILES[number];

const FILE_KEY_MAP: Record<string, keyof MemoryBankState['files']> = {
  'activeContext.md': 'activeContext',
  'decisionLog.md': 'decisionLog',
  'systemPatterns.md': 'systemPatterns',
  'progress.md': 'progress',
  'projectBrief.md': 'projectBrief'
};

const FOLDER_NAMES = ['AI-Memory', 'memory-bank'];

export class MemoryBankService {
  private _state: MemoryBankState = {
    active: false,
    path: null,
    activity: 'idle',
    backend: 'none',
    files: {
      activeContext: false,
      decisionLog: false,
      systemPatterns: false,
      progress: false,
      projectBrief: false
    }
  };

  private _store: MemoryStore;
  private _cache: Map<string, any[]> = new Map(); // In-memory cache for fast access
  private _onDidChangeState = new vscode.EventEmitter<MemoryBankState>();
  readonly onDidChangeState = this._onDidChangeState.event;

  constructor() {
    this._store = getMemoryStore();
  }

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
   * Detect AI-Memory folder and initialize SQLite database
   */
  async detectMemoryBank(): Promise<MemoryBankState> {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) {
      console.warn('[MemoryService] No workspace folders found');
      this._state = {
        active: false,
        path: null,
        activity: 'idle',
        backend: 'none',
        files: { activeContext: false, decisionLog: false, systemPatterns: false, progress: false, projectBrief: false }
      };
      this._onDidChangeState.fire(this._state);
      return this._state;
    }

    console.log('[MemoryService] Scanning for memory bank in', ws.length, 'workspace folder(s)');

    for (const folder of ws) {
      for (const folderName of FOLDER_NAMES) {
        const memoryPath = vscode.Uri.joinPath(folder.uri, folderName);
        console.log('[MemoryService] Checking for memory at:', memoryPath.fsPath);
        try {
          const stat = await vscode.workspace.fs.stat(memoryPath);
          if (stat.type === vscode.FileType.Directory) {
            console.log('[MemoryService] Found memory directory at:', memoryPath.fsPath);
            
            // Initialize SQLite database
            const dbPath = path.join(memoryPath.fsPath, 'memory.db');
            console.log('[MemoryService] Initializing database at:', dbPath);
            let initialized = false;
            try {
              initialized = await this._store.init(dbPath);
            } catch (dbError) {
              console.error('[MemoryService] Database initialization threw error:', dbError);
              // Will be handled by !initialized check below
            }

            if (!initialized) {
              console.error('[MemoryService] Failed to initialize database at:', dbPath);
              vscode.window.showErrorMessage(
                'Failed to create AI-Memory: Error: Failed to initialize database. Check VS Code output for details.'
              );
              this._state = {
                active: false,
                path: memoryPath,
                activity: 'idle',
                backend: 'none',
                files: { activeContext: false, decisionLog: false, systemPatterns: false, progress: false, projectBrief: false }
              };
              this._onDidChangeState.fire(this._state);
              return this._state;
            }

            console.log('[MemoryService] Database initialized successfully');

            // Check if migration needed
            if (await isMigrationNeeded(memoryPath, this._store)) {
              console.log('[MemoryService] Running migration from markdown to SQLite');
              const migrationResult = await migrateMarkdownToSQLite(memoryPath, this._store);
              console.log('[MemoryService] Migration complete:', migrationResult);
            }

            // Verify core files exist or create them
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
                // File doesn't exist yet, may be created by export
              }
            }

            const coreFilesExist = filesState.activeContext &&
              filesState.decisionLog &&
              filesState.systemPatterns &&
              filesState.progress;

            this._state = {
              active: coreFilesExist,
              path: memoryPath,
              dbPath,
              activity: 'idle',
              backend: this._store.getBackend(),
              files: filesState
            };
            
            console.log('[MemoryService] Memory bank detected:', {
              active: this._state.active,
              backend: this._state.backend,
              files: filesState
            });
            
            this._onDidChangeState.fire(this._state);
            return this._state;
          }
        } catch {
          // folder doesn't exist
        }
      }
    }

    this._state = {
      active: false,
      path: null,
      activity: 'idle',
      backend: 'none',
      files: { activeContext: false, decisionLog: false, systemPatterns: false, progress: false, projectBrief: false }
    };
    this._onDidChangeState.fire(this._state);
    return this._state;
  }

  private setActivity(activity: 'idle' | 'read' | 'write') {
    if (this._state) {
      this._state.activity = activity;
      this._onDidChangeState.fire(this._state);
    }
  }

  /**
   * Create new AI-Memory folder with initial files
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

      // Initialize database
      const dbPath = path.join(memoryPath.fsPath, 'memory.db');
      const initialized = await this._store.init(dbPath);
      if (!initialized) {
        throw new Error('Failed to initialize database');
      }

      // Create default memory files with initialized content
      const today = this.getToday();
      const defaultFiles: Record<string, string> = {
        'projectBrief.md': `# Project Brief\n\n---\n\n[BRIEF:${today}] AI-Memory initialized\n`,
        'activeContext.md': `# Active Context\n\n---\n\n[CONTEXT:${today}] AI-Memory initialized\n`,
        'systemPatterns.md': `# System Patterns\n\n---\n\n[PATTERN:${today}] AI-Memory initialized\n`,
        'decisionLog.md': `# Decision Log\n\n---\n\n[DECISION:${today}] AI-Memory initialized\n`,
        'progress.md': `# Progress\n\n---\n\n[PROGRESS:${today}] AI-Memory initialized\n`,
      };
      
      for (const [filename, content] of Object.entries(defaultFiles)) {
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
   * Append entry to SQLite database
   */
  async logDecision(decision: string, rationale: string): Promise<boolean> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }
    if (!this._state.active) {
      vscode.window.showErrorMessage('AI-Memory not found. Create one first.');
      return false;
    }

    const tag = `DECISION:${this.getToday()}`;
    const entry = `| ${this.getToday()} | ${decision} | ${rationale} |`;

    try {
      await this._store.appendEntry({
        file_type: 'DECISION',
        timestamp: new Date().toISOString(),
        tag,
        content: entry
      });
      this.setActivity('write');
      this._cache.delete('DECISION');  // Invalidate cache
      
      // Export to markdown for immediate visibility
      if (this._state.path) {
        await exportSQLiteToMarkdown(this._state.path, this._store);
      }
      
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to log decision: ${err}`);
      return false;
    }
  }

  /**
   * Update active context
   */
  async updateContext(context: string): Promise<boolean> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }
    if (!this._state.active) {
      vscode.window.showErrorMessage('AI-Memory not found. Create one first.');
      return false;
    }

    const tag = `CONTEXT:${this.getToday()}`;

    try {
      await this._store.appendEntry({
        file_type: 'CONTEXT',
        timestamp: new Date().toISOString(),
        tag,
        content: context
      });
      this.setActivity('write');
      this._cache.delete('CONTEXT');
      
      // Export to markdown for immediate visibility
      if (this._state.path) {
        await exportSQLiteToMarkdown(this._state.path, this._store);
      }
      
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to update context: ${err}`);
      return false;
    }
  }

  /**
   * Update progress tracking
   */
  async updateProgress(item: string, status: 'done' | 'doing' | 'next'): Promise<boolean> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }
    if (!this._state.active) {
      vscode.window.showErrorMessage('AI-Memory not found. Create one first.');
      return false;
    }

    const tag = `PROGRESS:${this.getToday()}`;
    const marker = status === 'done' ? '[x]' : '[ ]';
    const section = status.charAt(0).toUpperCase() + status.slice(1);
    const content = `${section}: - ${marker} ${item}`;

    try {
      await this._store.appendEntry({
        file_type: 'PROGRESS',
        timestamp: new Date().toISOString(),
        tag,
        content
      });
      this.setActivity('write');
      this._cache.delete('PROGRESS');
      
      // Export to markdown for immediate visibility
      if (this._state.path) {
        await exportSQLiteToMarkdown(this._state.path, this._store);
      }
      
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to update progress: ${err}`);
      return false;
    }
  }

  /**
   * Update system patterns
   */
  async updateSystemPatterns(pattern: string, description: string): Promise<boolean> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }
    if (!this._state.active) {
      vscode.window.showErrorMessage('AI-Memory not found. Create one first.');
      return false;
    }

    const tag = `PATTERN:${this.getToday()}`;
    const content = `${pattern}: ${description}`;

    try {
      await this._store.appendEntry({
        file_type: 'PATTERN',
        timestamp: new Date().toISOString(),
        tag,
        content
      });
      this.setActivity('write');
      this._cache.delete('PATTERN');
      
      // Export to markdown for immediate visibility
      if (this._state.path) {
        await exportSQLiteToMarkdown(this._state.path, this._store);
      }
      
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to update patterns: ${err}`);
      return false;
    }
  }

  /**
   * Update project brief
   */
  async updateProjectBrief(content: string): Promise<boolean> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }
    if (!this._state.active) {
      vscode.window.showErrorMessage('AI-Memory not found. Create one first.');
      return false;
    }

    const tag = `BRIEF:${this.getToday()}`;

    try {
      await this._store.appendEntry({
        file_type: 'BRIEF',
        timestamp: new Date().toISOString(),
        tag,
        content
      });
      this.setActivity('write');
      this._cache.delete('BRIEF');
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to update brief: ${err}`);
      return false;
    }
  }

  /**
   * Mark as deprecated
   */
  async markDeprecated(filename: MemoryFileName, item: string, reason: string): Promise<boolean> {
    // Simplified - just log to decision log
    return this.logDecision(`DEPRECATED: ${item}`, `Reason: ${reason}`);
  }

  /**
   * Mark as superseded
   */
  async markSuperseded(originalDecision: string, newApproach: string): Promise<boolean> {
    return this.logDecision(`SUPERSEDED: ${originalDecision}`, `New: ${newApproach}`);
  }

  /**
   * Get memory summary (optimized with cache)
   */
  async showMemory(maxLines: number = 50): Promise<string> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }

    if (!this._state.active || !this._state.path) {
      return '[MEMORY BANK: INACTIVE]\n\nNo AI-Memory found. Use "AI Skeleton: Create Memory Bank" to initialize.';
    }

    this.setActivity('read');

    const types = ['BRIEF', 'CONTEXT', 'PATTERN', 'DECISION', 'PROGRESS'] as const;
    const sections: string[] = [
      `[MEMORY BANK: ACTIVE]`,
      `Path: ${this._state.path.fsPath}`,
      `Backend: ${this._state.backend}`,
      ''
    ];

    for (const type of types) {
      // Check cache first
      let entries = this._cache.get(type);
      if (!entries) {
        const result = await this._store.queryByType(type as any, 50);
        entries = result.entries;
        this._cache.set(type, entries);
      }

      if (entries && entries.length > 0) {
        const typeName = type === 'BRIEF' ? 'projectBrief.md' :
          type === 'CONTEXT' ? 'activeContext.md' :
            type === 'PATTERN' ? 'systemPatterns.md' :
              type === 'DECISION' ? 'decisionLog.md' : 'progress.md';

        sections.push(`## ${typeName}\n`);
        const lines = entries.map((e: any) => `[${e.tag}] ${e.content}`).slice(0, maxLines);
        sections.push(lines.join('\n\n'));
        sections.push('');
      }
    }

    return sections.join('\n---\n\n');
  }

  /**
   * Get URI for memory file (for opening in editor)
   */
  getMemoryFileUri(filename: MemoryFileName): vscode.Uri | null {
    if (!this._state.path) return null;
    return vscode.Uri.joinPath(this._state.path, filename);
  }

  /**
   * Export to markdown for backup
   */
  async exportToMarkdown(): Promise<boolean> {
    if (!this._state.active || !this._state.path) return false;

    try {
      const result = await exportSQLiteToMarkdown(this._state.path, this._store);
      return result.success;
    } catch (err) {
      console.error('[MemoryService] Export failed:', err);
      return false;
    }
  }

  /**
   * Create backup on deactivate
   */
  async createBackup(): Promise<boolean> {
    if (!this._state.active || !this._state.path) return false;

    try {
      return await createBackupMarkdown(this._state.path, this._store);
    } catch (err) {
      console.error('[MemoryService] Backup failed:', err);
      return false;
    }
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
