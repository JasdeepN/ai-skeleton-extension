// AI-Memory Tree View Provider
// Provides a visual browser for AI-Memory (DB-only) in the Explorer sidebar

import * as vscode from 'vscode';
import { getMemoryService } from './memoryService';

export class MemoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    options?: { description?: string; command?: vscode.Command; iconId?: string }
  ) {
    super(label, collapsibleState);

    if (options?.description) {
      this.description = options.description;
    }

    if (options?.command) {
      this.command = options.command;
    }

    if (options?.iconId) {
      this.iconPath = new vscode.ThemeIcon(options.iconId);
    }
  }
}

export class MemoryTreeProvider implements vscode.TreeDataProvider<MemoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MemoryTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private memoryService = getMemoryService();

  constructor() {
    // Listen for state changes
    this.memoryService.onDidChangeState(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: MemoryTreeItem): Promise<MemoryTreeItem[]> {
    if (element) {
      return []; // Flat list for now
    }

    const metrics = await this.memoryService.getDashboardMetrics();
    const state = metrics.state;

    if (!state.active || !state.path) {
      const inactive = new MemoryTreeItem(
        'AI-Memory: INACTIVE',
        vscode.TreeItemCollapsibleState.None,
        {
          description: 'Click to create',
          command: { command: 'aiSkeleton.memory.create', title: 'Create Memory Bank' },
          iconId: 'warning'
        }
      );
      return [inactive];
    }

    const items: MemoryTreeItem[] = [];

    items.push(new MemoryTreeItem(
      'AI-Memory: ACTIVE',
      vscode.TreeItemCollapsibleState.None,
      {
        description: state.path.fsPath.split(/[\\/]/).pop(),
        iconId: 'database'
      }
    ));

    const typeOrder: Array<{ type: keyof typeof metrics.entryCounts; label: string; iconId: string }> = [
      { type: 'CONTEXT', label: 'Context', iconId: 'file-text' },
      { type: 'PROGRESS', label: 'Progress', iconId: 'checklist' },
      { type: 'DECISION', label: 'Decisions', iconId: 'lightbulb' },
      { type: 'PATTERN', label: 'Patterns', iconId: 'repo-forked' },
      { type: 'BRIEF', label: 'Brief', iconId: 'book' }
    ];

    for (const entry of typeOrder) {
      const count = metrics.entryCounts[entry.type] ?? 0;
      items.push(new MemoryTreeItem(
        `${entry.label} (${count})`,
        vscode.TreeItemCollapsibleState.None,
        {
          iconId: entry.iconId,
          command: { command: 'aiSkeleton.memory.show', title: 'Show Memory' }
        }
      ));
    }

    return items;
  }
}

/**
 * Register the memory tree view
 * Returns both treeView and provider for later access
 */
export function registerMemoryTreeView(context: vscode.ExtensionContext): { treeView: vscode.TreeView<MemoryTreeItem>; provider: MemoryTreeProvider } {
  const provider = new MemoryTreeProvider();
  
  const treeView = vscode.window.createTreeView('aiSkeletonMemory', {
    treeDataProvider: provider,
    showCollapseAll: false
  });

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('aiSkeleton.memory.refresh', () => {
      provider.refresh();
    })
  );

  context.subscriptions.push(treeView);
  
  return { treeView, provider };
}
