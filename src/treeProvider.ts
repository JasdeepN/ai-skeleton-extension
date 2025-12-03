import * as vscode from 'vscode';
import { Prompt } from './promptStore';

export class PromptTreeItem extends vscode.TreeItem {
  constructor(public readonly prompt: Prompt) {
    super(prompt.title, vscode.TreeItemCollapsibleState.None);
    this.description = prompt.filename;
    this.tooltip = `AI Skeleton Prompt: ${prompt.title}`;
    this.command = {
      command: 'aiSkeleton.openPrompt',
      title: 'Open Prompt',
      arguments: [prompt.id]
    };
    this.contextValue = 'promptItem';
    this.iconPath = new vscode.ThemeIcon('comment-discussion');
  }
}

export class PromptTreeProvider implements vscode.TreeDataProvider<PromptTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<PromptTreeItem | undefined | null | void> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<PromptTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private getData: () => Promise<Prompt[]>) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async getChildren(): Promise<PromptTreeItem[]> {
    const data = await this.getData();
    return data.sort((a,b) => a.title.localeCompare(b.title)).map(p => new PromptTreeItem(p));
  }

  getTreeItem(element: PromptTreeItem): vscode.TreeItem {
    return element;
  }
}
