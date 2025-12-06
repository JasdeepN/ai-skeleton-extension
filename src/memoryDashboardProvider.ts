// AI-Memory Dashboard Tree View Provider
// Shows database status, metrics, latest entries, and tasks in the Activity Bar

import * as vscode from 'vscode';
import { FILE_TYPE_TO_FILENAME } from './memoryStore';
import { DashboardMetrics, DashboardTasksSnapshot, getMemoryService } from './memoryService';
import { getMetricsService } from './metricsService';

const FILE_TYPE_LABELS: Record<keyof typeof FILE_TYPE_TO_FILENAME, string> = {
  CONTEXT: 'Context',
  DECISION: 'Decisions',
  PROGRESS: 'Progress',
  PATTERN: 'Patterns',
  BRIEF: 'Brief'
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

  constructor() {
    this.memoryService.onDidChangeState(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this.cachedMetrics = null;
    this._onDidChangeTreeData.fire();
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
        new DashboardTreeItem('Metrics', vscode.TreeItemCollapsibleState.Expanded, 'metrics', metrics),
        new DashboardTreeItem('Latest Entries', vscode.TreeItemCollapsibleState.Collapsed, 'latest', metrics),
        new DashboardTreeItem('Tasks', vscode.TreeItemCollapsibleState.Collapsed, 'tasks', metrics.tasks),
        new DashboardTreeItem('Actions', vscode.TreeItemCollapsibleState.Expanded, 'actions')
      ];
    }

    switch (element.kind) {
      case 'status':
        return this.buildStatusItems(element.meta as DashboardMetrics);
      case 'metrics':
        return await this.buildMetricsItems(element.meta as DashboardMetrics);
      case 'latest':
        return this.buildLatestTypeParents(element.meta as DashboardMetrics);
      case 'latest-type':
        return this.buildLatestEntries(element.meta as { type: keyof typeof FILE_TYPE_TO_FILENAME; metrics: DashboardMetrics });
      case 'counts-parent':
        return this.buildCountsItems(element.meta as DashboardMetrics);
      case 'tasks':
        return this.buildTaskBuckets(element.meta as DashboardTasksSnapshot);
      case 'task-bucket':
        return this.buildTaskItems(element.meta as { bucket: string; tasks: string[] });
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

    // Entry Counts
    const countsParent = new DashboardTreeItem('Entry Counts', vscode.TreeItemCollapsibleState.Collapsed, 'counts-parent', metrics);
    countsParent.iconPath = new vscode.ThemeIcon('list-ordered');
    items.push(countsParent);

    return items;
  }

  private buildCountsItems(metrics: DashboardMetrics): DashboardTreeItem[] {
    const items: DashboardTreeItem[] = [];
    for (const type of Object.keys(metrics.entryCounts) as (keyof typeof FILE_TYPE_TO_FILENAME)[]) {
      const count = metrics.entryCounts[type] ?? 0;
      const label = `${FILE_TYPE_LABELS[type]}: ${count}`;
      const item = new DashboardTreeItem(label, vscode.TreeItemCollapsibleState.None, 'count-item');
      item.iconPath = new vscode.ThemeIcon('number');
      items.push(item);
    }
    return items;
  }

  private buildLatestTypeParents(metrics: DashboardMetrics): DashboardTreeItem[] {
    const items: DashboardTreeItem[] = [];
    for (const type of Object.keys(metrics.latest) as (keyof typeof FILE_TYPE_TO_FILENAME)[]) {
      const label = `${FILE_TYPE_LABELS[type]} (${metrics.latest[type].length})`;
      const parent = new DashboardTreeItem(label, vscode.TreeItemCollapsibleState.Collapsed, 'latest-type', { type, metrics });
      parent.iconPath = new vscode.ThemeIcon('bookmark');
      items.push(parent);
    }
    return items;
  }

  private buildLatestEntries(meta: { type: keyof typeof FILE_TYPE_TO_FILENAME; metrics: DashboardMetrics }): DashboardTreeItem[] {
    const { type, metrics } = meta;
    const entries = metrics.latest[type];

    if (!entries.length) {
      return [new DashboardTreeItem('No entries yet', vscode.TreeItemCollapsibleState.None, 'latest-leaf')];
    }

    return entries.map(entry => {
      const label = entry.tag || FILE_TYPE_LABELS[type];
      const item = new DashboardTreeItem(label, vscode.TreeItemCollapsibleState.None, 'latest-leaf');
      item.description = this.truncate(entry.content, 80);
      item.iconPath = new vscode.ThemeIcon('note');
      return item;
    });
  }

  private buildTaskBuckets(tasks: DashboardTasksSnapshot): DashboardTreeItem[] {
    return [
      new DashboardTreeItem(`Next (${tasks.next.length})`, vscode.TreeItemCollapsibleState.Collapsed, 'task-bucket', { bucket: 'next', tasks: tasks.next }),
      new DashboardTreeItem(`Doing (${tasks.doing.length})`, vscode.TreeItemCollapsibleState.Collapsed, 'task-bucket', { bucket: 'doing', tasks: tasks.doing }),
      new DashboardTreeItem(`Done (${tasks.done.length})`, vscode.TreeItemCollapsibleState.Collapsed, 'task-bucket', { bucket: 'done', tasks: tasks.done })
    ];
  }

  private buildTaskItems(meta: { bucket: string; tasks: string[] }): DashboardTreeItem[] {
    if (!meta.tasks.length) {
      return [new DashboardTreeItem('No items', vscode.TreeItemCollapsibleState.None, 'task-leaf')];
    }
    return meta.tasks.map(task => {
      const item = new DashboardTreeItem(task, vscode.TreeItemCollapsibleState.None, 'task-leaf');
      item.iconPath = new vscode.ThemeIcon(meta.bucket === 'done' ? 'check' : 'circle-small');
      return item;
    });
  }

  private buildActions(): DashboardTreeItem[] {
    const addTask = new DashboardTreeItem('Add Task to AI-Memory', vscode.TreeItemCollapsibleState.None, 'action');
    addTask.command = { command: 'aiSkeleton.memoryDashboard.addTask', title: 'Add Task' };
    addTask.iconPath = new vscode.ThemeIcon('plus');

    const refresh = new DashboardTreeItem('Refresh Dashboard', vscode.TreeItemCollapsibleState.None, 'action');
    refresh.command = { command: 'aiSkeleton.memoryDashboard.refresh', title: 'Refresh' };
    refresh.iconPath = new vscode.ThemeIcon('refresh');

    return [addTask, refresh];
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

  context.subscriptions.push(treeView);
  return { treeView, provider };
}
