// AI-Memory Service - Core memory management with SQLite backend
// Provides queryable memory operations with markdown fallback

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getMemoryStore, MemoryStore, MemoryEntry as StoreMemoryEntry } from './memoryStore';
import { exportSQLiteToMarkdown, createBackupMarkdown } from './memoryExport';

export interface MemoryBankState {
  active: boolean;
  path: vscode.Uri | null;
  activity?: 'idle' | 'read' | 'write';
  dbPath?: string;
  backend?: 'better-sqlite3' | 'sql.js' | 'none';
}

export interface MemoryEntry {
  type: 'DECISION' | 'CONTEXT' | 'PROGRESS' | 'PATTERN' | 'BRIEF' | 'DEPRECATED' | 'SUPERSEDED';
  date: string; // ISO date YYYY-MM-DD
  content: string;
}

export interface DashboardTasksSnapshot {
  next: string[];
  doing: string[];
  done: string[];
  other: string[];
}

export interface DashboardMetrics {
  state: MemoryBankState;
  dbSizeBytes: number | null;
  avgQueryTimeMs: number | null;
  entryCounts: Record<StoreMemoryEntry['file_type'], number>;
  latest: Record<StoreMemoryEntry['file_type'], Array<Pick<StoreMemoryEntry, 'tag' | 'content' | 'timestamp'>>>;
  tasks: DashboardTasksSnapshot;
}

// SQLite is the single source of truth - no markdown files tracked

const FOLDER_NAMES = ['AI-Memory', 'memory-bank'];

