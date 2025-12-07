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
      // Get all entry types
      const types: StoreMemoryEntry['file_type'][] = ['CONTEXT', 'DECISION', 'PROGRESS', 'PATTERN', 'BRIEF'];
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
   * Note: Semantic similarity requires embeddings to be pre-computed
   * This is a placeholder for PHASE 7+ implementation
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
      // Get all entries
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

      // Score entries using keyword relevance (Phase 7+: add embedding similarity)
      const scored = allEntries.map(entry => {
        // Keyword matching: simple presence-based scoring
        const queryTerms = query.toLowerCase().split(/\s+/);
        const entryText = (entry.tag + ' ' + entry.content).toLowerCase();
        
        let keywordScore = 0;
        for (const term of queryTerms) {
          if (entryText.includes(term)) {
            keywordScore++;
          }
        }
        // Normalize: divide by number of terms
        keywordScore = keywordScore / Math.max(queryTerms.length, 1);

        // Semantic score: placeholder (0.5 default)
        // TODO: Implement embedding similarity in PHASE 7
        const semanticScore = 0.5;

        // Hybrid score
        const score = semanticWeight * semanticScore + keywordWeight * keywordScore;

        return {
          entry,
          score,
          reason: keywordScore > 0 ? `Keyword match (${Math.round(keywordScore * 100)}%)` : 'Semantic relevance',
        };
      });

      // Sort by score descending, filter out low-scoring entries
      const filtered = scored
        .filter(s => s.score > 0.1)  // Minimum threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const searchTime = performance.now() - startTime;

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
}

// Singleton instance
let _memoryService: MemoryBankService | undefined;

export function getMemoryService(): MemoryBankService {
  if (!_memoryService) {
    _memoryService = new MemoryBankService();
  }
  return _memoryService;
}
