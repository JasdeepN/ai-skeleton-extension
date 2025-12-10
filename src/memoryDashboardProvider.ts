// AI-Memory Dashboard Tree View Provider
// Shows database status, metrics, latest entries, and tasks in the Activity Bar

import * as vscode from 'vscode';
import { FILE_TYPE_TO_DISPLAY, MemoryEntry } from './memoryStore';
import { DashboardMetrics, getMemoryService } from './memoryService';
import { getMetricsService } from './metricsService';
import { detectPhase, WorkflowPhase } from './phaseDetector';
import { parseWorkflowSteps, WorkflowStep } from './workflowParser';

/**
 * Calculate string similarity (0-1) using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const lower1 = str1.toLowerCase();
  const lower2 = str2.toLowerCase();
  
  // Exact match
  if (lower1 === lower2) return 1.0;
  
  // Contains match
  if (lower1.includes(lower2) || lower2.includes(lower1)) return 0.8;
  
  // Word overlap
  const words1 = new Set(lower1.split(/\s+/));
  const words2 = new Set(lower2.split(/\s+/));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  const jaccard = intersection.length / union.size;
  
  return Math.max(0, jaccard);
}

const FILE_TYPE_LABELS: Record<MemoryEntry['file_type'], string> = {
  CONTEXT: 'Context',
  DECISION: 'Decisions',
  PROGRESS: 'Progress',
  PATTERN: 'Patterns',
  BRIEF: 'Brief',
  RESEARCH_REPORT: 'Research Report',
  PLAN_REPORT: 'Plan Report',
  EXECUTION_REPORT: 'Execution Report'
};

class DashboardTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly kind: string,
    public readonly meta?: any
  ) {
    super(label, collapsibleState);
  }
}

export class MemoryDashboardTreeProvider implements vscode.TreeDataProvider<DashboardTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DashboardTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private memoryService = getMemoryService();
  private cachedMetrics: DashboardMetrics | null = null;
  private lastDetectedPhase: WorkflowPhase | null = null;
  private phaseCheckTimer: NodeJS.Timeout | null = null;
  private readonly PHASE_CHECK_INTERVAL = 2000; // Check every 2 seconds

  constructor() {
    this.memoryService.onDidChangeState(() => {
      this.refresh();
    });

    // Monitor for phase transitions
    this.startPhaseMonitoring();
  }

  /**
   * Start monitoring for phase transitions
   */
  private startPhaseMonitoring(): void {
    if (this.phaseCheckTimer) {
      clearInterval(this.phaseCheckTimer);
    }

    this.phaseCheckTimer = setInterval(async () => {
      try {
        const currentPhase = await detectPhase();
        if (currentPhase !== this.lastDetectedPhase) {
          console.log(`[MemoryDashboard] Phase transition detected: ${this.lastDetectedPhase} → ${currentPhase}`);
          this.lastDetectedPhase = currentPhase;
          // Debounce refresh to avoid excessive tree updates
          this.debounceRefresh();
        }
      } catch (error) {
        // Silently handle detection errors
      }
    }, this.PHASE_CHECK_INTERVAL);
  }

  /**
   * Debounced refresh to prevent excessive tree updates
   */
  private debounceRefreshTimer: NodeJS.Timeout | null = null;
  private debounceRefresh(): void {
    if (this.debounceRefreshTimer) {
      clearTimeout(this.debounceRefreshTimer);
    }
    this.debounceRefreshTimer = setTimeout(() => {
      this.refresh();
    }, 300); // 300ms debounce delay
  }

  refresh(): void {
    this.cachedMetrics = null;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Cleanup resources (timers, listeners)
   */
  dispose(): void {
    if (this.phaseCheckTimer) {
      clearInterval(this.phaseCheckTimer);
    }
    if (this.debounceRefreshTimer) {
      clearTimeout(this.debounceRefreshTimer);
    }
  }

  getTreeItem(element: DashboardTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DashboardTreeItem): Promise<DashboardTreeItem[]> {
    if (!element) {
      const metrics = this.cachedMetrics || await this.memoryService.getDashboardMetrics();
      this.cachedMetrics = metrics;

      if (!metrics.state.active || !metrics.state.path) {
        const inactive = new DashboardTreeItem('AI-Memory: INACTIVE', vscode.TreeItemCollapsibleState.None, 'inactive');
        inactive.description = 'Click to create';
        inactive.command = { command: 'aiSkeleton.memory.create', title: 'Create Memory Bank' };
        inactive.iconPath = new vscode.ThemeIcon('database');
        return [inactive];
      }

      return [
        new DashboardTreeItem('Status', vscode.TreeItemCollapsibleState.Expanded, 'status', metrics),
        new DashboardTreeItem('Context Switching', vscode.TreeItemCollapsibleState.Expanded, 'context-switching'),
        new DashboardTreeItem('📚 Memory Entries', vscode.TreeItemCollapsibleState.Expanded, 'memory-entries'),
        new DashboardTreeItem('Metrics', vscode.TreeItemCollapsibleState.Expanded, 'metrics', metrics),
        new DashboardTreeItem('Semantic Search', vscode.TreeItemCollapsibleState.Expanded, 'semantic'),
        new DashboardTreeItem('Actions', vscode.TreeItemCollapsibleState.Expanded, 'actions')
      ];
    }

    switch (element.kind) {
      case 'status':
        return this.buildStatusItems(element.meta as DashboardMetrics);
      case 'context-switching':
        return await this.buildContextSwitchingItems();
      case 'context-switching-phase':
        return await this.buildPhaseHistoryItems(element.meta as string);
      case 'memory-entries':
        return await this.buildMemoryEntriesSection();
      case 'memory-entries-category':
        return await this.buildEntriesForType(element.meta?.type);
      case 'memory-entries-day':
        return await this.buildEntriesForDay(element.meta?.type, element.meta?.date);
      case 'metrics':
        return await this.buildMetricsItems(element.meta as DashboardMetrics);
      case 'memory-bank':
        return await this.buildMemoryBankItems();
      case 'semantic':
        return await this.buildSemanticItems();
      case 'latest':
        return this.buildLatestTypeParents(element.meta as DashboardMetrics);
      case 'latest-type':
        return this.buildLatestEntries(element.meta as { type: MemoryEntry['file_type']; metrics: DashboardMetrics });
      case 'counts-parent':
        return this.buildCountsItems(element.meta as DashboardMetrics);
      case 'actions':
        return this.buildActions();
      default:
        return [];
    }
  }

  private buildStatusItems(metrics: DashboardMetrics): DashboardTreeItem[] {
    const items: DashboardTreeItem[] = [];
    const state = metrics.state;

    const active = new DashboardTreeItem(
      state.active ? 'Memory: ACTIVE' : 'Memory: INACTIVE',
      vscode.TreeItemCollapsibleState.None,
      'status-item'
    );
    active.iconPath = new vscode.ThemeIcon(state.active ? 'check' : 'warning');
    active.description = state.path?.fsPath.split(/[\\/]/).pop();
    items.push(active);

    const backend = new DashboardTreeItem(`Backend: ${state.backend ?? 'none'}`, vscode.TreeItemCollapsibleState.None, 'status-item');
    backend.iconPath = new vscode.ThemeIcon('database');
    items.push(backend);

    if (state.dbPath) {
      const pathItem = new DashboardTreeItem('DB Path', vscode.TreeItemCollapsibleState.None, 'status-item');
      pathItem.description = state.dbPath;
      pathItem.iconPath = new vscode.ThemeIcon('file');
      items.push(pathItem);
    }

    return items;
  }

  private async buildMetricsItems(metrics: DashboardMetrics): Promise<DashboardTreeItem[]> {
    const items: DashboardTreeItem[] = [];

    // DB Size
    const size = metrics.dbSizeBytes != null ? this.formatBytes(metrics.dbSizeBytes) : 'Unknown';
    const sizeItem = new DashboardTreeItem(`DB Size: ${size}`, vscode.TreeItemCollapsibleState.None, 'metric-item');
    sizeItem.iconPath = new vscode.ThemeIcon('folder');
    items.push(sizeItem);

    // Average Query Time
    const avg = metrics.avgQueryTimeMs != null ? `${metrics.avgQueryTimeMs.toFixed(1)} ms` : 'N/A';
    const avgItem = new DashboardTreeItem(`Avg Query: ${avg}`, vscode.TreeItemCollapsibleState.None, 'metric-item');
    avgItem.iconPath = new vscode.ThemeIcon('clock');
    items.push(avgItem);

    // Token Metrics - add latest token budget status
    try {
      const metricsService = getMetricsService();
      const summary = await metricsService.getDashboardMetrics();
      
      if (summary.callCount > 0) {
        const budgetItem = new DashboardTreeItem(
          `Token Budget: ${summary.percentageUsed}% (${summary.totalTokensUsed}K/${160}K)`,
          vscode.TreeItemCollapsibleState.None,
          'metric-item'
        );
        budgetItem.iconPath = new vscode.ThemeIcon('zap');
        
        // Color code by status
        if (summary.currentStatus === 'critical') {
          budgetItem.description = 'CRITICAL';
          budgetItem.resourceUri = vscode.Uri.parse(`status://critical`);
        } else if (summary.currentStatus === 'warning') {
          budgetItem.description = 'WARNING';
          budgetItem.resourceUri = vscode.Uri.parse(`status://warning`);
        } else {
          budgetItem.description = 'Healthy';
        }
        
        items.push(budgetItem);
      }
    } catch (err) {
      console.debug('[MemoryDashboard] Failed to load token metrics:', err);
    }

    // Vector Database Stats
    if (metrics.vectorStats) {
      const vectorItem = new DashboardTreeItem(
        `Vector DB: ${metrics.vectorStats.embeddedCount}/${metrics.vectorStats.totalCount} (${metrics.vectorStats.coveragePercent}%)`,
        vscode.TreeItemCollapsibleState.None,
        'metric-item'
      );
      vectorItem.description = `${(metrics.vectorStats.storageBytesUsed / 1024).toFixed(1)} KB`;
      vectorItem.iconPath = new vscode.ThemeIcon('circuit-board');
      items.push(vectorItem);
    }

    // Entry Counts
    const countsParent = new DashboardTreeItem('Entry Counts', vscode.TreeItemCollapsibleState.Collapsed, 'counts-parent', metrics);
    countsParent.iconPath = new vscode.ThemeIcon('list-ordered');
    items.push(countsParent);

    return items;
  }

  private async buildMemoryBankItems(): Promise<DashboardTreeItem[]> {
    const items: DashboardTreeItem[] = [];

    // Display all memory file types with entry counts
    const memoryFiles = [
      { type: 'DECISION' as const, label: '📋 Decision Log', icon: 'note' },
      { type: 'CONTEXT' as const, label: '📍 Context', icon: 'symbol-event' },
      { type: 'PROGRESS' as const, label: '✅ Progress', icon: 'checklist' },
      { type: 'PATTERN' as const, label: '🔗 Patterns', icon: 'symbol-structure' },
      { type: 'BRIEF' as const, label: '📚 Project Brief', icon: 'book' },
      { type: 'RESEARCH_REPORT' as const, label: '🔍 Research Reports', icon: 'telescope' },
      { type: 'PLAN_REPORT' as const, label: '📐 Plan Reports', icon: 'whiteboard' },
      { type: 'EXECUTION_REPORT' as const, label: '⚙️ Execution Reports', icon: 'wrench' }
    ];

    for (const file of memoryFiles) {
      try {
        // Get count for this file type
        const entries = await this.memoryService.queryByType(file.type);
        const count = entries.length;
        
        const item = new DashboardTreeItem(
          `${file.label} (${count})`,
          vscode.TreeItemCollapsibleState.None,
          'memory-file',
          file.type
        );
        item.iconPath = new vscode.ThemeIcon(file.icon);
        item.description = count > 0 ? 'Click to view' : 'Empty';
        
        // Click to open memory file in editor
        if (count > 0) {
          item.command = {
            command: 'aiSkeleton.memory.viewFile',
            title: `View ${file.label}`,
            arguments: [file.type]
          };
        }
        
        items.push(item);
      } catch (err) {
        console.debug(`[MemoryDashboard] Failed to load ${file.type}:`, err);
      }
    }

    return items;
  }

  private async buildContextSwitchingItems(): Promise<DashboardTreeItem[]> {
    const items: DashboardTreeItem[] = [];

    // Detect current phase
    const currentPhase = await detectPhase();
    const phaseLabel = this.mapPhaseToLabel(currentPhase);

    // Add Current Phase indicator at top
    if (currentPhase && currentPhase !== null) {
      const phaseIcon = this.getPhaseIcon(currentPhase);
      const phaseItem = new DashboardTreeItem(
        `${phaseIcon} Current Phase: ${phaseLabel}`,
        vscode.TreeItemCollapsibleState.Expanded,
        'current-phase'
      );
      phaseItem.description = 'Active workflow mode';
      items.push(phaseItem);

      // Add workflow steps for current phase
      const phaseSteps = await this.buildCurrentPhaseSection(currentPhase);
      items.push(...phaseSteps);
    }

    // Current Context
    const current = await this.memoryService.getCurrentContext();
    const currentItem = new DashboardTreeItem(
      current ? `📋 Current Context: ${(current as any).tag || 'Active'}` : '📋 No Active Context',
      vscode.TreeItemCollapsibleState.None,
      'context-item'
    );
    currentItem.description = current ? (current as any).timestamp?.split('T')[0] : 'Start new task';
    if (current) {
      // Click to open context in editor
      currentItem.command = { 
        command: 'aiSkeleton.context.open', 
        title: 'Open Context',
        arguments: [(current as any).content, (current as any).tag]
      };
    } else {
      currentItem.command = { command: 'aiSkeleton.context.newTask', title: 'New Task' };
    }
    items.push(currentItem);

    // Phase History
    const history = await this.memoryService.getPhaseHistory();

    const researchItem = new DashboardTreeItem(
      `🔍 Research (${history.research.done}✓ ${history.research.inProgress}⏳)`,
      vscode.TreeItemCollapsibleState.Collapsed,
      'context-switching-phase',
      'research'
    );
    items.push(researchItem);

    const planningItem = new DashboardTreeItem(
      `📐 Planning (${history.planning.done}✓ ${history.planning.inProgress}⏳)`,
      vscode.TreeItemCollapsibleState.Collapsed,
      'context-switching-phase',
      'planning'
    );
    items.push(planningItem);

    const executionItem = new DashboardTreeItem(
      `✔️ Execution (${history.execution.done}✓ ${history.execution.inProgress}⏳)`,
      vscode.TreeItemCollapsibleState.Collapsed,
      'context-switching-phase',
      'execution'
    );
    items.push(executionItem);

    // Actions
    const clearItem = new DashboardTreeItem('⊝ Clear Context', vscode.TreeItemCollapsibleState.None, 'context-action');
    clearItem.command = { command: 'aiSkeleton.context.clear', title: 'Clear Context' };
    items.push(clearItem);

    const newTaskItem = new DashboardTreeItem('➕ New Task', vscode.TreeItemCollapsibleState.None, 'context-action');
    newTaskItem.command = { command: 'aiSkeleton.context.newTask', title: 'New Task' };
    items.push(newTaskItem);

    return items;
  }

  /**
   * Build tree items for current phase's workflow steps
   */
  private async buildCurrentPhaseSection(phase: WorkflowPhase): Promise<DashboardTreeItem[]> {
    if (!phase || phase === null) {
      return [];
    }

    // Only process standard workflow phases (not checkpoint)
    if (phase !== 'research' && phase !== 'planning' && phase !== 'execution') {
      return [];
    }

    const items: DashboardTreeItem[] = [];
    
    try {
      // Parse workflow steps for this phase
      const steps = await parseWorkflowSteps(phase);
      
      if (steps.length === 0) {
        return [];
      }

      // Match progress entries to workflow steps
      const stepStatusMap = await this.matchProgressToSteps(phase, steps);

      // Create tree items for each step
      for (const step of steps) {
        const status = stepStatusMap.get(step.order) || 'not-started';
        const statusIcon = this.getStatusIcon(status);
        
        const stepItem = new DashboardTreeItem(
          `${statusIcon} ${step.title}`,
          vscode.TreeItemCollapsibleState.None,
          'workflow-step',
          { phase, step, status }
        );
        stepItem.description = step.description?.substring(0, 50) + (step.description?.length || 0 > 50 ? '…' : '');
        items.push(stepItem);
      }
    } catch (error) {
      console.error(`[Dashboard] Error building phase section for ${phase}:`, error);
    }

    return items;
  }

  /**
   * Build memory entry tree section with 8 entry types
   */
  private async buildMemoryEntriesSection(): Promise<DashboardTreeItem[]> {
    const items: DashboardTreeItem[] = [];

    // Define entry types and their display labels
    const entryTypes: Array<{ type: MemoryEntry['file_type']; label: string; icon: string }> = [
      { type: 'RESEARCH_REPORT', label: 'Research Reports', icon: '🔍' },
      { type: 'PLAN_REPORT', label: 'Plan Reports', icon: '📐' },
      { type: 'EXECUTION_REPORT', label: 'Execution Reports', icon: '⚙️' },
      { type: 'CONTEXT', label: 'Active Context', icon: '📍' },
      { type: 'DECISION', label: 'Decisions', icon: '✓' },
      { type: 'PROGRESS', label: 'Progress Tracking', icon: '📊' },
      { type: 'PATTERN', label: 'System Patterns', icon: '🏗️' },
      { type: 'BRIEF', label: 'Project Brief', icon: '📋' }
    ];

    try {
      // Build category item for each entry type
      for (const { type, label, icon } of entryTypes) {
        const categoryItem = new DashboardTreeItem(
          `${icon} ${label}`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'memory-entries-category',
          { type, label }
        );
        // Show count of entries
        const entries = await this.memoryService.queryByType(type);
        categoryItem.description = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
        items.push(categoryItem);
      }
    } catch (error) {
      console.error(`[Dashboard] Error building memory entries section:`, error);
    }

    return items;
  }

  /**
   * Build day folders for a specific entry type
   */
  private async buildEntriesForType(type: MemoryEntry['file_type']): Promise<DashboardTreeItem[]> {
    const items: DashboardTreeItem[] = [];

    try {
      // Query entries by type
      const entries = await this.memoryService.queryByType(type);

      if (entries.length === 0) {
        const emptyItem = new DashboardTreeItem('No entries yet', vscode.TreeItemCollapsibleState.None, 'memory-entry-empty');
        emptyItem.description = 'No entries of this type';
        emptyItem.iconPath = new vscode.ThemeIcon('circle-outline');
        return [emptyItem];
      }

      // Group entries by day (using timestamp, sorted by insert ID descending)
      const entriesByDay = new Map<string, any[]>();
      for (const entry of entries) {
        const date = entry.timestamp ? entry.timestamp.split('T')[0] : 'Unknown';
        if (!entriesByDay.has(date)) {
          entriesByDay.set(date, []);
        }
        entriesByDay.get(date)!.push(entry);
      }

      // Sort days descending (newest first) and create day folder items
      const sortedDays = Array.from(entriesByDay.keys()).sort((a, b) => b.localeCompare(a));
      
      for (const date of sortedDays) {
        const dayEntries = entriesByDay.get(date)!;
        // Sort entries within day by ID descending (newest first)
        dayEntries.sort((a, b) => (b.id || 0) - (a.id || 0));
        
        const dayLabel = this.formatDateLabel(date);
        const dayItem = new DashboardTreeItem(
          `📅 ${dayLabel}`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'memory-entries-day',
          { type, date }
        );
        dayItem.description = `${dayEntries.length} ${dayEntries.length === 1 ? 'entry' : 'entries'}`;
        items.push(dayItem);
      }
    } catch (error) {
      console.error(`[Dashboard] Error building entries for type ${type}:`, error);
      const errorItem = new DashboardTreeItem('Error loading entries', vscode.TreeItemCollapsibleState.None, 'memory-entry-error');
      errorItem.description = 'Check console for details';
      return [errorItem];
    }

    return items;
  }

  /**
   * Build individual entry items for a specific day
   */
  private async buildEntriesForDay(type: MemoryEntry['file_type'], date: string): Promise<DashboardTreeItem[]> {
    const items: DashboardTreeItem[] = [];

    try {
      // Query entries by type
      const allEntries = await this.memoryService.queryByType(type);
      
      // Filter entries for this specific day and sort by ID descending
      const dayEntries = allEntries
        .filter(entry => entry.timestamp && entry.timestamp.split('T')[0] === date)
        .sort((a, b) => (b.id || 0) - (a.id || 0));

      if (dayEntries.length === 0) {
        const emptyItem = new DashboardTreeItem('No entries', vscode.TreeItemCollapsibleState.None, 'memory-entry-empty');
        emptyItem.iconPath = new vscode.ThemeIcon('circle-outline');
        return [emptyItem];
      }

      // Create item for each entry
      for (const entry of dayEntries) {
        // Extract title from content (first non-empty line, clean markdown headers)
        let title = (entry.content || '').split('\n').find(line => line.trim().length > 0) || 'Untitled';
        title = title.replace(/^#+\s*/, '').trim(); // Remove markdown headers
        if (title.length > 50) {
          title = title.substring(0, 50) + '...';
        }

        const entryItem = new DashboardTreeItem(
          title,
          vscode.TreeItemCollapsibleState.None,
          'memory-entry-item',
          { entryId: entry.id, type }
        );

        // Show time in description
        const time = entry.timestamp ? entry.timestamp.split('T')[1]?.substring(0, 5) || '' : '';
        entryItem.description = time;
        entryItem.iconPath = new vscode.ThemeIcon('note');

        // Set command to open entry viewer
        entryItem.command = {
          command: 'aiSkeleton.openMemoryEntry',
          title: 'View Entry',
          arguments: [entry.id, title]
        };

        items.push(entryItem);
      }
    } catch (error) {
      console.error(`[Dashboard] Error building entries for day ${date}:`, error);
      const errorItem = new DashboardTreeItem('Error loading entries', vscode.TreeItemCollapsibleState.None, 'memory-entry-error');
      errorItem.description = 'Check console for details';
      return [errorItem];
    }

    return items;
  }

  /**
   * Match progress entries to workflow steps using fuzzy matching
   * Returns map of step order → status
   */
  private async matchProgressToSteps(phase: 'research' | 'planning' | 'execution', steps: WorkflowStep[]): Promise<Map<number, string>> {
    const statusMap = new Map<number, string>();
    
    if (!phase) return statusMap;
    
    try {
      // Query phase entries grouped by status
      const phaseResult = await this.memoryService.queryByPhase(phase);
      
      // Flatten all status groups into single array
      const phaseEntries = [...phaseResult.done, ...phaseResult.inProgress, ...phaseResult.draft];
      
      // For each step, find matching progress entry
      for (const step of steps) {
        let bestMatch: any = null;
        let bestSimilarity = 0.6; // Minimum threshold
        
        for (const entry of phaseEntries) {
          const similarity = calculateSimilarity(step.title, entry.content || '');
          if (similarity > bestSimilarity) {
            bestMatch = entry;
            bestSimilarity = similarity;
          }
        }
        
        if (bestMatch) {
          const normalizedStatus = this.normalizeStatus(bestMatch.progress_status as string | undefined, bestMatch.file_type);
          statusMap.set(step.order, normalizedStatus === 'draft' ? 'not-started' : normalizedStatus);
        }
      }
    } catch (error) {
      console.warn(`[Dashboard] Error matching progress to steps:`, error);
    }
    
    return statusMap;
  }

  /**
   * Normalize various progress status strings into dashboard-friendly values
   */
  private normalizeStatus(status?: string, fileType?: string): 'done' | 'doing' | 'next' | 'draft' {
    if (!status || status.trim().length === 0) {
      // Treat phase reports as completed
      if (fileType && fileType.endsWith('_REPORT')) return 'done';
      return 'draft';
    }

    const lower = status.toLowerCase();
    if (lower === 'done') return 'done';
    if (lower === 'next') return 'next';
    if (lower === 'doing' || lower === 'in-progress') return 'doing';
    return 'draft';
  }

  /**
   * Get status icon for workflow step
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'done': return '✓';
      case 'doing': return '⏳';
      case 'next': return '→';
      default: return '☐';
    }
  }

  private async buildPhaseHistoryItems(phase: string): Promise<DashboardTreeItem[]> {
    const phaseEntries = await this.memoryService.queryByPhase(phase as any);
    const items: DashboardTreeItem[] = [];

    // Done section
    if (phaseEntries.done.length > 0) {
      items.push(new DashboardTreeItem(
        `✅ Done (${phaseEntries.done.length})`,
        phaseEntries.done.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
        'phase-done-header'
      ));
      
      phaseEntries.done.forEach(entry => {
        const item = new DashboardTreeItem(
          entry.tag || 'Untitled',
          vscode.TreeItemCollapsibleState.None,
          'phase-entry'
        );
        item.description = entry.timestamp?.split('T')[0];
        item.iconPath = new vscode.ThemeIcon('check');
        items.push(item);
      });
    }

    // In Progress section
    if (phaseEntries.inProgress.length > 0) {
      items.push(new DashboardTreeItem(
        `⏳ In Progress (${phaseEntries.inProgress.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'phase-progress-header'
      ));
      
      phaseEntries.inProgress.forEach(entry => {
        const item = new DashboardTreeItem(
          entry.tag || 'Untitled',
          vscode.TreeItemCollapsibleState.None,
          'phase-entry'
        );
        item.description = entry.timestamp?.split('T')[0];
        item.iconPath = new vscode.ThemeIcon('clock');
        items.push(item);
      });
    }

    // Draft section
    if (phaseEntries.draft.length > 0) {
      items.push(new DashboardTreeItem(
        `📝 Draft (${phaseEntries.draft.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'phase-draft-header'
      ));
      
      phaseEntries.draft.forEach(entry => {
        const item = new DashboardTreeItem(
          entry.tag || 'Untitled',
          vscode.TreeItemCollapsibleState.None,
          'phase-entry'
        );
        item.description = entry.timestamp?.split('T')[0];
        item.iconPath = new vscode.ThemeIcon('file');
        items.push(item);
      });
    }

    if (items.length === 0) {
      items.push(new DashboardTreeItem('No entries', vscode.TreeItemCollapsibleState.None, 'phase-empty'));
    }

    return items;
  }

  private buildLatestTypeParents(metrics: DashboardMetrics): DashboardTreeItem[] {
    const items: DashboardTreeItem[] = [];
    for (const type of Object.keys(metrics.latest) as MemoryEntry['file_type'][]) {
      const label = `${FILE_TYPE_LABELS[type]} (${metrics.latest[type].length})`;
      const parent = new DashboardTreeItem(label, vscode.TreeItemCollapsibleState.Collapsed, 'latest-type', { type, metrics });
      parent.iconPath = new vscode.ThemeIcon('bookmark');
      items.push(parent);
    }
    return items;
  }

  private buildLatestEntries(meta: { type: MemoryEntry['file_type']; metrics: DashboardMetrics }): DashboardTreeItem[] {
    const { type, metrics } = meta;
    const entries = metrics.latest[type];

    if (!entries.length) {
      return [new DashboardTreeItem('No entries yet', vscode.TreeItemCollapsibleState.None, 'latest-leaf')];
    }

    return entries.map((entry: Pick<MemoryEntry, 'tag' | 'content' | 'timestamp'>) => {
      const label = entry.tag || FILE_TYPE_LABELS[type];
      const item = new DashboardTreeItem(label, vscode.TreeItemCollapsibleState.None, 'latest-leaf');
      item.description = this.truncate(entry.content, 80);
      item.iconPath = new vscode.ThemeIcon('note');
      return item;
    });
  }

  private buildCountsItems(metrics: DashboardMetrics): DashboardTreeItem[] {
    const items: DashboardTreeItem[] = [];
    for (const type of Object.keys(metrics.entryCounts) as MemoryEntry['file_type'][]) {
      const count = metrics.entryCounts[type] ?? 0;
      const label = `${FILE_TYPE_LABELS[type]}: ${count}`;
      const item = new DashboardTreeItem(label, vscode.TreeItemCollapsibleState.None, 'count-item');
      item.iconPath = new vscode.ThemeIcon('number');
      items.push(item);
    }
    return items;
  }

  private async buildSemanticItems(): Promise<DashboardTreeItem[]> {
    const items: DashboardTreeItem[] = [];

    const status = new DashboardTreeItem('Semantic search enabled (local embeddings)', vscode.TreeItemCollapsibleState.None, 'semantic-status');
    status.iconPath = new vscode.ThemeIcon('sparkle');
    items.push(status);

    const findSimilar = new DashboardTreeItem('Find similar entries…', vscode.TreeItemCollapsibleState.None, 'semantic-find');
    findSimilar.iconPath = new vscode.ThemeIcon('search');
    findSimilar.command = { command: 'aiSkeleton.memoryDashboard.findSimilar', title: 'Find Similar' };
    items.push(findSimilar);

    return items;
  }

  private buildActions(): DashboardTreeItem[] {
    const addTask = new DashboardTreeItem('Add Task to AI-Memory', vscode.TreeItemCollapsibleState.None, 'action');
    addTask.command = { command: 'aiSkeleton.memoryDashboard.addTask', title: 'Add Task' };
    addTask.iconPath = new vscode.ThemeIcon('plus');

    const findSimilar = new DashboardTreeItem('Find Similar (Semantic Search)', vscode.TreeItemCollapsibleState.None, 'action');
    findSimilar.command = { command: 'aiSkeleton.memoryDashboard.findSimilar', title: 'Find Similar' };
    findSimilar.iconPath = new vscode.ThemeIcon('search');

    const refresh = new DashboardTreeItem('Refresh Dashboard', vscode.TreeItemCollapsibleState.None, 'action');
    refresh.command = { command: 'aiSkeleton.memoryDashboard.refresh', title: 'Refresh' };
    refresh.iconPath = new vscode.ThemeIcon('refresh');

    return [addTask, findSimilar, refresh];
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(1)} ${sizes[i]}`;
  }

  private truncate(text: string, max: number): string {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  /**
   * Map workflow phase to user-friendly label
   */
  private mapPhaseToLabel(phase: WorkflowPhase): string {
    if (!phase) return 'Unknown';
    switch (phase) {
      case 'research': return 'Think Mode';
      case 'planning': return 'Plan Mode';
      case 'execution': return 'Execute Mode';
      case 'checkpoint': return 'Checkpoint Mode';
      default: return 'Unknown';
    }
  }

  /**
   * Get icon for workflow phase
   */
  private getPhaseIcon(phase: WorkflowPhase): string {
    if (!phase) return '❓';
    switch (phase) {
      case 'research': return '🔍';
      case 'planning': return '📐';
      case 'execution': return '⚙️';
      case 'checkpoint': return '📍';
      default: return '❓';
    }
  }

  /**
   * Format date for display (e.g., "Today", "Yesterday", or "Dec 7, 2025")
   */
  private formatDateLabel(date: string): string {
    try {
      const entryDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const entryDateOnly = new Date(entryDate);
      entryDateOnly.setHours(0, 0, 0, 0);
      
      if (entryDateOnly.getTime() === today.getTime()) {
        return 'Today';
      } else if (entryDateOnly.getTime() === yesterday.getTime()) {
        return 'Yesterday';
      } else {
        // Format as "Dec 7, 2025"
        return entryDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
      }
    } catch (error) {
      return date;
    }
  }
}

/**
 * Register dashboard tree view in the activity bar
 */
export function registerMemoryDashboardView(context: vscode.ExtensionContext): { treeView: vscode.TreeView<DashboardTreeItem>; provider: MemoryDashboardTreeProvider } {
  const provider = new MemoryDashboardTreeProvider();

  const treeView = vscode.window.createTreeView('aiSkeletonMemoryDashboard', {
    treeDataProvider: provider,
    showCollapseAll: true
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('aiSkeleton.memoryDashboard.refresh', () => provider.refresh())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiSkeleton.memoryDashboard.addTask', async () => {
      const task = await vscode.window.showInputBox({ prompt: 'Add task to AI-Memory', placeHolder: 'Describe the task', ignoreFocusOut: true });
      if (!task || !task.trim()) {
        return;
      }
      const status = await vscode.window.showQuickPick(['Next', 'Doing'], { placeHolder: 'Task status', canPickMany: false });
      if (!status) return;

      const normalized = status.toLowerCase() === 'doing' ? 'doing' : 'next';
      const ok = await getMemoryService().updateProgress(task.trim(), normalized as any);
      if (ok) {
        vscode.window.showInformationMessage('Task added to AI-Memory');
        provider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiSkeleton.memoryDashboard.findSimilar', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Semantic search query',
        placeHolder: 'Enter keywords or description',
        ignoreFocusOut: true
      });
      if (!query || !query.trim()) {
        return;
      }

      try {
        const memoryService = getMemoryService();
        const results = await memoryService.semanticSearch(query.trim(), 10);
        if (!results.entries.length) {
          vscode.window.showInformationMessage('No similar entries found.');
          return;
        }

        const items = results.entries.map(e => ({
          label: e.tag || e.file_type,
          description: e.reason || 'semantic match',
          detail: (e.content || '').slice(0, 120),
          entry: e
        }));

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select an entry to view',
          matchOnDetail: true,
          canPickMany: false
        });

        if (picked && picked.entry) {
          const entry = picked.entry;
          const content = `**${entry.tag || entry.file_type}**\n\n${entry.content}`;
          vscode.window.showInformationMessage(`Semantic match score: ${entry.score ?? 'n/a'} | ${picked.description}`);
          const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content });
          await vscode.window.showTextDocument(doc, { preview: true });
        }
      } catch (err) {
        console.error('[MemoryDashboard] Semantic search failed:', err);
        vscode.window.showErrorMessage('Semantic search failed. See console for details.');
      }
    })
  );

  context.subscriptions.push(treeView);
  return { treeView, provider };
}
