import * as vscode from 'vscode';
import { getMemoryService } from './memoryService';
import { getPrompts } from './promptStore';

const EXPECTED_TOOLS = [
  'aiSkeleton_showMemory',
  'aiSkeleton_logDecision',
  'aiSkeleton_updateContext',
  'aiSkeleton_updateProgress',
  'aiSkeleton_updatePatterns',
  'aiSkeleton_updateProjectBrief',
  'aiSkeleton_markDeprecated'
];

class CategoryItem extends vscode.TreeItem {
  constructor(label: string, public readonly key: string) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'category';
  }
}

class StatusItem extends vscode.TreeItem {
  constructor(label: string, status: 'ok'|'warn'|'error', command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(status === 'ok' ? 'check' : status === 'warn' ? 'warning' : 'error');
    if (command) this.command = command;
  }
}

export class DiagnosticsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      return [
        new CategoryItem('Environment', 'env'),
        new CategoryItem('Language Model Tools', 'lm'),
        new CategoryItem('Agent Configuration', 'agent'),
        new CategoryItem('Prompts', 'prompts'),
        new CategoryItem('Memory Bank', 'memory'),
        new CategoryItem('Quick Actions', 'actions')
      ];
    }

    if (element instanceof CategoryItem) {
      switch (element.key) {
        case 'env': return this.getEnvItems();
        case 'lm': return this.getLMItems();
        case 'agent': return this.getAgentItems();
        case 'prompts': return this.getPromptItems();
        case 'memory': return this.getMemoryItems();
        case 'actions': return this.getActionItems();
      }
    }
    return [];
  }

  private async getEnvItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const mode = this.context.extensionMode; // Development, Production, Test
    items.push(new StatusItem(`Extension Mode: ${vscode.ExtensionMode[mode]}`, mode === vscode.ExtensionMode.Development ? 'ok' : 'warn'));
    items.push(new StatusItem(`VS Code: ${vscode.version}`, 'ok'));
    const lmApi = typeof (vscode as any).lm?.registerTool === 'function';
    items.push(new StatusItem(`LM Tools API available: ${lmApi ? 'Yes' : 'No'}`, lmApi ? 'ok' : 'error'));
    return items;
  }

  private async getLMItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const lm: any = (vscode as any).lm;
    const available = typeof lm?.registerTool === 'function';
    items.push(new StatusItem(`LM API: ${available ? 'Ready' : 'Unavailable'}`, available ? 'ok' : 'error', { command: 'aiSkeleton.tools.listRegistered', title: 'List Registered LM Tools' }));
    const tools: any[] = Array.isArray(lm?.tools) ? lm.tools : [];
    const names = tools.map(t => t.name);
    const registered = EXPECTED_TOOLS.filter(n => names.includes(n));
    items.push(new StatusItem(`Registered aiSkeleton tools: ${registered.length}/${EXPECTED_TOOLS.length}`, registered.length === EXPECTED_TOOLS.length ? 'ok' : 'warn'));
    for (const name of EXPECTED_TOOLS) {
      const has = names.includes(name);
      items.push(new StatusItem(`${name}`, has ? 'ok' : 'error'));
    }
    return items;
  }

  private async getAgentItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) {
      items.push(new StatusItem('No workspace open', 'error'));
      return items;
    }
    const folder = ws[0];
    const agentsDir = vscode.Uri.joinPath(folder.uri, '.github', 'agents');
    let hasAgentsDir = false;
    try { await vscode.workspace.fs.stat(agentsDir); hasAgentsDir = true; } catch {}
    items.push(new StatusItem(`Agents folder: ${hasAgentsDir ? agentsDir.fsPath : 'missing'}`, hasAgentsDir ? 'ok' : 'warn', hasAgentsDir ? undefined : { command: 'aiSkeleton.installAgents', title: 'Install Agents' }));
    const mdi = vscode.Uri.joinPath(agentsDir, 'memory-deep-think.agent.md');
    let hasMDI = false;
    try { await vscode.workspace.fs.stat(mdi); hasMDI = true; } catch {}
    items.push(new StatusItem(`memory-deep-think.agent.md: ${hasMDI ? 'present' : 'missing'}`, hasMDI ? 'ok' : 'warn', hasMDI ? undefined : { command: 'aiSkeleton.installAgents', title: 'Install Agents' }));
    return items;
  }

  private async getPromptItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const source = vscode.workspace.getConfiguration().get<'auto'|'embedded'|'workspace'>('aiSkeleton.prompts.source', 'auto');
    items.push(new StatusItem(`Prompt source: ${source}`, 'ok'));
    const embedded = await getPrompts('embedded');
    items.push(new StatusItem(`Embedded prompts: ${embedded.length}`, 'ok'));
    const ws = vscode.workspace.workspaceFolders;
    if (ws && ws.length) {
      const folder = ws[0];
      const pDir = vscode.Uri.joinPath(folder.uri, '.github', 'prompts');
      let count = 0;
      try {
        const entries = await vscode.workspace.fs.readDirectory(pDir);
        count = entries.filter(([name]) => name.endsWith('.md')).length;
      } catch {}
      items.push(new StatusItem(`Workspace prompts: ${count}`, count > 0 ? 'ok' : 'warn', count > 0 ? undefined : { command: 'aiSkeleton.installPrompts', title: 'Install Prompts' }));
    }
    return items;
  }

  private async getMemoryItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const service = getMemoryService();
    const active = service.state.active;
    items.push(new StatusItem(`Memory Bank: ${active ? 'ACTIVE' : 'INACTIVE'}`, active ? 'ok' : 'warn', active ? { command: 'aiSkeleton.memory.show', title: 'Show Memory' } : { command: 'aiSkeleton.memory.create', title: 'Create Memory Bank' }));
    if (active && service.state.path) {
      items.push(new StatusItem(`Path: ${service.state.path.fsPath}`, 'ok'));
      items.push(new StatusItem(`Backend: ${service.state.backend || 'none'}`, 'ok'));
      if (service.state.dbPath) {
        items.push(new StatusItem(`Database: memory.db`, 'ok'));
      }
    }
    return items;
  }

  private async getActionItems(): Promise<vscode.TreeItem[]> {
    return [
      new StatusItem('Install All (Prompts, Agents, Protected)', 'ok', { command: 'aiSkeleton.installAll', title: 'Install All' }),
      new StatusItem('List Registered LM Tools', 'ok', { command: 'aiSkeleton.tools.listRegistered', title: 'List LM Tools' }),
      new StatusItem('Open README', 'ok', { command: 'aiSkeleton.diagnostics.openReadme', title: 'Open README' })
    ];
  }
}

