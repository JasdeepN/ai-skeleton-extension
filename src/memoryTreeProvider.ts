// AI-Memory Tree View Provider
// Provides a visual browser for AI-Memory files in the Explorer sidebar

import * as vscode from 'vscode';
import { getMemoryService, MemoryBankState } from './memoryService';

export class MemoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly fileUri?: vscode.Uri,
    public readonly description?: string
  ) {
    super(label, collapsibleState);

    if (fileUri) {
      this.resourceUri = fileUri;
      this.command = {
        command: 'vscode.open',
        title: 'Open Memory File',
        arguments: [fileUri]
      };
      this.contextValue = 'memoryFile';
      this.iconPath = new vscode.ThemeIcon('file');
    }

    if (description) {
      this.description = description;
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
      return []; // No nested children for now
    }

    // Root level - show AI-Memory status and files
    const state = await this.memoryService.detectMemoryBank();

    if (!state.active || !state.path) {
      // AI-Memory not found
      return [
        new MemoryTreeItem(
          'AI-Memory: INACTIVE',
          vscode.TreeItemCollapsibleState.None,
          undefined,
          'Click to create'
        )
      ];
    }

    // AI-Memory is active - show files
    const items: MemoryTreeItem[] = [
      new MemoryTreeItem(
        'AI-Memory: ACTIVE',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        state.path.fsPath.split('/').pop()
      )
    ];

    // Add file items (consolidated to 5 essential files)
    const fileConfigs = [
      { name: 'activeContext.md', label: 'Active Context', exists: state.files.activeContext },
      { name: 'progress.md', label: 'Progress', exists: state.files.progress },
      { name: 'decisionLog.md', label: 'Decision Log', exists: state.files.decisionLog },
      { name: 'systemPatterns.md', label: 'System Patterns', exists: state.files.systemPatterns },
      { name: 'projectBrief.md', label: 'Project Brief', exists: state.files.projectBrief },
    ];

    for (const config of fileConfigs) {
      if (config.exists) {
        const uri = vscode.Uri.joinPath(state.path, config.name);
        items.push(new MemoryTreeItem(
          config.label,
          vscode.TreeItemCollapsibleState.None,
          uri,
          config.name
        ));
      }
    }

    return items;
  }
}

/**
 * Register the memory tree view
 */
export function registerMemoryTreeView(context: vscode.ExtensionContext): vscode.TreeView<MemoryTreeItem> {
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
  
  return treeView;
}
