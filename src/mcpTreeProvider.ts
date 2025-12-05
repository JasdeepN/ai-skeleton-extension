// MCP Tree View Provider
// Displays available MCP servers and their configurations

import * as vscode from 'vscode';
import { getMCPServerList } from './mcpStore';

export class MCPTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly description?: string
  ) {
    super(label, collapsibleState);
    if (description) {
      this.description = description;
    }
    this.iconPath = new vscode.ThemeIcon('server');
  }
}

export class MCPTreeProvider implements vscode.TreeDataProvider<MCPTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MCPTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MCPTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: MCPTreeItem): Promise<MCPTreeItem[]> {
    if (element) {
      return [];
    }

    try {
      const servers = getMCPServerList();
      if (!servers || servers.length === 0) {
        return [new MCPTreeItem('No MCP servers configured', vscode.TreeItemCollapsibleState.None, 'Configure in .vscode/mcp.json')];
      }

      return servers.map(
        s => new MCPTreeItem(s.id, vscode.TreeItemCollapsibleState.None, s.description)
      );
    } catch (err) {
      console.error('Failed to get MCP servers:', err);
      return [new MCPTreeItem('Error loading MCP servers', vscode.TreeItemCollapsibleState.None)];
    }
  }
}

/**
 * Register the MCP tree view
 */
export function registerMCPTreeView(context: vscode.ExtensionContext): { treeView: vscode.TreeView<MCPTreeItem>; provider: MCPTreeProvider } {
  const provider = new MCPTreeProvider();

  const treeView = vscode.window.createTreeView('aiSkeletonMCP', {
    treeDataProvider: provider,
    showCollapseAll: false
  });

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('aiSkeleton.mcp.refresh', () => {
      provider.refresh();
    })
  );

  context.subscriptions.push(treeView);

  return { treeView, provider };
}
