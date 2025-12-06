// AI-Memory Service - Core memory management with SQLite backend
// DB-only persistence (markdown export removed)

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getMemoryStore, MemoryStore, MemoryEntry as StoreMemoryEntry } from './memoryStore';

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

const MEMORY_FILES = [
  'activeContext.md',
  'decisionLog.md',
  'progress.md',
  'systemPatterns.md',
  'projectBrief.md'
] as const;

export type MemoryFileName = typeof MEMORY_FILES[number];

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

  /**
   * Provide dashboard-friendly metrics snapshot
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

  private getToday(): string {
    return new Date().toISOString().split('T')[0];
  }

  private formatTag(type: MemoryEntry['type']): string {
    return `[${type}:${this.getToday()}]`;
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
          if (stat.type !== vscode.FileType.Directory) {
            continue;
          }

          console.log('[MemoryService] Found memory directory at:', memoryPath.fsPath);

          const dbPath = path.join(memoryPath.fsPath, 'memory.db');
          console.log('[MemoryService] Initializing database at:', dbPath);

          let initialized = false;
          try {
            initialized = await this._store.init(dbPath);
          } catch (dbError) {
            console.error('[MemoryService] Database initialization threw error:', dbError);
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

          this._state = {
            active: true,
            path: memoryPath,
            dbPath,
            activity: 'idle',
            backend: this._store.getBackend(),
            files: {
              activeContext: false,
              decisionLog: false,
              systemPatterns: false,
              progress: false,
              projectBrief: false
            }
          };

          console.log('[MemoryService] Memory bank detected:', {
            active: this._state.active,
            backend: this._state.backend
          });

          this._onDidChangeState.fire(this._state);
          return this._state;
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
   * Create new AI-Memory folder backed by SQLite only (no markdown files)
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

      // Seed initial entries for clarity (DB-only)
      const today = this.getToday();
      const seedEntries: Array<StoreMemoryEntry> = [
        { file_type: 'BRIEF', timestamp: new Date().toISOString(), tag: `BRIEF:${today}`, content: 'AI-Memory initialized' },
        { file_type: 'CONTEXT', timestamp: new Date().toISOString(), tag: `CONTEXT:${today}`, content: 'AI-Memory initialized' },
        { file_type: 'PATTERN', timestamp: new Date().toISOString(), tag: `PATTERN:${today}`, content: 'AI-Memory initialized' },
        { file_type: 'DECISION', timestamp: new Date().toISOString(), tag: `DECISION:${today}`, content: 'AI-Memory initialized' },
        { file_type: 'PROGRESS', timestamp: new Date().toISOString(), tag: `PROGRESS:${today}`, content: 'AI-Memory initialized' }
      ];

      for (const entry of seedEntries) {
        await this._store.appendEntry(entry);
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
   * Calculate context budget based on current token usage
   * Allocates tokens: 20% for output buffer, rest available for context
   */
  getContextBudget(usedTokens: number, contextWindow: number = 200000): {
    total: number;
    used: number;
    remaining: number;
    percentUsed: number;
    status: 'healthy' | 'warning' | 'critical';
    recommendations: string[];
  } {
    const outputBuffer = contextWindow * 0.20; // Reserve 20% for output
    const availableInput = contextWindow - outputBuffer;
    const remaining = availableInput - usedTokens;
    const percentUsed = (usedTokens / availableInput) * 100;

    let status: 'healthy' | 'warning' | 'critical';
    let recommendations: string[] = [];

    if (remaining > 50000) {
      status = 'healthy';
      recommendations = ['Continue adding context as needed'];
    } else if (remaining > 10000) {
      status = 'warning';
      recommendations = [
        'Context budget getting low (< 50K tokens)',
        'Consider summarizing long contexts',
        'May need new chat soon'
      ];
    } else {
      status = 'critical';
      recommendations = [
        'Critical: Context budget nearly exhausted (< 10K tokens)',
        'Start new chat recommended',
        'Compress or remove non-essential context'
      ];
    }

    return {
      total: availableInput,
      used: usedTokens,
      remaining: Math.max(0, remaining),
      percentUsed: Math.min(100, percentUsed),
      status,
      recommendations
    };
  }

  /**
   * Select memory entries that fit within a token budget
   * Uses greedy algorithm: includes top-scored entries until budget exhausted
   * 
   * @param taskDescription Brief description of the task for relevance scoring
   * @param tokenBudget Maximum tokens available for context
   * @returns Selected entries and coverage stats
   */
  async selectContextForBudget(
    taskDescription: string,
    tokenBudget: number
  ): Promise<{
    entries: StoreMemoryEntry[];
    coverage: string;
    totalTokens: number;
    selectedCount: number;
    totalCount: number;
  }> {
    if (!this._state.active) {
      return {
        entries: [],
        coverage: 'Memory bank inactive',
        totalTokens: 0,
        selectedCount: 0,
        totalCount: 0
      };
    }

    // Fetch all entries (reasonable limit for typical workflows)
    const allEntries = await this._store.queryByType('CONTEXT', 100);
    const decisions = await this._store.queryByType('DECISION', 100);
    const patterns = await this._store.queryByType('PATTERN', 100);
    const briefs = await this._store.queryByType('BRIEF', 100);

    const allMemoryEntries: StoreMemoryEntry[] = [
      ...allEntries.entries,
      ...decisions.entries,
      ...patterns.entries,
      ...briefs.entries
    ];

    if (allMemoryEntries.length === 0) {
      return {
        entries: [],
        coverage: 'No memory entries found',
        totalTokens: 0,
        selectedCount: 0,
        totalCount: 0
      };
    }

    // Score entries for relevance (simple: type + recency weighting)
    // Full implementation would use RelevanceScorer
    const scored = allMemoryEntries.map(entry => {
      // Simple scoring: recent + high-priority types score higher
      const typeScore = this.getTypeScore(entry.file_type);
      const recencyScore = this.getRecencyScore(entry.timestamp);
      return {
        entry,
        score: typeScore * recencyScore
      };
    });

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    // Greedy selection: include entries until budget exhausted
    const selected: StoreMemoryEntry[] = [];
    let estimatedTokens = 0;

    for (const { entry } of scored) {
      // Rough token estimate: 1 token per 4 characters
      const entryTokens = Math.ceil(entry.content.length / 4);

      if (estimatedTokens + entryTokens <= tokenBudget) {
        selected.push(entry);
        estimatedTokens += entryTokens;
      }
    }

    const coverage = `${selected.length}/${allMemoryEntries.length} entries selected (${estimatedTokens}K tokens)`;

    return {
      entries: selected,
      coverage,
      totalTokens: estimatedTokens,
      selectedCount: selected.length,
      totalCount: allMemoryEntries.length
    };
  }

  /**
   * Get base score for entry type (priority weighting)
   */
  private getTypeScore(fileType: StoreMemoryEntry['file_type']): number {
    switch (fileType) {
      case 'BRIEF':
        return 1.5; // Project brief is always relevant
      case 'PATTERN':
        return 1.4; // System patterns are important
      case 'CONTEXT':
        return 1.3; // Active context is fairly important
      case 'DECISION':
        return 1.2; // Decisions inform current work
      case 'PROGRESS':
        return 1.0; // Progress entries are neutral
      default:
        return 0.8;
    }
  }

  /**
   * Get recency score for entry (time decay weighting)
   */
  private getRecencyScore(timestamp: string): number {
    try {
      const entryDate = new Date(timestamp);
      const now = new Date();
      const ageMs = now.getTime() - entryDate.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      if (ageDays < 7) {
        return 1.0; // Last 7 days: full score
      } else if (ageDays < 30) {
        return 0.7; // 7-30 days: 70% score
      } else if (ageDays < 90) {
        return 0.3; // 30-90 days: 30% score
      } else {
        return 0.1; // Over 90 days: 10% score
      }
    } catch {
      return 0.5; // Default if parsing fails
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