export function registerDiagnosticsView(context: vscode.ExtensionContext): DiagnosticsTreeProvider {
  const provider = new DiagnosticsTreeProvider(context);
  vscode.window.registerTreeDataProvider('aiSkeletonDiagnostics', provider);

  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.diagnostics.refresh', () => provider.refresh()));

  const out = vscode.window.createOutputChannel('AI Skeleton Diagnostics');
  context.subscriptions.push(out);

  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.diagnostics.runSelfTest', async () => {
    out.clear();
    out.show(true);
    const mode = context.extensionMode;
    out.appendLine(`Extension Mode: ${vscode.ExtensionMode[mode]}`);
    out.appendLine(`VS Code: ${vscode.version}`);
    const lmApi = typeof (vscode as any).lm?.registerTool === 'function';
    out.appendLine(`LM Tools API available: ${lmApi}`);
    const tools: any[] = Array.isArray((vscode as any).lm?.tools) ? (vscode as any).lm.tools : [];
    out.appendLine(`Registered LM tools: ${tools.length}`);
    const names = tools.map(t => t.name);
    for (const name of EXPECTED_TOOLS) {
      out.appendLine(`${name}: ${names.includes(name) ? 'OK' : 'MISSING'}`);
    }
    const ws = vscode.workspace.workspaceFolders;
    if (ws && ws.length) {
      const folder = ws[0];
      out.appendLine(`Workspace: ${folder.uri.fsPath}`);
      const agentsDir = vscode.Uri.joinPath(folder.uri, '.github', 'agents');
      try { await vscode.workspace.fs.stat(agentsDir); out.appendLine(`Agents: present`); } catch { out.appendLine(`Agents: missing`); }
      const promptsDir = vscode.Uri.joinPath(folder.uri, '.github', 'prompts');
      try { await vscode.workspace.fs.stat(promptsDir); out.appendLine(`Prompts: present`); } catch { out.appendLine(`Prompts: missing`); }
    }
    const service = getMemoryService();
    out.appendLine(`Memory Bank active: ${service.state.active}`);
    out.appendLine(`Diagnostics complete.`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.diagnostics.openReadme', async () => {
    // Try workspace README first, fallback to extension README
    const ws = vscode.workspace.workspaceFolders;
    let target: vscode.Uri | undefined;
    if (ws && ws.length) {
      const wsReadme = vscode.Uri.joinPath(ws[0].uri, 'README.md');
      try { await vscode.workspace.fs.stat(wsReadme); target = wsReadme; } catch {}
    }
    if (!target) {
      const extReadme = vscode.Uri.joinPath(vscode.Uri.file(context.extensionPath), 'README.md');
      try { await vscode.workspace.fs.stat(extReadme); target = extReadme; } catch {}
    }
    if (target) {
      const doc = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(doc, { preview: true });
    } else {
      vscode.window.showInformationMessage('README not found.');
    }
  }));

  return provider;
}