export class MemoryBankService {
  private _state: MemoryBankState = {
    active: false,
    path: null,
    activity: 'idle',
    backend: 'none'
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
        backend: 'none'
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
                backend: 'none'
              };
              this._onDidChangeState.fire(this._state);
              return this._state;
            }

            console.log('[MemoryService] Database initialized successfully');

            // SQLite-only mode: Memory bank is active if database is initialized
            const dbInitialized = this._store.getBackend() !== 'none';

            this._state = {
              active: dbInitialized,
              path: memoryPath,
              dbPath,
              activity: 'idle',
              backend: this._store.getBackend()
            };
            
            console.log('[MemoryService] Memory bank detected:', {
              active: this._state.active,
              backend: this._state.backend,
              dbPath: this._state.dbPath
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
      backend: 'none'
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

      // Initialize database (SQLite-only, no markdown files)
      const dbPath = path.join(memoryPath.fsPath, 'memory.db');
      const initialized = await this._store.init(dbPath);
      if (!initialized) {
        throw new Error('Failed to initialize database');
      }

      // Small delay to ensure database file is written to disk
      await new Promise(resolve => setTimeout(resolve, 100));

      // Add initial entries to database
      const today = this.getToday();
      await this._store.appendEntry({
        file_type: 'BRIEF',
        timestamp: new Date().toISOString(),
        tag: `BRIEF:${today}`,
        content: 'AI-Memory initialized'
      });

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
   * Mark as superseded
   */
  async markSuperseded(originalDecision: string, newApproach: string): Promise<boolean> {
    return this.logDecision(`SUPERSEDED: ${originalDecision}`, `New: ${newApproach}`);
  }

  /**
   * Mark item as deprecated
   */
  async markDeprecated(file: string, item: string, reason: string): Promise<boolean> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }
    if (!this._state.active) {
      vscode.window.showErrorMessage('AI-Memory not found. Create one first.');
      return false;
    }

    // Accept various input formats (lowercase, camelCase, uppercase) - no .md files
    const typeMap: Record<string, StoreMemoryEntry['file_type']> = {
      'activeContext': 'CONTEXT',
      'context': 'CONTEXT',
      'CONTEXT': 'CONTEXT',
      'decisionLog': 'DECISION',
      'decision': 'DECISION',
      'DECISION': 'DECISION',
      'progress': 'PROGRESS',
      'PROGRESS': 'PROGRESS',
      'systemPatterns': 'PATTERN',
      'patterns': 'PATTERN',
      'PATTERN': 'PATTERN',
      'projectBrief': 'BRIEF',
      'brief': 'BRIEF',
      'BRIEF': 'BRIEF'
    };

    const fileType = typeMap[file];
    if (!fileType) {
      vscode.window.showErrorMessage(`Invalid memory type: ${file}. Use: context, decision, progress, patterns, or brief.`);
      return false;
    }

    const tag = `DEPRECATED:${this.getToday()}`;
    const content = `Item: ${item}\nReason: ${reason}`;

    try {
      await this._store.appendEntry({
        file_type: 'CONTEXT',
        timestamp: new Date().toISOString(),
        tag,
        content
      });
      this.setActivity('write');
      this._cache.delete(fileType);
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to mark deprecated: ${err}`);
      return false;
    }
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
      `Database: memory.db (SQLite via ${this._state.backend === 'better-sqlite3' ? 'native' : 'WASM'})`,
      ''
    ];

    // Get entry counts to show database statistics
    const counts = await this._store.getEntryCounts();
    const totalEntries = Object.values(counts).reduce((a, b) => a + b, 0);
    
    if (totalEntries === 0) {
      sections.push('📝 **Memory Bank is Empty**');
      sections.push('');
      sections.push('Your memory database is initialized but contains no entries yet.');
      sections.push('Start using the memory tools to populate it:');
      sections.push('- `aiSkeleton_logDecision` - Log architectural decisions');
      sections.push('- `aiSkeleton_updateContext` - Update working context');
      sections.push('- `aiSkeleton_updateProgress` - Track task progress');
      sections.push('- `aiSkeleton_updatePatterns` - Document patterns');
      sections.push('- `aiSkeleton_updateProjectBrief` - Update project info');
      sections.push('');
      return sections.join('\n');
    }

    sections.push(`📊 **Database Statistics**: ${totalEntries} total entries`);
    sections.push(`  • Context: ${counts.CONTEXT}`);
    sections.push(`  • Decisions: ${counts.DECISION}`);
    sections.push(`  • Progress: ${counts.PROGRESS}`);
    sections.push(`  • Patterns: ${counts.PATTERN}`);
    sections.push(`  • Brief: ${counts.BRIEF}`);
    sections.push('');

    for (const type of types) {
      // Check cache first
      let entries = this._cache.get(type);
      if (!entries) {
        const result = await this._store.queryByType(type as any, 50);
        entries = result.entries;
        this._cache.set(type, entries);
      }

      if (entries && entries.length > 0) {
        const typeName = type === 'BRIEF' ? 'Project Brief' :
          type === 'CONTEXT' ? 'Active Context' :
            type === 'PATTERN' ? 'System Patterns' :
              type === 'DECISION' ? 'Decision Log' : 'Progress';

        sections.push(`## ${typeName} (${entries.length} entries)\n`);
        const lines = entries.map((e: any) => `[${e.tag}] ${e.content}`).slice(0, maxLines);
        sections.push(lines.join('\n\n'));
        sections.push('');
      }
    }

    return sections.join('\n---\n\n');
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

  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    // Ensure state is up to date
    const state = this._state.active ? this._state : await this.detectMemoryBank();

    const entryCounts = await this._store.getEntryCounts();
    const latest: DashboardMetrics['latest'] = {
      CONTEXT: [],
      DECISION: [],
      PROGRESS: [],
      PATTERN: [],
      BRIEF: []
    };

    for (const type of Object.keys(latest) as StoreMemoryEntry['file_type'][]) {
      const res = await this._store.queryByType(type, 5);
      latest[type] = res.entries.map(e => ({ tag: e.tag, content: e.content, timestamp: e.timestamp }));
    }

    const tasks = await this.getProgressBuckets();

    let dbSizeBytes: number | null = null;
    if (state.dbPath) {
      try {
        const stat = await fs.promises.stat(state.dbPath);
        dbSizeBytes = stat.size;
      } catch (err) {
        console.warn('[MemoryService] Failed to stat database file:', err);
      }
    }

    return {
      state,
      dbSizeBytes,
      avgQueryTimeMs: this._store.getAverageQueryTimeMs(),
      entryCounts,
      latest,
      tasks
    };
  }

  private async getProgressBuckets(): Promise<DashboardTasksSnapshot> {
    const snapshot: DashboardTasksSnapshot = { next: [], doing: [], done: [], other: [] };

    if (!this._state.active) {
      return snapshot;
    }

    const res = await this._store.queryByType('PROGRESS', 100);
    const regex = /^(Done|Doing|Next)\s*:\s*-?\s*\[(x|X|\s)\]\s*(.+)$/i;

    for (const entry of res.entries) {
      const match = entry.content.match(regex);
      if (!match) {
        snapshot.other.push(entry.content.trim());
        continue;
      }

      const [, bucketRaw, mark, text] = match;
      const bucket = bucketRaw.toLowerCase();
      const normalized = text.trim();
      if (bucket === 'done' || mark.toLowerCase() === 'x') {
        snapshot.done.push(normalized);
      } else if (bucket === 'doing') {
        snapshot.doing.push(normalized);
      } else if (bucket === 'next') {
        snapshot.next.push(normalized);
      } else {
        snapshot.other.push(normalized);
      }
    }

    return snapshot;
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
