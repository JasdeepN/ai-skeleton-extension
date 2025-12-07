import * as vscode from 'vscode';
import { getMemoryService } from './memoryService';
import { getPrompts } from './promptStore';
import { MemoryStore } from './memoryStore';
import * as fs from 'fs';
import * as path from 'path';

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
        new CategoryItem('Memory Bank', 'memory'),
        new CategoryItem('Chat Participant', 'chat'),
        new CategoryItem('Language Model Tools', 'lm'),
        new CategoryItem('Workspace Configuration', 'workspace'),
        new CategoryItem('MCP Servers', 'mcp'),
        new CategoryItem('Quick Actions', 'actions')
      ];
    }

    if (element instanceof CategoryItem) {
      switch (element.key) {
        case 'memory': return this.getMemoryItems();
        case 'chat': return this.getChatItems();
        case 'lm': return this.getLMItems();
        case 'workspace': return this.getWorkspaceItems();
        case 'mcp': return this.getMCPItems();
        case 'actions': return this.getActionItems();
      }
    }
    return [];
  }

  private async getMemoryItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const service = getMemoryService();
    const active = service.state.active;
    
    items.push(new StatusItem(`Status: ${active ? 'ACTIVE ✓' : 'INACTIVE'}`, active ? 'ok' : 'warn', 
      active ? { command: 'aiSkeleton.memory.show', title: 'Show Memory' } : { command: 'aiSkeleton.memory.create', title: 'Create Memory Bank' }));
    
    if (active && service.state.path) {
      items.push(new StatusItem(`Location: ${path.basename(service.state.path.fsPath)}`, 'ok'));
      items.push(new StatusItem(`Backend: ${service.state.backend || 'unknown'}`, 'ok'));
      
      if (service.state.dbPath) {
        const dbPath = service.state.dbPath;
        try {
          const stats = fs.statSync(dbPath);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          items.push(new StatusItem(`Database: memory.db (${sizeMB} MB)`, 'ok'));
          
          // Get entry counts by type
          const store = (service as any).memoryStore as MemoryStore;
          if (store) {
            try {
              const contextCount = (await store.queryByType('CONTEXT', 1000)).count;
              const decisionCount = (await store.queryByType('DECISION', 1000)).count;
              const progressCount = (await store.queryByType('PROGRESS', 1000)).count;
              const patternCount = (await store.queryByType('PATTERN', 1000)).count;
              const briefCount = (await store.queryByType('BRIEF', 1000)).count;
              const total = contextCount + decisionCount + progressCount + patternCount + briefCount;
              
              items.push(new StatusItem(`Total entries: ${total}`, total > 0 ? 'ok' : 'warn'));
              items.push(new StatusItem(`  Context: ${contextCount}`, 'ok'));
              items.push(new StatusItem(`  Decisions: ${decisionCount}`, 'ok'));
              items.push(new StatusItem(`  Progress: ${progressCount}`, 'ok'));
              items.push(new StatusItem(`  Patterns: ${patternCount}`, 'ok'));
              items.push(new StatusItem(`  Brief: ${briefCount}`, 'ok'));
            } catch (err) {
              items.push(new StatusItem(`Query error: ${err}`, 'error'));
            }
          }
        } catch (err) {
          items.push(new StatusItem(`Database error: ${err}`, 'error'));
        }
      }
    } else {
      items.push(new StatusItem('Click to create Memory Bank', 'warn', { command: 'aiSkeleton.memory.create', title: 'Create Memory Bank' }));
    }
    
    return items;
  }

  private async getChatItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const chatApi = (vscode as any).chat;
    const hasApi = typeof chatApi !== 'undefined';
    
    items.push(new StatusItem(`Chat API: ${hasApi ? 'Available ✓' : 'Unavailable'}`, hasApi ? 'ok' : 'error'));
    
    if (hasApi) {
      // Check if @aiSkeleton participant is registered
      const participants = chatApi.participants || [];
      const aiSkeletonParticipant = Array.from(participants).find((p: any) => p.id === 'aiSkeleton');
      items.push(new StatusItem(`@aiSkeleton: ${aiSkeletonParticipant ? 'Registered ✓' : 'Not found'}`, aiSkeletonParticipant ? 'ok' : 'warn'));
      
      const service = getMemoryService();
      items.push(new StatusItem(`Memory integration: ${service.state.active ? 'Active ✓' : 'Inactive'}`, service.state.active ? 'ok' : 'warn'));
      items.push(new StatusItem(`Semantic search: ${service.state.active ? 'Enabled ✓' : 'Disabled'}`, service.state.active ? 'ok' : 'warn'));
    }
    
    return items;
  }

  private async getWorkspaceItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const ws = vscode.workspace.workspaceFolders;
    
    if (!ws || !ws.length) {
      items.push(new StatusItem('No workspace open', 'error'));
      return items;
    }
    
    const folder = ws[0];
    items.push(new StatusItem(`Workspace: ${path.basename(folder.uri.fsPath)}`, 'ok'));
    
    // Check for .github structure
    const githubDir = vscode.Uri.joinPath(folder.uri, '.github');
    let hasGithub = false;
    try { await vscode.workspace.fs.stat(githubDir); hasGithub = true; } catch {}
    items.push(new StatusItem(`.github/: ${hasGithub ? 'Present ✓' : 'Missing'}`, hasGithub ? 'ok' : 'warn'));
    
    // Check prompts
    const promptsDir = vscode.Uri.joinPath(folder.uri, '.github', 'prompts');
    let promptCount = 0;
    try {
      const entries = await vscode.workspace.fs.readDirectory(promptsDir);
      promptCount = entries.filter(([name]) => name.endsWith('.md')).length;
    } catch {}
    items.push(new StatusItem(`Prompts: ${promptCount} installed`, promptCount > 0 ? 'ok' : 'warn',
      promptCount === 0 ? { command: 'aiSkeleton.installPrompts', title: 'Install Prompts' } : undefined));
    
    // Check agents
    const agentsDir = vscode.Uri.joinPath(folder.uri, '.github', 'agents');
    let agentCount = 0;
    try {
      const entries = await vscode.workspace.fs.readDirectory(agentsDir);
      agentCount = entries.filter(([name]) => name.endsWith('.agent.md')).length;
    } catch {}
    items.push(new StatusItem(`Agents: ${agentCount} installed`, agentCount > 0 ? 'ok' : 'warn',
      agentCount === 0 ? { command: 'aiSkeleton.installAgents', title: 'Install Agents' } : undefined));
    
    // Check protected files
    const guardrailsFile = vscode.Uri.joinPath(folder.uri, 'GUARDRAILS.md');
    let hasGuardrails = false;
    try { await vscode.workspace.fs.stat(guardrailsFile); hasGuardrails = true; } catch {}
    items.push(new StatusItem(`GUARDRAILS.md: ${hasGuardrails ? 'Present ✓' : 'Missing'}`, hasGuardrails ? 'ok' : 'warn',
      !hasGuardrails ? { command: 'aiSkeleton.installProtectedFiles', title: 'Install Protected Files' } : undefined));
    
    return items;
  }

  private async getMCPItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const ws = vscode.workspace.workspaceFolders;
    
    if (!ws || !ws.length) {
      items.push(new StatusItem('No workspace open', 'error'));
      return items;
    }
    
    const folder = ws[0];
    const mcpFile = vscode.Uri.joinPath(folder.uri, '.vscode', 'mcp.json');
    let hasMCP = false;
    let serverCount = 0;
    
    try {
      const content = await vscode.workspace.fs.readFile(mcpFile);
      const config = JSON.parse(Buffer.from(content).toString('utf8'));
      hasMCP = true;
      serverCount = config.mcpServers ? Object.keys(config.mcpServers).length : 0;
    } catch {}
    
    items.push(new StatusItem(`.vscode/mcp.json: ${hasMCP ? 'Present ✓' : 'Missing'}`, hasMCP ? 'ok' : 'warn',
      !hasMCP ? { command: 'aiSkeleton.installMCPs', title: 'Install MCP Config' } : undefined));
    
    if (hasMCP) {
      items.push(new StatusItem(`Configured servers: ${serverCount}`, serverCount > 0 ? 'ok' : 'warn'));
      
      const autoStart = vscode.workspace.getConfiguration().get<boolean>('aiSkeleton.mcp.autoStart', false);
      items.push(new StatusItem(`Auto-start: ${autoStart ? 'Enabled ✓' : 'Disabled'}`, autoStart ? 'ok' : 'warn'));
      
      const priority = vscode.workspace.getConfiguration().get<string>('aiSkeleton.mcp.priority', 'mcp');
      items.push(new StatusItem(`Tool priority: ${priority}`, 'ok'));
    }
    
    return items;
  }

  private async getLMItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    const lm: any = (vscode as any).lm;
    const available = typeof lm?.registerTool === 'function';
    
    items.push(new StatusItem(`LM Tools API: ${available ? 'Available ✓' : 'Unavailable'}`, available ? 'ok' : 'error'));
    
    if (available) {
      const tools: any[] = Array.isArray(lm?.tools) ? lm.tools : [];
      const names = tools.map((t: any) => t.name);
      const registered = EXPECTED_TOOLS.filter(n => names.includes(n));
      
      items.push(new StatusItem(`Registered tools: ${registered.length}/${EXPECTED_TOOLS.length}`, 
        registered.length === EXPECTED_TOOLS.length ? 'ok' : 'warn',
        { command: 'aiSkeleton.tools.listRegistered', title: 'List All Tools' }));
      
      for (const name of EXPECTED_TOOLS) {
        const has = names.includes(name);
        const shortName = name.replace('aiSkeleton_', '');
        items.push(new StatusItem(`  ${shortName}`, has ? 'ok' : 'error'));
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
