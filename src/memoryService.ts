// AI-Memory Service - Core memory management with SQLite backend
// Provides queryable memory operations with markdown fallback

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getMemoryStore, MemoryStore, MemoryEntry as StoreMemoryEntry } from './memoryStore';
import { exportSQLiteToMarkdown, createBackupMarkdown } from './memoryExport';
import RelevanceScorer, { ScoredEntry } from './relevanceScorer';

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
  vectorStats?: {
    embeddedCount: number;
    totalCount: number;
    coveragePercent: number;
    storageBytesUsed: number;
  };
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

  constructor(store?: MemoryStore) {
    // Allow dependency injection for testing; default to singleton
    this._store = store ?? getMemoryStore();
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
            let initError: any = null;
            try {
              initialized = await this._store.init(dbPath);
            } catch (dbError) {
              initError = dbError;
              console.error('[MemoryService] Database initialization threw error:', dbError);
              console.error('[MemoryService] Full error:', {
                message: (dbError as any)?.message,
                stack: (dbError as any)?.stack
              });
              // Will be handled by !initialized check below
            }

            if (!initialized) {
              const errorMsg = initError ? `${(initError as any)?.message}` : 'Unknown error';
              console.error('[MemoryService] Failed to initialize database at:', dbPath, 'Error:', errorMsg);
              vscode.window.showErrorMessage(
                `Failed to create AI-Memory: ${errorMsg}`
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
  async logDecision(
    decision: string,
    rationale: string,
    metadata?: { progress?: string; targets?: string[]; phase?: string }
  ): Promise<boolean> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }
    if (!this._state.active) {
      vscode.window.showErrorMessage('AI-Memory not found. Create one first.');
      return false;
    }

    const tag = `DECISION:${this.getToday()}`;
    const entry = `| ${this.getToday()} | ${decision} | ${rationale} |`;
    const metadataJson = metadata ? JSON.stringify(metadata) : '{}';

    try {
      await this._store.appendEntry({
        file_type: 'DECISION',
        timestamp: new Date().toISOString(),
        tag,
        content: entry,
        metadata: metadataJson,
        phase: (metadata?.phase as any) || null,
        progress_status: (metadata?.progress as any) || 'in-progress'
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
  async updateContext(context: string, phase?: 'research' | 'planning' | 'execution'): Promise<boolean> {
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
        content: context,
        phase: phase || null
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
  async updateProgress(item: string, status: 'done' | 'doing' | 'next', phase?: 'research' | 'planning' | 'execution'): Promise<boolean> {
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

    // Map service status to database status enum
    const dbStatus: 'done' | 'in-progress' | 'draft' | 'deprecated' | null = 
      status === 'done' ? 'done' :
      status === 'doing' ? 'in-progress' : null;

    try {
      await this._store.appendEntry({
        file_type: 'PROGRESS',
        timestamp: new Date().toISOString(),
        tag,
        content,
        phase: phase || null,
        progress_status: dbStatus
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
  async updateSystemPatterns(pattern: string, description: string, phase?: 'research' | 'planning' | 'execution'): Promise<boolean> {
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
        content,
        phase: phase || null
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
  async updateProjectBrief(content: string, phase?: 'research' | 'planning' | 'execution'): Promise<boolean> {
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
        content,
        phase: phase || null
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
   * Save research findings (from Think.prompt.md workflow)
   * Uses RESEARCH_REPORT file type to distinguish from project briefs
   */
  async saveResearch(content: string, phase?: 'research' | 'planning' | 'execution'): Promise<boolean> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }
    if (!this._state.active) {
      const errorMsg = 'AI-Memory not found. Create one first (via AI Skeleton: Create Memory Bank command).';
      console.error('[MemoryService]', errorMsg);
      vscode.window.showErrorMessage(errorMsg);
      return false;
    }

    const tag = `RESEARCH_REPORT:${this.getToday()}`;

    try {
      console.log('[MemoryService] saveResearch: Saving research brief to AI-Memory');
      console.log('[MemoryService] saveResearch: Content length =', content.length, 'bytes');
      console.log('[MemoryService] saveResearch: Tag =', tag);
      
      const entryId = await this._store.appendEntry({
        file_type: 'RESEARCH_REPORT',
        timestamp: new Date().toISOString(),
        tag,
        content,
        phase: phase || 'research'
      });
      
      console.log('[MemoryService] saveResearch: appendEntry returned ID:', entryId);
      
      if (!entryId) {
        const errMsg = 'Failed to save research: Database returned null ID. This may indicate a database initialization issue.';
        console.error('[MemoryService]', errMsg);
        vscode.window.showErrorMessage(errMsg);
        return false;
      }
      
      console.log('[MemoryService] saveResearch: Successfully saved research brief with ID', entryId);
      this.setActivity('write');
      this._cache.delete('RESEARCH_REPORT');
      vscode.window.showInformationMessage(`✓ Research brief saved (ID: ${entryId})`);
      return true;
    } catch (err) {
      const errorMsg = `Failed to save research: ${err instanceof Error ? err.message : String(err)}`;
      console.error('[MemoryService]', errorMsg);
      console.error('[MemoryService] Full error:', err);
      vscode.window.showErrorMessage(errorMsg);
      return false;
    }
  }

  /**
   * Save plan (from Plan.prompt.md workflow)
   * Uses PLAN_REPORT file type
   */
  async savePlan(content: string, phase?: 'research' | 'planning' | 'execution'): Promise<boolean> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }
    if (!this._state.active) {
      const errorMsg = 'AI-Memory not found. Create one first (via AI Skeleton: Create Memory Bank command).';
      console.error('[MemoryService]', errorMsg);
      vscode.window.showErrorMessage(errorMsg);
      return false;
    }

    const tag = `PLAN_REPORT:${this.getToday()}`;

    try {
      console.log('[MemoryService] savePlan: Saving implementation plan to AI-Memory');
      console.log('[MemoryService] savePlan: Content length =', content.length, 'bytes');
      console.log('[MemoryService] savePlan: Tag =', tag);
      
      const entryId = await this._store.appendEntry({
        file_type: 'PLAN_REPORT',
        timestamp: new Date().toISOString(),
        tag,
        content,
        phase: phase || 'planning'
      });
      
      console.log('[MemoryService] savePlan: appendEntry returned ID:', entryId);
      
      if (!entryId) {
        const errMsg = 'Failed to save plan: Database returned null ID. This may indicate a database initialization issue.';
        console.error('[MemoryService]', errMsg);
        vscode.window.showErrorMessage(errMsg);
        return false;
      }
      
      console.log('[MemoryService] savePlan: Successfully saved plan with ID', entryId);
      this.setActivity('write');
      this._cache.delete('PLAN_REPORT');
      vscode.window.showInformationMessage(`✓ Plan saved (ID: ${entryId})`);
      return true;
    } catch (err) {
      const errorMsg = `Failed to save plan: ${err instanceof Error ? err.message : String(err)}`;
      console.error('[MemoryService]', errorMsg);
      console.error('[MemoryService] Full error:', err);
      vscode.window.showErrorMessage(errorMsg);
      return false;
    }
  }

  /**
   * Save execution summary (from Execute.prompt.md workflow)
   * Uses EXECUTION_REPORT file type
   */
  async saveExecution(content: string, phase?: 'research' | 'planning' | 'execution'): Promise<boolean> {
    if (!this._state.active) {
      await this.detectMemoryBank();
    }
    if (!this._state.active) {
      const errorMsg = 'AI-Memory not found. Create one first (via AI Skeleton: Create Memory Bank command).';
      console.error('[MemoryService]', errorMsg);
      vscode.window.showErrorMessage(errorMsg);
      return false;
    }

    const tag = `EXECUTION_REPORT:${this.getToday()}`;

    try {
      console.log('[MemoryService] saveExecution: Saving execution report to AI-Memory');
      console.log('[MemoryService] saveExecution: Content length =', content.length, 'bytes');
      console.log('[MemoryService] saveExecution: Tag =', tag);
      
      const entryId = await this._store.appendEntry({
        file_type: 'EXECUTION_REPORT',
        timestamp: new Date().toISOString(),
        tag,
        content,
        phase: phase || 'execution'
      });
      
      console.log('[MemoryService] saveExecution: appendEntry returned ID:', entryId);
      
      if (!entryId) {
        const errMsg = 'Failed to save execution: Database returned null ID. This may indicate a database initialization issue.';
        console.error('[MemoryService]', errMsg);
        vscode.window.showErrorMessage(errMsg);
        return false;
      }
      
      console.log('[MemoryService] saveExecution: Successfully saved execution report with ID', entryId);
      this.setActivity('write');
      this._cache.delete('EXECUTION_REPORT');
      vscode.window.showInformationMessage(`✓ Execution report saved (ID: ${entryId})`);
      return true;
    } catch (err) {
      const errorMsg = `Failed to save execution: ${err instanceof Error ? err.message : String(err)}`;
      console.error('[MemoryService]', errorMsg);
      console.error('[MemoryService] Full error:', err);
      vscode.window.showErrorMessage(errorMsg);
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
      BRIEF: [],
      RESEARCH_REPORT: [],
      PLAN_REPORT: [],
      EXECUTION_REPORT: []
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

    // Calculate vector database stats
    let vectorStats: DashboardMetrics['vectorStats'] | undefined;
    try {
      const totalCount = Object.values(entryCounts).reduce((a, b) => a + b, 0);
      const embeddedCount = await this._store.countEntriesWithEmbeddings();
      
      if (totalCount > 0) {
        vectorStats = {
          embeddedCount,
          totalCount,
          coveragePercent: Math.round((embeddedCount / totalCount) * 100),
          storageBytesUsed: embeddedCount * 48 // Each quantized embedding is 48 bytes
        };
      }
    } catch (err) {
      console.debug('[MemoryService] Failed to calculate vector stats:', err);
    }

    return {
      state,
      dbSizeBytes,
      avgQueryTimeMs: this._store.getAverageQueryTimeMs(),
      entryCounts,
      latest,
      tasks,
      vectorStats
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

  /**
   * Select relevant context entries for a given query/task within a token budget
   * Uses relevance scoring + recency weighting + priority multipliers
   * 
   * @param query User query or task description for relevance matching
   * @param tokenBudget Maximum tokens to allocate to context (e.g., 50000)
   * @param options Additional options
   * @returns Selected entries formatted for LM consumption
   */
  async selectContextForBudget(
    query: string,
    tokenBudget: number = 50000,
    options?: {
      minRelevanceThreshold?: number;
      includeTypes?: StoreMemoryEntry['file_type'][];
      maxAgeDays?: number;
      useSemanticSearch?: boolean; // PHASE 8.2: Enable semantic search blending
    }
  ): Promise<{
    entries: StoreMemoryEntry[];
    formattedContext: string;
    tokensUsed: number;
    coverage: string;
  }> {
    const opts = {
      minRelevanceThreshold: 0.1,
      maxAgeDays: 90,
      useSemanticSearch: false,
      ...options
    };

    // Get all entries from database
    const store = getMemoryStore();
    let allEntries: StoreMemoryEntry[] = [];

    // Query by type if specified, otherwise get all
    if (opts.includeTypes && opts.includeTypes.length > 0) {
      for (const type of opts.includeTypes) {
        const result = await store.queryByType(type);
        if (result.entries) {
          allEntries.push(...result.entries);
        }
      }
    } else {
      // Get all entry types (including phase reports)
      const types: StoreMemoryEntry['file_type'][] = ['CONTEXT', 'DECISION', 'PROGRESS', 'PATTERN', 'BRIEF', 'RESEARCH_REPORT', 'PLAN_REPORT', 'EXECUTION_REPORT'];
      for (const type of types) {
        const result = await store.queryByType(type);
        if (result.entries) {
          allEntries.push(...result.entries);
        }
      }
    }

    // Filter by age if specified
    if (opts.maxAgeDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - opts.maxAgeDays);
      const cutoffISO = cutoffDate.toISOString();
      allEntries = allEntries.filter(e => e.timestamp >= cutoffISO);
    }

    // Score all entries for relevance (keyword-based)
    const scorer = RelevanceScorer;
    let scoredEntries = scorer.scoreEntries(allEntries, query);

    // PHASE 8.2: Optionally blend in semantic search scores
    if (opts.useSemanticSearch && allEntries.length > 0) {
      try {
        console.log('[selectContextForBudget] Blending semantic search scores');
        const semanticResults = await this.semanticSearch(query, Math.min(20, allEntries.length));

        // Map semantic scores by tag for quick lookup
        const semanticScoreMap = new Map<string, number>();
        for (const entry of semanticResults.entries) {
          semanticScoreMap.set(entry.tag, entry.score);
        }

        // Blend: 60% keyword score (finalScore) + 40% semantic score (normalized 0-1)
        scoredEntries = scoredEntries.map(scored => {
          const semanticScore = semanticScoreMap.get(scored.entry.tag) ?? 50; // default 50% if missing
          const semanticNormalized = semanticScore / 100;
          const blended = 0.6 * scored.finalScore + 0.4 * semanticNormalized;
          return {
            ...scored,
            finalScore: blended,
            reason: `${scored.reason ?? 'keyword relevance'} (+ semantic ${semanticNormalized.toFixed(2)})`
          };
        });

        console.log('[selectContextForBudget] Blended', scoredEntries.length, 'entries with semantic scores');
      } catch (err) {
        console.error('[selectContextForBudget] Semantic blending failed, using keyword-only:', err);
      }
    }

    // Filter by minimum relevance threshold
    const relevantEntries = scorer.filterByThreshold(scoredEntries, opts.minRelevanceThreshold);

    // Rank by score (highest first)
    const rankedEntries = scorer.rankEntries(relevantEntries);

    // Greedy selection: add entries until budget exhausted
    const selectedEntries: StoreMemoryEntry[] = [];
    let tokensUsed = 0;

    for (const scored of rankedEntries) {
      // Estimate tokens for this entry (rough: ~4 chars per token)
      const entryText = this.formatEntryForContext(scored.entry);
      const estimatedTokens = Math.ceil(entryText.length / 4);

      // Check if adding this entry would exceed budget
      if (tokensUsed + estimatedTokens <= tokenBudget) {
        selectedEntries.push(scored.entry);
        tokensUsed += estimatedTokens;
      } else {
        // Budget exhausted, stop selection
        break;
      }
    }

    // Format selected entries for LM consumption
    const formattedContext = selectedEntries.map(e => this.formatEntryForContext(e)).join('\n\n---\n\n');

    // Calculate coverage stats
    const coverage = `Selected ${selectedEntries.length}/${allEntries.length} entries (${Math.round((selectedEntries.length / allEntries.length) * 100)}%) | Tokens: ${tokensUsed}/${tokenBudget}`;

    return {
      entries: selectedEntries,
      formattedContext,
      tokensUsed,
      coverage
    };
  }

  /**
   * Query entries by phase (research, planning, execution, checkpoint)
   * Returns entries grouped by progress_status
   */
  async queryByPhase(phase: 'research' | 'planning' | 'execution' | 'checkpoint'): Promise<{
    done: StoreMemoryEntry[];
    inProgress: StoreMemoryEntry[];
    draft: StoreMemoryEntry[];
  }> {
    try {
      const result = await this._store.queryByType('CONTEXT', 500); // Query all with higher limit
      const entries = result.entries.filter((e: any) => e.phase === phase);
      
      return {
        done: entries.filter((e: any) => e.progress_status === 'done'),
        inProgress: entries.filter((e: any) => e.progress_status === 'in-progress'),
        draft: entries.filter((e: any) => !e.progress_status || (e.progress_status !== 'done' && e.progress_status !== 'in-progress'))
      };
    } catch (e) {
      console.error('Error querying by phase:', e);
      return { done: [], inProgress: [], draft: [] };
    }
  }

  /**
   * Query entries by progress status (done, in-progress, draft, deprecated)
   * Returns all entries with matching status
   */
  async queryByProgressStatus(status: 'done' | 'in-progress' | 'draft' | 'deprecated'): Promise<StoreMemoryEntry[]> {
    try {
      const result = await this._store.queryByType('CONTEXT', 500);
      const all = result.entries as StoreMemoryEntry[];
      
      if (status === 'deprecated') {
        return all.filter((e: any) => e.progress_status === 'deprecated');
      } else if (status === 'draft') {
        return all.filter((e: any) => !e.progress_status || (e.progress_status !== 'done' && e.progress_status !== 'in-progress' && e.progress_status !== 'deprecated'));
      }
      
      return all.filter((e: any) => e.progress_status === status);
    } catch (e) {
      console.error('Error querying by progress status:', e);
      return [];
    }
  }

  /**
   * Get phase history for context switching section
   * Returns entries organized by phase with counts
   */
  async getPhaseHistory(): Promise<{
    research: { done: number; inProgress: number };
    planning: { done: number; inProgress: number };
    execution: { done: number; inProgress: number };
  }> {
    try {
      const research = await this.queryByPhase('research');
      const planning = await this.queryByPhase('planning');
      const execution = await this.queryByPhase('execution');

      return {
        research: {
          done: research.done.length,
          inProgress: research.inProgress.length
        },
        planning: {
          done: planning.done.length,
          inProgress: planning.inProgress.length
        },
        execution: {
          done: execution.done.length,
          inProgress: execution.inProgress.length
        }
      };
    } catch (e) {
      console.error('Error getting phase history:', e);
      return {
        research: { done: 0, inProgress: 0 },
        planning: { done: 0, inProgress: 0 },
        execution: { done: 0, inProgress: 0 }
      };
    }
  }

  /**
   * Get current context entry (activeContext)
   * Returns most recent CONTEXT entry with file_type === 'CONTEXT'
   */
  async getCurrentContext(): Promise<StoreMemoryEntry | null> {
    try {
      const result = await this._store.queryByType('CONTEXT', 100);
      const contexts = result.entries as StoreMemoryEntry[];
      if (contexts.length === 0) return null;
      
      // Sort by timestamp descending, return first (most recent)
      return contexts.sort((a: any, b: any) => (b.timestamp || '').localeCompare(a.timestamp || ''))[0];
    } catch (e) {
      console.error('Error getting current context:', e);
      return null;
    }
  }

  /**
   * Get all entries of a specific type
   * @param type Memory entry file type (CONTEXT, DECISION, PROGRESS, PATTERN, BRIEF)
   * @returns Array of entries sorted by timestamp (newest first)
   */
  async queryByType(type: StoreMemoryEntry['file_type']): Promise<StoreMemoryEntry[]> {
    try {
      const result = await this._store.queryByType(type, 1000);
      const entries = result.entries || [];
      // Sort by timestamp descending (newest first)
      return entries.sort((a: any, b: any) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    } catch (e) {
      console.error(`Error querying entries of type ${type}:`, e);
      return [];
    }
  }

  /**
   * Format a single memory entry for LM context (Markdown + YAML)
   * Optimized for token efficiency
   */
  private formatEntryForContext(entry: StoreMemoryEntry): string {
    const date = entry.timestamp.split('T')[0]; // YYYY-MM-DD
    const tag = entry.tag || '';
    
    // Markdown format with YAML-style metadata
    return `[${entry.file_type}:${date}] ${tag}
${entry.content.trim()}`;
  }

  /**
   * Query entries by target domain (ui/db/refactor/tests/docs/perf/integration/infra)
   */
  async queryByTargetDomain(domain: string): Promise<StoreMemoryEntry[]> {
    try {
      const allEntries = await this._store.queryByType('CONTEXT', 1000);
      const entries = allEntries.entries || [];
      
      // Filter by domain in metadata
      return entries.filter(entry => {
        if (!entry.metadata) return false;
        try {
          const meta = JSON.parse(entry.metadata);
          return meta.targets && Array.isArray(meta.targets) && meta.targets.includes(domain);
        } catch {
          return false;
        }
      });
    } catch (e) {
      console.error('Error querying by target domain:', e);
      return [];
    }
  }

  /**
   * Get tag summary - count entries by progress status
   */
  async getTagSummary(): Promise<{
    byProgress: Record<string, number>;
    byPhase: Record<string, number>;
    byDomain: Record<string, number>;
  }> {
    try {
      const all = await this._store.queryByType('CONTEXT', 10000);
      const entries = all.entries || [];
      
      const byProgress: Record<string, number> = {
        'done': 0,
        'in-progress': 0,
        'draft': 0,
        'deprecated': 0
      };

      const byPhase: Record<string, number> = {
        'research': 0,
        'planning': 0,
        'execution': 0,
        'checkpoint': 0
      };

      const byDomain: Record<string, number> = {
        'ui': 0,
        'db': 0,
        'refactor': 0,
        'tests': 0,
        'docs': 0,
        'perf': 0,
        'integration': 0,
        'infra': 0
      };

      for (const entry of entries) {
        if (entry.progress_status && byProgress[entry.progress_status] !== undefined) {
          byProgress[entry.progress_status]++;
        }
        if (entry.phase && byPhase[entry.phase] !== undefined) {
          byPhase[entry.phase]++;
        }
        
        if (entry.metadata) {
          try {
            const meta = JSON.parse(entry.metadata);
            if (meta.targets && Array.isArray(meta.targets)) {
              for (const domain of meta.targets) {
                if (byDomain[domain] !== undefined) {
                  byDomain[domain]++;
                }
              }
            }
          } catch {
            // Ignore metadata parse errors
          }
        }
      }

      return { byProgress, byPhase, byDomain };
    } catch (e) {
      console.error('Error getting tag summary:', e);
      return {
        byProgress: {},
        byPhase: {},
        byDomain: {}
      };
    }
  }

  /**
   * Semantic search: find relevant entries using hybrid scoring
   * Combines keyword relevance (keyword matching) with semantic similarity
   * 
   * Semantic Search: Find most relevant entries using embedding similarity + keyword matching
   * Uses hybrid scoring: semantic similarity (via embeddings) + keyword relevance
   */
  async semanticSearch(
    query: string,
    limit: number = 10,
    semanticWeight: number = 0.7,
    keywordWeight: number = 0.3
  ): Promise<{
    entries: Array<StoreMemoryEntry & { score: number; reason: string }>;
    query: string;
    searchTime: number;
  }> {
    const startTime = performance.now();
    
    try {
      // Import embedding utilities dynamically
      const { getEmbeddingService, dequantizeEmbedding, cosineSimilarity } = await import('./embeddingService');

      // Defensive fallback: if dequantizeEmbedding is missing (e.g., test mocks), provide a local converter
      const safeDequantize = typeof dequantizeEmbedding === 'function'
        ? dequantizeEmbedding
        : (quantized: Uint8Array | Buffer | Float32Array): Float32Array => {
            if (quantized instanceof Float32Array) return quantized;
            const bytes = quantized instanceof Buffer ? new Uint8Array(quantized) : quantized;
            if (bytes.length === 48) {
              const restored = new Float32Array(384);
              for (let i = 0; i < 384; i++) {
                const byteIdx = Math.floor(i / 8);
                const bitIdx = i % 8;
                restored[i] = ((bytes[byteIdx]! >> bitIdx) & 1) === 1 ? 1 : -1;
              }
              return restored;
            }
            // Fallback: coerce to Float32Array preserving length
            return new Float32Array(bytes);
          };

      // Defensive fallback: cosine similarity should always exist, but tests can mock without it
      const safeCosineSimilarity = typeof cosineSimilarity === 'function'
        ? cosineSimilarity
        : (a: Float32Array, b: Float32Array): number => {
            let dot = 0;
            let normA = 0;
            let normB = 0;
            const len = Math.min(a.length, b.length);
            for (let i = 0; i < len; i++) {
              const va = a[i]!;
              const vb = b[i]!;
              dot += va * vb;
              normA += va * va;
              normB += vb * vb;
            }
            if (normA === 0 || normB === 0) return 0;
            return dot / (Math.sqrt(normA) * Math.sqrt(normB));
          };
      
      // Step 1: Generate embedding for the query
      const embeddingService = getEmbeddingService();
      let queryEmbedding: Float32Array | null = null;
      
      try {
        const result = await embeddingService.embed(query);
        queryEmbedding = result.embedding;
      } catch (err) {
        console.warn('[SemanticSearch] Failed to generate query embedding, falling back to keyword-only:', err);
      }

      // Step 2: Get entries with embeddings
      const entriesWithEmbeddings = await this._store.queryEntriesWithEmbeddings(1000);
      
      // Step 3: Get all entries for keyword fallback
      const allResult = await this._store.queryByType('CONTEXT', 1000);
      const allResult2 = await this._store.queryByType('DECISION', 1000);
      const allResult3 = await this._store.queryByType('PROGRESS', 1000);
      const allResult4 = await this._store.queryByType('PATTERN', 1000);
      const allResult5 = await this._store.queryByType('BRIEF', 1000);
      
      const allEntries = [
        ...allResult.entries,
        ...allResult2.entries,
        ...allResult3.entries,
        ...allResult4.entries,
        ...allResult5.entries
      ];

      // Step 4: Score entries using hybrid approach
      const scored = allEntries.map(entry => {
        // Keyword matching: presence-based scoring
        const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        const entryText = (entry.tag + ' ' + entry.content).toLowerCase();
        
        let keywordScore = 0;
        for (const term of queryTerms) {
          if (entryText.includes(term)) {
            keywordScore++;
          }
        }
        keywordScore = queryTerms.length > 0 ? keywordScore / queryTerms.length : 0;

        // Semantic similarity score
        let semanticScore = 0.5; // Default fallback if no embedding available
        
        if (queryEmbedding) {
          // Find this entry in the embeddings list
          const entryWithEmbedding = entriesWithEmbeddings.find(e => e.id === entry.id);
          
          if (entryWithEmbedding && entryWithEmbedding.embedding) {
            try {
              // Dequantize the stored embedding
              const entryEmbedding = safeDequantize(entryWithEmbedding.embedding);
              
              // Calculate cosine similarity (-1 to 1, higher = more similar)
              const similarity = safeCosineSimilarity(queryEmbedding, entryEmbedding);
              
              // Normalize to 0-1 range
              semanticScore = (similarity + 1) / 2;
            } catch (err) {
              console.warn(`[SemanticSearch] Failed to compute similarity for entry ${entry.id}:`, err);
            }
          }
        }

        // Hybrid score
        const score = semanticWeight * semanticScore + keywordWeight * keywordScore;

        // Generate reason string
        let reason = '';
        if (semanticScore > 0.5 && keywordScore > 0) {
          reason = `Semantic (${Math.round(semanticScore * 100)}%) + keyword (${Math.round(keywordScore * 100)}%)`;
        } else if (semanticScore > 0.5) {
          reason = `Semantic relevance (${Math.round(semanticScore * 100)}%)`;
        } else if (keywordScore > 0) {
          reason = `keyword match (${Math.round(keywordScore * 100)}%)`;
        } else {
          reason = 'Low relevance';
        }

        return {
          entry,
          score,
          reason,
        };
      });

      // Sort by score descending, filter out low-scoring entries
      const filtered = scored
        .filter(s => s.score > 0.1)  // Minimum threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const searchTime = performance.now() - startTime;

      console.log(`[SemanticSearch] Found ${filtered.length} matches in ${searchTime.toFixed(0)}ms (${entriesWithEmbeddings.length}/${allEntries.length} entries have embeddings)`);

      return {
        entries: filtered.map(s => ({
          ...s.entry,
          score: Math.round(s.score * 100) / 100,  // Round to 2 decimals
          reason: s.reason,
        })),
        query,
        searchTime,
      };
    } catch (err) {
      console.error('Error in semantic search:', err);
      return {
        entries: [],
        query,
        searchTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Export entries by phase as markdown report
   */
  async exportReportByPhase(phase: 'research' | 'planning' | 'execution'): Promise<string | null> {
    if (!this._state.active || !this._state.path) {
      console.error('[MemoryService] Cannot export report: memory bank not active');
      return null;
    }

    try {
      const entries = await this._store.queryByPhase(phase);

      if (entries.length === 0) {
        console.warn(`[MemoryService] No entries found for phase: ${phase}`);
        return null;
      }

      const report = this.generatePhaseReport(phase, entries);
      return report;
    } catch (err) {
      console.error(`[MemoryService] Failed to export ${phase} report:`, err);
      return null;
    }
  }

  /**
   * Save phase report to markdown file
   */
  async savePhaseReport(phase: 'research' | 'planning' | 'execution'): Promise<boolean> {
    if (!this._state.active || !this._state.path) {
      console.error('[MemoryService] Cannot save report: memory bank not active');
      return false;
    }

    try {
      const report = await this.exportReportByPhase(phase);
      if (!report) {
        return false;
      }

      const phaseUpper = phase.charAt(0).toUpperCase() + phase.slice(1);
      const fileName = `${phaseUpper}_REPORT.md`;
      const reportPath = vscode.Uri.joinPath(this._state.path, fileName);

      await vscode.workspace.fs.writeFile(reportPath, Buffer.from(report, 'utf8'));
      console.log(`[MemoryService] Saved ${phase} report to ${reportPath.fsPath}`);
      return true;
    } catch (err) {
      console.error(`[MemoryService] Failed to save ${phase} report:`, err);
      return false;
    }
  }

  /**
   * Generate phase report as memory entry (saved to database with vector tagging)
   * Called on phase transitions to synthesize completed phase work
   */
  async generatePhaseMemoryReport(phase: 'research' | 'planning' | 'execution'): Promise<boolean> {
    if (!this._state.active) {
      console.error('[MemoryService] Cannot generate report: memory bank not active');
      return false;
    }

    try {
      const store = getMemoryStore();
      
      // Query all entries from this phase
      const entries = await store.queryByPhase(phase, 1000);
      if (!entries || entries.length === 0) {
        console.warn(`[MemoryService] No entries found for ${phase} phase report`);
        return false;
      }

      const timestamp = new Date().toISOString();
      const lines: string[] = [];
      
      // Determine report type and file_type enum
      let reportFileType: 'RESEARCH_REPORT' | 'PLAN_REPORT' | 'EXECUTION_REPORT';
      let reportTitle: string;
      
      switch (phase) {
        case 'research':
          reportFileType = 'RESEARCH_REPORT';
          reportTitle = 'Research Phase Summary';
          break;
        case 'planning':
          reportFileType = 'PLAN_REPORT';
          reportTitle = 'Planning Phase Summary';
          break;
        case 'execution':
          reportFileType = 'EXECUTION_REPORT';
          reportTitle = 'Execution Phase Summary';
          break;
      }

      // Extract problem statement from CONTEXT entries
      const contextEntries = entries.filter(e => e.file_type === 'CONTEXT');
      const problemStatement = contextEntries.length > 0 
        ? this.extractProblemStatement(contextEntries)
        : `Continuing from ${phase} phase workflow`;

      // Extract decisions and findings
      const decisionEntries = entries.filter(e => e.file_type === 'DECISION');
      const progressEntries = entries.filter(e => e.file_type === 'PROGRESS');

      // Build Report using Think.prompt.md template structure
      lines.push(`# Research Brief: ${reportTitle}`);
      lines.push('');
      
      // Problem Statement
      lines.push('## Problem Statement');
      lines.push(problemStatement);
      lines.push('');
      
      // Context
      lines.push('## Context');
      lines.push('');
      lines.push('### Related Work');
      if (decisionEntries.length > 0) {
        decisionEntries.slice(0, 3).forEach((entry, idx) => {
          const title = entry.tag?.split(':')[0] || `Decision ${idx + 1}`;
          const snippet = entry.content.slice(0, 150).replace(/\n/g, ' ');
          lines.push(`- [${title}] ${snippet}...`);
        });
      } else {
        lines.push('- No prior decisions documented');
      }
      lines.push('');
      
      lines.push('### Current State');
      if (progressEntries.length > 0) {
        const latestProgress = progressEntries[0];
        lines.push(`- Last update: ${latestProgress.timestamp.split('T')[0]}`);
        lines.push(`- Total entries this phase: ${entries.length}`);
        lines.push(`- Decisions made: ${decisionEntries.length}`);
      } else {
        lines.push(`- Total entries this phase: ${entries.length}`);
      }
      lines.push('');
      
      lines.push('### Constraints');
      lines.push(`- Phase: ${phase}`);
      lines.push('- Report generated automatically on phase completion');
      lines.push('');
      
      // Research Findings
      lines.push('## Research Findings');
      lines.push('');
      
      lines.push('### Approach Options');
      if (decisionEntries.length > 0) {
        decisionEntries.forEach((entry, idx) => {
          lines.push(`${idx + 1}. **Option ${idx + 1}**`);
          lines.push(`   - Analysis: ${entry.content.slice(0, 100)}...`);
        });
      } else {
        lines.push('1. Continue with current workflow');
      }
      lines.push('');
      
      lines.push('### Recommended Approach');
      if (decisionEntries.length > 0) {
        const firstDecision = decisionEntries[0];
        lines.push(`Based on phase analysis: ${firstDecision.content.slice(0, 200).replace(/\n/g, ' ')}...`);
      } else {
        lines.push('No specific recommendations available - insufficient data');
      }
      lines.push('');
      
      lines.push('### Technical Considerations');
      lines.push('');
      lines.push('**Dependencies:**');
      lines.push(`- Phase: ${phase}`);
      lines.push(`- Entries analyzed: ${entries.length}`);
      lines.push('');
      
      lines.push('**Integration Points:**');
      const byType: Record<string, number> = {};
      entries.forEach(e => {
        byType[e.file_type] = (byType[e.file_type] || 0) + 1;
      });
      Object.entries(byType).forEach(([type, count]) => {
        lines.push(`- ${type}: ${count} entries`);
      });
      lines.push('');
      
      lines.push('**Testing Strategy:**');
      lines.push('- Validate phase transition completeness');
      lines.push('- Ensure all critical decisions documented');
      lines.push('- Verify progress tracking consistency');
      lines.push('');
      
      lines.push('### Risks & Mitigations');
      lines.push('');
      lines.push('| Risk | Impact | Likelihood | Mitigation |');
      lines.push('|------|--------|-----------|------------|');
      lines.push('| Incomplete documentation | Medium | Low | Review all entries before phase end |');
      lines.push('| Missing context | Medium | Medium | Supplement with manual notes |');
      lines.push('| Phase confusion | Low | Low | Clear phase markers in all entries |');
      lines.push('');
      
      // Implementation Readiness
      lines.push('## Implementation Readiness');
      lines.push('');
      
      lines.push('### Prerequisites');
      lines.push('- [x] Phase entries collected');
      lines.push('- [x] Decisions documented');
      lines.push('- [x] Progress tracked');
      lines.push('');
      
      lines.push('### Success Criteria');
      lines.push(`- [x] Report generated at ${timestamp.split('T')[0]}`);
      lines.push(`- [x] ${entries.length} entries processed`);
      lines.push(`- [x] ${decisionEntries.length} key decisions captured`);
      lines.push('');
      
      lines.push('### Next Steps');
      if (phase === 'research') {
        lines.push('1. Review findings from research phase');
        lines.push('2. Begin planning phase with documented decisions');
        lines.push('3. Identify approach options for implementation');
      } else if (phase === 'planning') {
        lines.push('1. Review plan from planning phase');
        lines.push('2. Begin execution with clear tasks');
        lines.push('3. Track progress against plan');
      } else {
        lines.push('1. Review execution summary');
        lines.push('2. Assess completion against criteria');
        lines.push('3. Plan next phase or iteration');
      }
      lines.push('');
      
      // References
      lines.push('## References');
      if (decisionEntries.length > 0) {
        lines.push('');
        lines.push('**Key Decisions:**');
        decisionEntries.slice(0, 5).forEach(entry => {
          lines.push(`- [${entry.timestamp.split('T')[0]}] ${entry.tag}`);
        });
      }
      lines.push('');

      const reportContent = lines.join('\n');

      // Save report as memory entry with appropriate file_type
      const entryId = await this._store.appendEntry({
        file_type: reportFileType,
        tag: `${reportFileType}:${timestamp.split('T')[0]}`,
        content: reportContent,
        timestamp: timestamp,
        phase: phase
      });

      if (entryId) {
        console.log(`[MemoryService] Saved ${phase} phase report as ${reportFileType} (ID: ${entryId})`);
        return true;
      }
      return false;
    } catch (err) {
      console.error(`[MemoryService] Failed to generate ${phase} report:`, err);
      return false;
    }
  }

  /**
   * Extract problem statement from context entries
   */
  private extractProblemStatement(contextEntries: StoreMemoryEntry[]): string {
    if (contextEntries.length === 0) {
      return 'No problem statement defined.';
    }
    
    const latestContext = contextEntries[0];
    const content = latestContext.content;
    
    // Try to extract first sentence or paragraph
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      return lines[0].slice(0, 200) + (lines[0].length > 200 ? '...' : '');
    }
    
    return content.slice(0, 200) + (content.length > 200 ? '...' : '');
  }

  /**
   * Save all phase reports as memory entries
   */
  async saveAllPhaseMemoryReports(): Promise<boolean> {
    const results = await Promise.all([
      this.generatePhaseMemoryReport('research'),
      this.generatePhaseMemoryReport('planning'),
      this.generatePhaseMemoryReport('execution')
    ]);

    return results.every(r => r === true);
  }

  /**
   * Save all phase reports (research, plan, execution)
   */
  async saveAllPhaseReports(): Promise<boolean> {
    const results = await Promise.all([
      this.savePhaseReport('research'),
      this.savePhaseReport('planning'),
      this.savePhaseReport('execution')
    ]);

    return results.every(r => r === true);
  }

  private generatePhaseReport(phase: string, entries: StoreMemoryEntry[]): string {
    const lines: string[] = [];
    const phaseUpper = phase.charAt(0).toUpperCase() + phase.slice(1);

    lines.push(`# ${phaseUpper} Report`);
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Entries: ${entries.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Group by file_type
    const byType: Record<string, StoreMemoryEntry[]> = {};
    entries.forEach(entry => {
      if (!byType[entry.file_type]) {
        byType[entry.file_type] = [];
      }
      byType[entry.file_type].push(entry);
    });

    // Sort entries by timestamp (newest first)
    Object.keys(byType).forEach(type => {
      byType[type].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    });

    // Brief section
    if (byType.BRIEF && byType.BRIEF.length > 0) {
      lines.push(`## ${phaseUpper} Overview`);
      lines.push('');
      byType.BRIEF.forEach((entry, idx) => {
        lines.push(`### ${entry.tag || `${phase} Brief ${idx + 1}`}`);
        lines.push(`**Date:** ${entry.timestamp.split('T')[0]}`);
        lines.push('');
        lines.push(entry.content);
        lines.push('');
        lines.push('---');
        lines.push('');
      });
    }

    // Progress section
    if (byType.PROGRESS && byType.PROGRESS.length > 0) {
      lines.push(`## ${phaseUpper} Progress`);
      lines.push('');
      byType.PROGRESS.forEach((entry) => {
        lines.push(`### ${entry.tag}`);
        lines.push(`**Date:** ${entry.timestamp.split('T')[0]}`);
        lines.push('');
        lines.push(entry.content);
        lines.push('');
      });
      lines.push('---');
      lines.push('');
    }

    // Decision section
    if (byType.DECISION && byType.DECISION.length > 0) {
      lines.push(`## ${phaseUpper} Decisions`);
      lines.push('');
      byType.DECISION.forEach((entry) => {
        lines.push(`### ${entry.tag}`);
        lines.push(`**Date:** ${entry.timestamp.split('T')[0]}`);
        lines.push('');
        lines.push(entry.content);
        lines.push('');
      });
      lines.push('---');
      lines.push('');
    }

    // Context section
    if (byType.CONTEXT && byType.CONTEXT.length > 0) {
      lines.push(`## ${phaseUpper} Context`);
      lines.push('');
      byType.CONTEXT.forEach((entry) => {
        lines.push(`### ${entry.tag}`);
        lines.push(`**Date:** ${entry.timestamp.split('T')[0]}`);
        lines.push('');
        lines.push(entry.content);
        lines.push('');
      });
      lines.push('---');
      lines.push('');
    }

    // Pattern section
    if (byType.PATTERN && byType.PATTERN.length > 0) {
      lines.push(`## Patterns Discovered`);
      lines.push('');
      byType.PATTERN.forEach((entry) => {
        lines.push(`### ${entry.tag}`);
        lines.push(`**Date:** ${entry.timestamp.split('T')[0]}`);
        lines.push('');
        lines.push(entry.content);
        lines.push('');
      });
    }

    lines.push('---');
    lines.push('*Report generated by AI-Memory Report System*');

    return lines.join('\n');
  }

  /**
   * Edit an existing memory entry (content, tag, or phase)
   * Useful for corrections, additions, or refining earlier entries
   * Example: Add research findings discovered during execution phase
   */
  async editEntry(
    id: number,
    updates: {
      content?: string;
      tag?: string;
      phase?: 'research' | 'planning' | 'execution' | 'checkpoint';
      progress_status?: 'done' | 'in-progress' | 'draft' | 'deprecated';
    }
  ): Promise<boolean> {
    if (!this._state.active) {
      console.error('[MemoryService] Cannot edit entry: memory bank not active');
      return false;
    }

    try {
      const success = await this._store.updateEntry(id, updates);
      if (success) {
        console.log(`[MemoryService] Edited entry ${id}:`, {
          content: updates.content ? `${updates.content.slice(0, 50)}...` : undefined,
          tag: updates.tag,
          phase: updates.phase,
          progress: updates.progress_status
        });
      }
      return success;
    } catch (err) {
      console.error('[MemoryService] Edit entry failed:', err);
      return false;
    }
  }

  /**
   * Append additional content to an existing entry
   * Useful for adding discoveries or refinements without replacing original
   * Example: "Found additional research on [date]: [new findings]"
   */
  async appendToEntry(id: number, additionalContent: string): Promise<boolean> {
    if (!this._state.active) {
      console.error('[MemoryService] Cannot append to entry: memory bank not active');
      return false;
    }

    try {
      // Retrieve the entry from any type
      const decisionResult = await this._store.queryByType('DECISION', 1000);
      let entry = decisionResult.entries.find((e: StoreMemoryEntry) => e.id === id);
      
      if (!entry) {
        const contextResult = await this._store.queryByType('CONTEXT', 1000);
        entry = contextResult.entries.find((e: StoreMemoryEntry) => e.id === id);
      }
      
      if (!entry) {
        const progressResult = await this._store.queryByType('PROGRESS', 1000);
        entry = progressResult.entries.find((e: StoreMemoryEntry) => e.id === id);
      }

      if (!entry) {
        console.error(`[MemoryService] Entry ${id} not found`);
        return false;
      }

      // Append new content with timestamp marker
      const timestamp = new Date().toISOString().split('T')[0];
      const updatedContent = `${entry.content}\n\n---\n\n**[Updated ${timestamp}]** ${additionalContent}`;
      
      return this.editEntry(id, { content: updatedContent });
    } catch (err) {
      console.error('[MemoryService] Append to entry failed:', err);
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
