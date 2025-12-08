import * as vscode from 'vscode';
import { getPrompts, Prompt } from './promptStore';
import { getAgents, AgentTemplate, getProtectedFilesEmbedded } from './agentStore';
import { PromptTreeProvider } from './treeProvider';
import { getMemoryService } from './memoryService';
import { getMemoryStore } from './memoryStore';
import { registerMemoryTools } from './memoryTools';
import { registerMemoryTreeView } from './memoryTreeProvider';
import { registerMemoryDashboardView } from './memoryDashboardProvider';
import { registerMCPTreeView } from './mcpTreeProvider';
import { getMCPConfigString, getMCPServerList } from './mcpStore';
import { registerDiagnosticsView } from './diagnosticsProvider';
import { maybeAutoStartMCPs, startMCPServers } from './mcpManager';
import { showSetupDialog, checkForUpdates, reinstallAll } from './setupService';
import { TokenCounterService } from './tokenCounterService';
import { getMetricsService } from './metricsService';
import { createChatParticipant } from './chatParticipant';
import { logger } from './logger';

async function resolvePrompts(): Promise<Prompt[]> {
  const source = vscode.workspace.getConfiguration().get<'auto'|'embedded'|'workspace'>('aiSkeleton.prompts.source', 'auto');
  return getPrompts(source);
}

export async function activate(context: vscode.ExtensionContext) {
  // Initialize memory service
  const memoryService = getMemoryService();
  try {
    console.log('[Extension] Activating extension...');
    await memoryService.detectMemoryBank();
    console.log('[Extension] Memory Bank detected:', memoryService.state);
  } catch (err) {
    console.error('[Extension] Memory Bank detection failed:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Extension] Error details:', errMsg);
  }

  // Detect if running in test environment
  const isTestEnvironment = process.env.VSCODE_TEST_ENV === 'true' || 
                           context.extensionMode === vscode.ExtensionMode.Test;

  // Show unified setup dialog if components are missing (only on first time)
  // Skip in test environments to avoid dialog errors
  if (!isTestEnvironment) {
    try {
      await showSetupDialog(context);
    } catch (err) {
      logger.warn('[Extension] Setup dialog failed, continuing without blocking activation:', err);
    }

    // Check for updates to installed components (only if user hasn't dismissed update prompts)
    try {
      const updateDismissedVersion = context.workspaceState.get<string>('aiSkeleton.updateDismissedVersion', '');
      const currentVersion = vscode.extensions.getExtension('jasdeepn.ai-skeleton-extension')?.packageJSON?.version || '0.0.0';
      
      const hasUpdates = await checkForUpdates(context);
      if (hasUpdates && updateDismissedVersion !== currentVersion) {
        const action = await vscode.window.showInformationMessage(
          '🔄 AI Skeleton has new component definitions. Merge updates while preserving your customizations?',
          { modal: false },
          'Merge Updates',
          'Later'
        );
        if (action === 'Merge Updates') {
          await reinstallAll(context);
        } else {
          // User chose "Later" or dismissed - remember for this version
          await context.workspaceState.update('aiSkeleton.updateDismissedVersion', currentVersion);
        }
      }
    } catch (err) {
      logger.warn('[Extension] Update check skipped, continuing activation:', err);
    }
  }

  // Re-detect memory after potential setup
  await memoryService.detectMemoryBank();

  // Quick startup check: if entries exist but lack embeddings, prompt user to sync
  const runEmbeddingCoverageCheck = async () => {
    try {
      // Skip in tests to avoid modal interference
      if (isTestEnvironment) return;

      const state = await memoryService.detectMemoryBank();
      if (!state.active) return;

      const memoryStore = getMemoryStore();
      const counts = await memoryStore.getEntryCounts();
      const totalEntries = Object.values(counts).reduce((sum, n) => sum + n, 0);
      if (totalEntries === 0) return;

      const embeddedCount = await memoryStore.countEntriesWithEmbeddings();
      const missing = totalEntries - embeddedCount;
      if (missing <= 0) return;

      const currentVersion = vscode.extensions.getExtension('jasdeepn.ai-skeleton-extension')?.packageJSON?.version || '0.0.0';
      const dismissedForVersion = context.workspaceState.get<string>('aiSkeleton.embeddingCoverageDismissedVersion', '');
      if (dismissedForVersion === currentVersion) return;

      const action = await vscode.window.showInformationMessage(
        `AI-Memory embeddings pending: ${missing}/${totalEntries} entries need vectors. Generate now?`,
        'Generate embeddings',
        'Later'
      );

      if (action === 'Generate embeddings') {
        await vscode.commands.executeCommand('aiSkeleton.memory.generateEmbeddings');
      } else if (action === 'Later') {
        await context.workspaceState.update('aiSkeleton.embeddingCoverageDismissedVersion', currentVersion);
      }
    } catch (err) {
      logger.warn('[Extension] Embedding coverage check skipped:', err);
    }
  };

  runEmbeddingCoverageCheck();

  // Initialize token counter service with LRU cache
  const tokenCounterService = TokenCounterService.getInstance();
  try {
    // Wire memoryStore to token counter for metrics persistence
    const memoryStore = getMemoryStore();
    tokenCounterService.setMemoryStore(memoryStore);
    console.log('[Extension] TokenCounterService initialized with metrics persistence');
  } catch (err) {
    console.warn('[Extension] TokenCounterService initialization warning:', err);
  }

  // Agent call middleware for token tracking
  const agentCallMiddleware = async (agentId: string, systemPrompt: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>, modelName: string = 'claude-3-5-sonnet') => {
    try {
      // Count tokens for the agent call
      const tokenResult = await tokenCounterService.countTokens({
        model: modelName,
        systemPrompt,
        messages
      });

      // Calculate context budget
      const contextBudget = tokenCounterService.getContextBudget(tokenResult.totalTokens);

      // Log token metric to memoryStore
      const memoryStore = getMemoryStore();
      await memoryStore.logTokenMetric({
        timestamp: new Date().toISOString(),
        model: modelName,
        input_tokens: tokenResult.inputTokens,
        output_tokens: tokenResult.outputTokens,
        total_tokens: tokenResult.totalTokens,
        context_status: contextBudget.status
      });

      console.log(`[AgentCallMiddleware] Agent: ${agentId}, Status: ${contextBudget.status}, Remaining: ${contextBudget.remaining}K tokens`);

      return {
        totalTokens: tokenResult.totalTokens,
        budget: contextBudget,
        cached: tokenResult.cached
      };
    } catch (err) {
      console.error('[AgentCallMiddleware] Error tracking agent call:', err);
      // Return a default safe budget on error
      return {
        totalTokens: 0,
        budget: tokenCounterService.getContextBudget(0),
        cached: false
      };
    }
  };

  // Store middleware globally so memoryTools can access it for tool invocations
  // This allows tools to track token usage when invoked by agents
  (global as any).__agentCallMiddleware = agentCallMiddleware;

  // Register memory LM tools (for Copilot agent integration)
  // Uses VS Code Language Model Tools API (stable in VS Code 1.95+)
  // Commands below provide manual/programmatic alternatives
  registerMemoryTools(context);

  // Register @aiSkeleton chat participant for guaranteed tool invocation
  // This participant controls the tool calling loop and ensures tokens are tracked
  try {
    // Debug: Check if chat API is available
    const chatApiAvailable = !!(vscode.chat && vscode.chat.createChatParticipant);
    console.log('[Extension] Chat API available:', chatApiAvailable);
    console.log('[Extension] vscode.chat:', !!vscode.chat);
    console.log('[Extension] vscode.chat.createChatParticipant:', !!vscode.chat?.createChatParticipant);
    
    createChatParticipant(context);
    console.log('[Extension] @aiSkeleton chat participant registered');
  } catch (err) {
    console.error('[Extension] Failed to register chat participant:', err);
    console.error('[Extension] Error details:', err instanceof Error ? err.message : String(err));
  }

  // Register memory tree view
  const { treeView: memoryTreeView, provider: memoryTreeProvider } = registerMemoryTreeView(context);

  // Register memory dashboard (Activity Bar)
  const { treeView: memoryDashboardView, provider: memoryDashboardProvider } = registerMemoryDashboardView(context);

  // Register MCP tree view
  const { treeView: mcpTreeView, provider: mcpTreeProvider } = registerMCPTreeView(context);

  // Register diagnostics view (Activity Bar)
  registerDiagnosticsView(context);

  // Auto-start MCP servers if enabled
  await maybeAutoStartMCPs(context);

  // Memory status bar
  const memoryStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
  memoryStatusBar.command = 'aiSkeleton.memory.showStatus';
  const updateMemoryStatus = () => {
    const state = memoryService.state;
    const autoStart = vscode.workspace.getConfiguration('aiSkeleton').get<boolean>('memory.autoStart', true);
    if (!autoStart) {
      memoryStatusBar.text = '$(database) Memory: DISABLED';
      memoryStatusBar.tooltip = 'Memory auto-start disabled in settings.';
      memoryStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      return;
    }

    if (state.active) {
      const activity = state.activity || 'idle';
      const label = activity === 'write' ? 'ACTIVE (Write)' : activity === 'read' ? 'ACTIVE (Read)' : 'ACTIVE';
      memoryStatusBar.text = `$(database) Memory: ${label}`;
      memoryStatusBar.tooltip = `Memory Bank active at ${state.path?.fsPath}`;
      memoryStatusBar.backgroundColor = undefined;
    } else {
      memoryStatusBar.text = '$(database) Memory: INACTIVE';
      memoryStatusBar.tooltip = 'Memory Bank not found. Click to create.';
      memoryStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  };
  updateMemoryStatus();
  memoryStatusBar.show();
  context.subscriptions.push(memoryStatusBar);

  // Context budget status bar - displays token usage and remaining budget
  const contextBudgetStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 8);
  contextBudgetStatusBar.command = 'aiSkeleton.context.showUsage';

  const metricsService = getMetricsService();
  const CONTEXT_WINDOW = 200_000; // Default context window

  const formatTokens = (value: number) => {
    if (value >= 1000) {
      const normalized = value / 1000;
      return `${normalized >= 100 ? normalized.toFixed(0) : normalized.toFixed(1)}K`;
    }
    return `${value}`;
  };

  const updateContextBudget = async () => {
    try {
      const latestMetric = await metricsService.getLatestTokenMetric();
      const usedTokens = latestMetric?.total_tokens ?? 0;
      const budget = tokenCounterService.getContextBudget(usedTokens, CONTEXT_WINDOW);

      const statusIcon: Record<typeof budget.status, string> = {
        healthy: '$(check)',
        warning: '$(alert)',
        critical: '$(flame)'
      };

      contextBudgetStatusBar.text = `${statusIcon[budget.status]} Ctx ${formatTokens(budget.remaining)} / ${formatTokens(budget.total)} left`;
      contextBudgetStatusBar.tooltip = [
        `Context status: ${budget.status.toUpperCase()}`,
        `Used: ${formatTokens(budget.used)} / ${formatTokens(budget.total)} (${budget.percentUsed.toFixed(1)}%)`,
        `Remaining: ${formatTokens(budget.remaining)}`,
        budget.recommendations.join('\n')
      ].join('\n');

      if (budget.status === 'critical') {
        contextBudgetStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      } else if (budget.status === 'warning') {
        contextBudgetStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        contextBudgetStatusBar.backgroundColor = undefined;
      }
    } catch (err) {
      console.error('[Extension] Failed to update context budget status bar:', err);
      contextBudgetStatusBar.text = '$(pie-chart) Budget: Unknown';
      contextBudgetStatusBar.tooltip = 'Unable to retrieve context budget. See logs for details.';
      contextBudgetStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  };

  updateContextBudget();
  contextBudgetStatusBar.show();
  context.subscriptions.push(contextBudgetStatusBar);

  // Update budget status bar periodically
  const budgetUpdateInterval = setInterval(() => {
    void updateContextBudget();
  }, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(budgetUpdateInterval) });

  // Listen for memory state changes
  memoryService.onDidChangeState(() => {
    updateMemoryStatus();
  });

  let cached: Prompt[] = await resolvePrompts();

  const provider = new PromptTreeProvider(async () => {
    // dynamic reload each time tree is expanded
    return cached;
  });

  vscode.window.registerTreeDataProvider('aiSkeletonPrompts', provider);

  const reload = async () => {
    cached = await resolvePrompts();
    provider.refresh();
  };

  // Removed prompts status bar button to reduce UI noise; use Command Palette to list prompts

  // Commands
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.listPrompts', async () => {
    await reload();
    const pick = await vscode.window.showQuickPick(cached.map(p => ({ label: p.title, description: p.filename, prompt: p })), { placeHolder: 'Select a prompt to view' });
    if (!pick) return;
    openPromptDocument(pick.prompt);
  }));

  // Debugging: List registered Language Model tools
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.tools.listRegistered', async () => {
    try {
      if (!vscode.lm || !Array.isArray(vscode.lm.tools)) {
        await vscode.window.showWarningMessage('Language Model Tools API is not available in this VS Code build. Upgrade VS Code to 1.95+ to use agent tools.');
        return;
      }
      const items = vscode.lm.tools.map(t => ({ label: t.name, description: (t as any).description ?? '', detail: (t as any).tags?.join(', ') ?? '' }));
      if (!items.length) {
        await vscode.window.showInformationMessage('No LM tools registered.');
        return;
      }
      const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Registered LM Tools' });
      if (pick) {
        await vscode.window.showInformationMessage(`Tool: ${pick.label}`);
      }
    } catch (err) {
      console.error('Failed to list LM tools:', err);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.openPrompt', async (id?: string) => {
    await reload();
    let chosen: Prompt | undefined;
    if (id) {
      chosen = cached.find(p => p.id === id);
    }
    if (!chosen) {
      const pick = await vscode.window.showQuickPick(cached.map(p => ({ label: p.title, description: p.filename, prompt: p })), { placeHolder: 'Select a prompt to open' });
      if (!pick) return;
      chosen = pick.prompt;
    }
    openPromptDocument(chosen);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.insertPrompt', async () => {
    await reload();
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor to insert into.');
      return;
    }
    const pick = await vscode.window.showQuickPick(cached.map(p => ({ label: p.title, description: p.filename, prompt: p })), { placeHolder: 'Select a prompt to insert' });
    if (!pick) return;
    editor.insertSnippet(new vscode.SnippetString(pick.prompt.content));
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.copyPrompt', async () => {
    await reload();
    const pick = await vscode.window.showQuickPick(cached.map(p => ({ label: p.title, description: p.filename, prompt: p })), { placeHolder: 'Select a prompt to copy' });
    if (!pick) return;
    await vscode.env.clipboard.writeText(pick.prompt.content);
    vscode.window.showInformationMessage(`Copied prompt: ${pick.prompt.title}`);
  }));

  // Save prompt as a new file in the workspace using workspace.fs (cross-platform + remote-friendly)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.savePrompt', async () => {
    await reload();
    const pick = await vscode.window.showQuickPick(cached.map(p => ({ label: p.title, description: p.filename, prompt: p })), { placeHolder: 'Select a prompt to save' });
    if (!pick) return;
    const chosen = pick.prompt;

    // Default save location - first workspace folder (if present)
    const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    const defaultUri = folderUri ? vscode.Uri.joinPath(folderUri, chosen.filename) : undefined;

    const uri = await vscode.window.showSaveDialog({ defaultUri, filters: { 'Markdown': ['md'] }, saveLabel: 'Save Prompt' });
    if (!uri) return;

    try {
      // Create a runtime-agnostic buffer/Uint8Array for saving content.
      // Prefer global TextEncoder if present (browser-ish hosts), otherwise use Node Buffer via globalThis.
      let data: Uint8Array;
      const g: any = globalThis as any;
      if (typeof g.TextEncoder === 'function') {
        data = new g.TextEncoder().encode(chosen.content);
      } else if (g.Buffer && typeof g.Buffer.from === 'function') {
        data = g.Buffer.from(chosen.content, 'utf8');
      } else {
        // Fallback: simple char code copy - not ideal for multi-byte unicode but extremely rare here
        data = new Uint8Array(chosen.content.split('').map((c: string) => c.charCodeAt(0)));
      }
      await vscode.workspace.fs.writeFile(uri, data);
      vscode.window.showInformationMessage(`Saved prompt: ${chosen.title} -> ${uri.fsPath}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Unable to save prompt: ${err instanceof Error ? err.message : String(err)}`);
    }
  }));

  // Install built-in prompts (all) to `.github/prompts` in the selected workspace folder
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.installPrompts', async () => {
    await reload();
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) {
      vscode.window.showErrorMessage('No workspace folder open. Please open a workspace and try again.');
      return;
    }

    // Detect test environment
    const isTestMode = process.env.VSCODE_TEST_ENV === 'true' || 
                      context.extensionMode === vscode.ExtensionMode.Test;

    // If multiple workspace folders, ask which one to use (or use first in test mode)
    let folder: vscode.WorkspaceFolder;
    if (ws.length === 1 || isTestMode) {
      folder = ws[0];
    } else {
      const pick = await vscode.window.showQuickPick(ws.map(f => ({ label: f.name, folder: f })), { placeHolder: 'Select workspace folder to install prompts into' });
      if (!pick) return;
      folder = pick.folder;
    }

    // Decide source for installing prompts - in test mode always use embedded
    let chosenSource: 'embedded' | 'workspace' = 'embedded';
    if (!isTestMode) {
      const sourcePick = await vscode.window.showQuickPick([
        { label: 'Embedded (built-in prompts)', value: 'embedded' },
        { label: 'Workspace prompts (if present)', value: 'workspace' }
      ].map(x => ({ label: x.label, value: x.value } as any)), { placeHolder: 'Install prompts from:' });
      if (!sourcePick) return;
      chosenSource = <'embedded'|'workspace'>(sourcePick as any).value || 'embedded';
    }
    
    let promptsToInstall = await getPrompts(chosenSource);
    if (!promptsToInstall || !promptsToInstall.length) {
      // fallback to embedded
      promptsToInstall = await getPrompts('embedded');
    }

    const destDir = vscode.Uri.joinPath(folder.uri, '.github', 'prompts');
    try {
      await vscode.workspace.fs.createDirectory(destDir);
    } catch (e) {
      // ignore
    }

    // Collect existing files
    const existing: string[] = [];
    for (const p of promptsToInstall) {
      const target = vscode.Uri.joinPath(destDir, p.filename);
      try {
        await vscode.workspace.fs.stat(target);
        existing.push(p.filename);
      } catch (e) {
        // not exists
      }
    }

    let overwriteBehaviour: 'overwrite'|'skip'|'cancel' = 'overwrite';
    if (existing.length && !isTestMode) {
      const pick = await vscode.window.showInformationMessage(
        `Destination already contains ${existing.length} prompt files. Overwrite existing files?`,
        'Overwrite All', 'Skip existing', 'Cancel'
      );
      if (!pick || pick === 'Cancel') {
        vscode.window.showInformationMessage('Install prompts canceled.');
        return;
      }
      overwriteBehaviour = pick === 'Overwrite All' ? 'overwrite' : 'skip';
    } else if (isTestMode && existing.length) {
      // In test mode, default to skip existing files to avoid conflicts
      overwriteBehaviour = 'skip';
    }

    // Progress UI
    let written = 0;
    let skipped = 0;
    const cancelled = false;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Installing prompts to .github/prompts', cancellable: false }, async (progress) => {
      const total = promptsToInstall.length;
      let done = 0;
      for (const p of promptsToInstall) {
        const target = vscode.Uri.joinPath(destDir, p.filename);
        let exists = false;
        try {
          await vscode.workspace.fs.stat(target);
          exists = true;
        } catch (e) {
          exists = false;
        }
        if (exists && overwriteBehaviour === 'skip') {
          skipped++;
        } else {
          // encode and write
          let data: Uint8Array;
          const g: any = globalThis as any;
          if (typeof g.TextEncoder === 'function') {
            data = new g.TextEncoder().encode(p.content);
          } else if (g.Buffer && typeof g.Buffer.from === 'function') {
            data = g.Buffer.from(p.content, 'utf8');
          } else {
            data = new Uint8Array(p.content.split('').map((c: string) => c.charCodeAt(0)));
          }
          try {
            await vscode.workspace.fs.writeFile(target, data);
            written++;
          } catch (err: any) {
            console.error('Error writing prompt', p.filename, err);
          }
        }
        done++;
        progress.report({ increment: Math.round(100 * (done / total)), message: `${done}/${total}` });
      }
    });

    if (!isTestMode) {
      vscode.window.showInformationMessage(`Installed prompts: ${written} installed, ${skipped} skipped into ${destDir.fsPath}`);
    }

    // Optionally open the destination in editor: open first installed prompt
    if (written > 0 && !isTestMode) {
      for (const p of promptsToInstall) {
        const target = vscode.Uri.joinPath(destDir, p.filename);
        try {
          await vscode.workspace.fs.stat(target);
          const doc = await vscode.workspace.openTextDocument(target);
          await vscode.window.showTextDocument(doc, { preview: true });
          break;
        } catch (e) {
          // ignore
        }
      }
    }
  }));

  // Install a single prompt (from view item or quick pick) to `.github/prompts` in the selected workspace folder
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.installPrompt', async (element?: any) => {
    await reload();
    let promptObj = element;
    // element could be PromptTreeItem, or a Prompt object, or undefined
    if (element && element.prompt) {
      promptObj = element.prompt;
    }
    if (!promptObj) {
      const pick = await vscode.window.showQuickPick(cached.map(p => ({ label: p.title, description: p.filename, prompt: p })), { placeHolder: 'Select a prompt to install' });
      if (!pick) return;
      promptObj = pick.prompt;
    }

    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) {
      vscode.window.showErrorMessage('No workspace folder open. Please open a workspace and try again.');
      return;
    }
    let folder: vscode.WorkspaceFolder;
    if (ws.length === 1) {
      folder = ws[0];
    } else {
      const pick = await vscode.window.showQuickPick(ws.map(f => ({ label: f.name, folder: f })), { placeHolder: 'Select workspace folder to install prompt into' });
      if (!pick) return;
      folder = pick.folder;
    }

    const destDir = vscode.Uri.joinPath(folder.uri, '.github', 'prompts');
    try {
      await vscode.workspace.fs.createDirectory(destDir);
    } catch (e) {
      // ignore
    }

    const target = vscode.Uri.joinPath(destDir, promptObj.filename);
    let exists = false;
    try {
      await vscode.workspace.fs.stat(target);
      exists = true;
    } catch (e) {
      exists = false;
    }
    if (exists) {
      const pick = await vscode.window.showInformationMessage(`File ${promptObj.filename} already exists. Overwrite?`, 'Overwrite', 'Cancel');
      if (!pick || pick === 'Cancel') {
        vscode.window.showInformationMessage('Install canceled');
        return;
      }
    }

    // write file
    const g: any = globalThis as any;
    let data: Uint8Array;
    if (typeof g.TextEncoder === 'function') {
      data = new g.TextEncoder().encode(promptObj.content);
    } else if (g.Buffer && typeof g.Buffer.from === 'function') {
      data = g.Buffer.from(promptObj.content, 'utf8');
    } else {
      data = new Uint8Array(promptObj.content.split('').map((c: string) => c.charCodeAt(0)));
    }
    try {
      await vscode.workspace.fs.writeFile(target, data);
      vscode.window.showInformationMessage(`Installed ${promptObj.filename} to ${destDir.fsPath}`);
      const doc = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to install prompt: ${err instanceof Error ? err.message : String(err)}`);
    }
  }));

  // Install all built-in agents into `.github/agents`
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.installAgents', async () => {
    await reload();
    const chosenAgents = await getAgents('embedded');
    if (!chosenAgents.length) {
      vscode.window.showInformationMessage('No built-in agents available to install.');
      return;
    }
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) {
      vscode.window.showErrorMessage('No workspace folder open. Please open a workspace and try again.');
      return;
    }

    // Detect test environment
    const isTestMode = process.env.VSCODE_TEST_ENV === 'true' || 
                      context.extensionMode === vscode.ExtensionMode.Test;

    let folder: vscode.WorkspaceFolder;
    if (ws.length === 1 || isTestMode) {
      folder = ws[0];
    } else {
      const pick = await vscode.window.showQuickPick(ws.map(f => ({ label: f.name, folder: f })), { placeHolder: 'Select destination workspace folder for agents' });
      if (!pick) return;
      folder = pick.folder;
    }

    const destDir = vscode.Uri.joinPath(folder.uri, '.github', 'agents');
    try { await vscode.workspace.fs.createDirectory(destDir); } catch (e) { /* ignore */ }

    const existing: string[] = [];
    for (const agent of chosenAgents) {
      const target = vscode.Uri.joinPath(destDir, agent.filename);
      try { await vscode.workspace.fs.stat(target); existing.push(agent.filename); } catch (e) {}
    }

    let overwriteBehaviour: 'overwrite' | 'skip' = 'skip';
    if (existing.length && !isTestMode) {
      const pick = await vscode.window.showInformationMessage(`Destination contains ${existing.length} agent files. Overwrite?`, 'Overwrite All', 'Skip existing', 'Cancel');
      if (!pick || pick === 'Cancel') { vscode.window.showInformationMessage('Install agents canceled.'); return; }
      overwriteBehaviour = pick === 'Overwrite All' ? 'overwrite' : 'skip';
    } else if (isTestMode && existing.length) {
      // In test mode, default to skip existing files to avoid conflicts
      overwriteBehaviour = 'skip';
    }

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Installing agents to .github/agents', cancellable: false }, async (progress) => {
      const total = chosenAgents.length; let done = 0; let written = 0; let skipped = 0;
      for (const agent of chosenAgents) {
        const target = vscode.Uri.joinPath(destDir, agent.filename);
        let exists = false; try { await vscode.workspace.fs.stat(target); exists = true; } catch (e) { exists = false; }
        if (exists && overwriteBehaviour === 'skip') { skipped++; }
        else {
          const g: any = globalThis as any;
          let data: Uint8Array;
          if (typeof g.TextEncoder === 'function') data = new g.TextEncoder().encode(agent.content);
          else if (g.Buffer && typeof g.Buffer.from === 'function') data = g.Buffer.from(agent.content, 'utf8');
          else data = new Uint8Array(agent.content.split('').map((c: string) => c.charCodeAt(0)));
          try { await vscode.workspace.fs.writeFile(target, data); written++; } catch (e) { console.error(e); }
        }
        done++; progress.report({ increment: Math.round(100 * done / total), message: `${done}/${total}` });
      }
      if (!isTestMode) {
        vscode.window.showInformationMessage(`Installed ${written} agent files, skipped ${skipped}`);
      }
    });
  }));

  // Install built-in protected files (copilot ignore, PROTECTED_FILES.md, etc.)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.installProtectedFiles', async () => {
    await reload();
    const files = getProtectedFilesEmbedded();
    if (!files.length) { vscode.window.showInformationMessage('No protected files embedded.'); return; }
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) { vscode.window.showErrorMessage('No workspace folder open.'); return; }
    let folder: vscode.WorkspaceFolder;
    if (ws.length === 1) folder = ws[0]; else {
      const pick = await vscode.window.showQuickPick(ws.map(f => ({ label: f.name, folder: f })), { placeHolder: 'Select destination workspace folder for protected files' });
      if (!pick) return; folder = pick.folder;
    }
    const destDir = vscode.Uri.joinPath(folder.uri, '.github');
    try { await vscode.workspace.fs.createDirectory(destDir); } catch (e) { /* ignore */ }

    // Confirm action because these are protected files
    const confirm = await vscode.window.showWarningMessage('These files are protected and define agent behavior. Are you sure you want to install/overwrite them in the workspace?', 'Yes, install', 'Cancel');
    if (!confirm || confirm === 'Cancel') { vscode.window.showInformationMessage('Install protected files canceled.'); return; }

    let written = 0; let skipped = 0;
    for (const f of files) {
      const target = vscode.Uri.joinPath(destDir, f.filename);
      let exists = false; try { await vscode.workspace.fs.stat(target); exists = true; } catch (e) { exists = false; }
      if (exists) {
        const pick = await vscode.window.showInformationMessage(`File ${f.filename} exists in ${destDir.fsPath}. Overwrite?`, 'Overwrite', 'Skip');
        if (!pick || pick === 'Skip') { skipped++; continue; }
      }
      const g: any = globalThis as any;
      let data: Uint8Array;
      if (typeof g.TextEncoder === 'function') data = new g.TextEncoder().encode(f.content);
      else if (g.Buffer && typeof g.Buffer.from === 'function') data = g.Buffer.from(f.content, 'utf8');
      else data = new Uint8Array(f.content.split('').map((c: string) => c.charCodeAt(0)));
      try { await vscode.workspace.fs.writeFile(target, data); written++; } catch (e) { console.error(e); }
    }
    vscode.window.showInformationMessage(`Installed protected files: ${written} written, ${skipped} skipped`);
  }));

  // Install ALL: prompts, agents, and protected files in one go
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.installAll', async () => {
    await reload();
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) {
      vscode.window.showErrorMessage('No workspace folder open. Please open a workspace and try again.');
      return;
    }
    let folder: vscode.WorkspaceFolder;
    if (ws.length === 1) {
      folder = ws[0];
    } else {
      const pick = await vscode.window.showQuickPick(ws.map(f => ({ label: f.name, folder: f })), { placeHolder: 'Select destination workspace folder for install-all' });
      if (!pick) return;
      folder = pick.folder;
    }

    // Choose prompt source (embedded recommended)
    const sourcePick = await vscode.window.showQuickPick([
      { label: 'Embedded (recommended)', value: 'embedded' },
      { label: 'Workspace (if present)', value: 'workspace' }
    ].map(x => ({ label: x.label, value: x.value } as any)), { placeHolder: 'Install prompts from:' });
    if (!sourcePick) return;
    const promptSource = <'embedded'|'workspace'>(sourcePick as any).value || 'embedded';
    let promptsToInstall = await getPrompts(promptSource);
    if (!promptsToInstall || !promptsToInstall.length) promptsToInstall = await getPrompts('embedded');

    const agentsToInstall = await getAgents('embedded');
    const protectedFiles = getProtectedFilesEmbedded();

    const destPrompts = vscode.Uri.joinPath(folder.uri, '.github', 'prompts');
    const destAgents = vscode.Uri.joinPath(folder.uri, '.github', 'agents');
    const destRoot = vscode.Uri.joinPath(folder.uri, '.github');
    try { await vscode.workspace.fs.createDirectory(destPrompts); } catch {}
    try { await vscode.workspace.fs.createDirectory(destAgents); } catch {}
    try { await vscode.workspace.fs.createDirectory(destRoot); } catch {}

    // Collect existing
    const existingPrompts: string[] = [];
    for (const p of promptsToInstall) {
      const target = vscode.Uri.joinPath(destPrompts, p.filename);
      try { await vscode.workspace.fs.stat(target); existingPrompts.push(p.filename); } catch {}
    }
    const existingAgents: string[] = [];
    for (const a of agentsToInstall) {
      const target = vscode.Uri.joinPath(destAgents, a.filename);
      try { await vscode.workspace.fs.stat(target); existingAgents.push(a.filename); } catch {}
    }
    const existingProtected: string[] = [];
    for (const f of protectedFiles) {
      const target = vscode.Uri.joinPath(destRoot, f.filename);
      try { await vscode.workspace.fs.stat(target); existingProtected.push(f.filename); } catch {}
    }

    // Overwrite behaviors
    let promptOverwrite: 'overwrite'|'skip'|'cancel' = 'overwrite';
    if (existingPrompts.length) {
      const pick = await vscode.window.showInformationMessage(`.github/prompts already has ${existingPrompts.length} file(s). Overwrite?`, 'Overwrite All', 'Skip existing', 'Cancel');
      if (!pick || pick === 'Cancel') { vscode.window.showInformationMessage('Install-all canceled.'); return; }
      promptOverwrite = pick === 'Overwrite All' ? 'overwrite' : 'skip';
    }
    let agentOverwrite: 'overwrite'|'skip'|'cancel' = 'overwrite';
    if (existingAgents.length) {
      const pick = await vscode.window.showInformationMessage(`.github/agents already has ${existingAgents.length} file(s). Overwrite?`, 'Overwrite All', 'Skip existing', 'Cancel');
      if (!pick || pick === 'Cancel') { vscode.window.showInformationMessage('Install-all canceled.'); return; }
      agentOverwrite = pick === 'Overwrite All' ? 'overwrite' : 'skip';
    }

    const confirmProtected = await vscode.window.showWarningMessage('Install protected files (.copilotignore, PROTECTED_FILES.md) into .github? These define agent behavior.', 'Yes, proceed', 'Cancel');
    if (!confirmProtected || confirmProtected === 'Cancel') { vscode.window.showInformationMessage('Install-all canceled (protected files).'); return; }
    let protectedOverwrite: 'overwrite'|'skip' = 'overwrite';
    if (existingProtected.length) {
      const pick = await vscode.window.showInformationMessage(`.github already has ${existingProtected.length} protected file(s). Overwrite?`, 'Overwrite All', 'Skip existing');
      protectedOverwrite = pick === 'Skip existing' ? 'skip' : 'overwrite';
    }

    const g: any = globalThis as any;
    const encode = (text: string): Uint8Array => {
      if (typeof g.TextEncoder === 'function') return new g.TextEncoder().encode(text);
      if (g.Buffer && typeof g.Buffer.from === 'function') return g.Buffer.from(text, 'utf8');
      return new Uint8Array(text.split('').map((c: string) => c.charCodeAt(0)));
    };

    let writtenPrompts = 0, skippedPrompts = 0;
    let writtenAgents = 0, skippedAgents = 0;
    let writtenProtected = 0, skippedProtected = 0;

    const total = promptsToInstall.length + agentsToInstall.length + protectedFiles.length;
    let done = 0;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Installing prompts, agents, and protected files', cancellable: false }, async (progress) => {
      const tick = (label: string) => {
        done++; progress.report({ increment: Math.round(100 * (done / total)), message: `${label} ${done}/${total}` });
      };

      // Prompts
      for (const p of promptsToInstall) {
        const target = vscode.Uri.joinPath(destPrompts, p.filename);
        let exists = false; try { await vscode.workspace.fs.stat(target); exists = true; } catch {}
        if (exists && promptOverwrite === 'skip') { skippedPrompts++; tick('Prompts'); continue; }
        try { await vscode.workspace.fs.writeFile(target, encode(p.content)); writtenPrompts++; } catch (e) { console.error(e); }
        tick('Prompts');
      }

      // Agents
      for (const a of agentsToInstall) {
        const target = vscode.Uri.joinPath(destAgents, a.filename);
        let exists = false; try { await vscode.workspace.fs.stat(target); exists = true; } catch {}
        if (exists && agentOverwrite === 'skip') { skippedAgents++; tick('Agents'); continue; }
        try { await vscode.workspace.fs.writeFile(target, encode(a.content)); writtenAgents++; } catch (e) { console.error(e); }
        tick('Agents');
      }

      // Protected
      for (const f of protectedFiles) {
        const target = vscode.Uri.joinPath(destRoot, f.filename);
        let exists = false; try { await vscode.workspace.fs.stat(target); exists = true; } catch {}
        if (exists && protectedOverwrite === 'skip') { skippedProtected++; tick('Protected'); continue; }
        try { await vscode.workspace.fs.writeFile(target, encode(f.content)); writtenProtected++; } catch (e) { console.error(e); }
        tick('Protected');
      }
    });

    vscode.window.showInformationMessage(
      `Install-all complete: Prompts ${writtenPrompts} written/${skippedPrompts} skipped, ` +
      `Agents ${writtenAgents} written/${skippedAgents} skipped, ` +
      `Protected ${writtenProtected} written/${skippedProtected} skipped.`
    );

    // Open one of the resulting files for convenience
    try {
      const first = promptsToInstall[0];
      if (first) {
        const target = vscode.Uri.joinPath(destPrompts, first.filename);
        const doc = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(doc, { preview: true });
      }
    } catch {}

    // First-run prompt: offer to install MCPs
    const mcpAction = await vscode.window.showInformationMessage(
      'Would you like to install recommended MCP servers for enhanced AI capabilities?',
      'Install MCPs',
      'Not Now'
    );
    if (mcpAction === 'Install MCPs') {
      await vscode.commands.executeCommand('aiSkeleton.installMCPs');
    }
  }));

  // ========================================
  // MCP INSTALLATION COMMAND
  // ========================================

  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.installMCPs', async () => {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) {
      vscode.window.showErrorMessage('No workspace folder open. Please open a workspace and try again.');
      return;
    }

    // Show MCP servers info
    const servers = getMCPServerList();
    const serverInfo = servers.map(s => `• ${s.description}`).join('\n');
    
    const confirm = await vscode.window.showInformationMessage(
      `Install MCP server configurations?\n\nServers:\n${serverInfo}\n\nThis will create .vscode/mcp.json in your workspace.`,
      { modal: true },
      'Install',
      'Cancel'
    );
    if (confirm !== 'Install') return;

    let folder: vscode.WorkspaceFolder;
    if (ws.length === 1) {
      folder = ws[0];
    } else {
      const pick = await vscode.window.showQuickPick(
        ws.map(f => ({ label: f.name, folder: f })),
        { placeHolder: 'Select workspace folder to install MCP config into' }
      );
      if (!pick) return;
      folder = pick.folder;
    }

    const vscodeDir = vscode.Uri.joinPath(folder.uri, '.vscode');
    const mcpFile = vscode.Uri.joinPath(vscodeDir, 'mcp.json');

    try {
      // Create .vscode directory if needed
      try { await vscode.workspace.fs.createDirectory(vscodeDir); } catch {}

      // Check if mcp.json already exists
      let exists = false;
      try {
        await vscode.workspace.fs.stat(mcpFile);
        exists = true;
      } catch {}

      if (exists) {
        const overwrite = await vscode.window.showWarningMessage(
          '.vscode/mcp.json already exists. Overwrite?',
          'Overwrite',
          'Cancel'
        );
        if (overwrite !== 'Overwrite') return;
      }

      // Write MCP config
      const mcpContent = getMCPConfigString();
      const g: any = globalThis as any;
      let data: Uint8Array;
      if (typeof g.TextEncoder === 'function') {
        data = new g.TextEncoder().encode(mcpContent);
      } else if (g.Buffer && typeof g.Buffer.from === 'function') {
        data = g.Buffer.from(mcpContent, 'utf8');
      } else {
        data = new Uint8Array(mcpContent.split('').map((c: string) => c.charCodeAt(0)));
      }
      
      await vscode.workspace.fs.writeFile(mcpFile, data);

      // Open the file for review first
      const doc = await vscode.workspace.openTextDocument(mcpFile);
      await vscode.window.showTextDocument(doc, { preview: false });

      // Auto-reload to enable MCPs
      const action = await vscode.window.showInformationMessage(
        `✓ MCP servers installed to .vscode/mcp.json\n\nReloading window to enable MCPs...`,
        { modal: false },
        'Reload Now',
        'Later'
      );
      
      if (action !== 'Later') {
        // Auto-reload after 1 second to give user time to see the file
        setTimeout(() => {
          vscode.commands.executeCommand('workbench.action.reloadWindow');
        }, 1000);
      }

    } catch (err) {
      vscode.window.showErrorMessage(`Failed to install MCP config: ${err}`);
    }
  }));

  // Manual start MCP servers
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.startMCPs', async () => {
    await startMCPServers(context);
  }));

  // ========================================
  // MEMORY MANAGEMENT COMMANDS
  // ========================================

  // Show memory status
  // Show context usage breakdown by tool
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.context.showUsage', async () => {
    try {
      const toolMetrics = await metricsService.getToolMetrics(7);
      const latestMetric = await metricsService.getLatestTokenMetric();
      
      if (Object.keys(toolMetrics).length === 0) {
        vscode.window.showInformationMessage(
          'No token usage data available yet. Token tracking starts after using LM tools.',
          'OK'
        );
        return;
      }

      // Sort tools by total tokens (highest first)
      const sorted = Object.entries(toolMetrics)
        .sort(([, a], [, b]) => b.totalTokens - a.totalTokens);

      const lines: string[] = [
        '📊 Token Usage by Tool (Last 7 Days)',
        '═'.repeat(50),
        ''
      ];

      let grandTotal = 0;
      let grandCalls = 0;

      for (const [tool, stats] of sorted) {
        const percentage = latestMetric?.total_tokens 
          ? ((stats.totalTokens / latestMetric.total_tokens) * 100).toFixed(1)
          : '0.0';
        
        lines.push(
          `${tool}:`,
          `  Calls: ${stats.count}`,
          `  Total: ${formatTokens(stats.totalTokens)} tokens`,
          `  Average: ${formatTokens(stats.averageTokens)} tokens/call`,
          ''
        );
        
        grandTotal += stats.totalTokens;
        grandCalls += stats.count;
      }

      lines.push(
        '─'.repeat(50),
        `Total: ${grandCalls} calls, ${formatTokens(grandTotal)} tokens`,
        `Current Budget: ${latestMetric?.total_tokens ? formatTokens(latestMetric.total_tokens) : 'N/A'} used`
      );

      const panel = vscode.window.createOutputChannel('AI Skeleton: Token Usage', { log: true });
      panel.clear();
      panel.appendLine(lines.join('\n'));
      panel.show();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to retrieve token usage: ${err}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.showStatus', async () => {
    const state = memoryService.state;
    if (state.active) {
      const action = await vscode.window.showInformationMessage(
        `Memory Bank: ACTIVE at ${state.path?.fsPath}`,
        'Open Memory Bank', 'Show Summary'
      );
      if (action === 'Open Memory Bank' && state.path) {
        await vscode.commands.executeCommand('revealInExplorer', state.path);
      } else if (action === 'Show Summary') {
        await vscode.commands.executeCommand('aiSkeleton.memory.show');
      }
    } else {
      const action = await vscode.window.showWarningMessage(
        'Memory Bank: INACTIVE - No memory-bank folder found.',
        'Create Memory Bank'
      );
      if (action === 'Create Memory Bank') {
        await vscode.commands.executeCommand('aiSkeleton.memory.create');
      }
    }
  }));

  // Clear current context
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.context.clear', async () => {
    const confirmed = await vscode.window.showWarningMessage(
      'Clear current context?',
      { modal: true },
      'Yes'
    );
    if (confirmed === 'Yes') {
      try {
        const memoryStore = getMemoryStore();
        // Query for current CONTEXT entry and mark as deprecated
        const result = await memoryStore.queryByType('CONTEXT', 1);
        if (result.entries && result.entries.length > 0) {
          // Create deprecated entry to mark context as cleared
          await memoryStore.appendEntry({
            file_type: 'CONTEXT',
            timestamp: new Date().toISOString(),
            tag: `[CONTEXT:${new Date().toISOString().split('T')[0]}] Context Cleared`,
            content: 'Context has been cleared. Ready for new task.',
            progress_status: 'deprecated'
          });
        }
        vscode.window.showInformationMessage('Context cleared');
        memoryDashboardProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to clear context: ${err}`);
      }
    }
  }));

  // Open context in editor
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.context.open', async (content: string, tag: string) => {
    try {
      // Create an untitled document with the context content
      const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: `# ${tag}\n\n${content}`
      });
      
      // Open in editor as preview (read-only)
      await vscode.window.showTextDocument(doc, {
        preview: true,
        preserveFocus: false
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to open context: ${err}`);
    }
  }));

  // View memory file (Decision Log, Context, Progress, Patterns, Brief)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.viewFile', async (fileType: string) => {
    try {
      const memoryService = getMemoryService();
      const entries = await memoryService.queryByType(fileType as any);
      
      if (entries.length === 0) {
        vscode.window.showWarningMessage(`No entries found in ${fileType}`);
        return;
      }

      // Format all entries with timestamps and tags
      const fileTypeLabel = {
        'DECISION': 'Decision Log',
        'CONTEXT': 'Context History',
        'PROGRESS': 'Progress Tracking',
        'PATTERN': 'System Patterns',
        'BRIEF': 'Project Brief'
      }[fileType] || fileType;

      // Build markdown content showing all entries
      let content = `# ${fileTypeLabel}\n\n**Total entries: ${entries.length}**\n\n`;
      
      // Sort by timestamp descending (newest first)
      const sorted = [...entries].sort((a, b) => {
        const aTime = new Date(a.timestamp || 0).getTime();
        const bTime = new Date(b.timestamp || 0).getTime();
        return bTime - aTime;
      });

      for (const entry of sorted) {
        const tag = (entry as any).tag ? ` - ${(entry as any).tag}` : '';
        const date = entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'Unknown';
        content += `## ${date}${tag}\n\n${entry.content}\n\n---\n\n`;
      }

      // Open in editor as preview (read-only)
      const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content
      });
      
      await vscode.window.showTextDocument(doc, {
        preview: true,
        preserveFocus: false
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to open memory file: ${err}`);
    }
  }));

  // Start new task / context
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.context.newTask', async () => {
    const task = await vscode.window.showInputBox({
      prompt: 'Enter new task/context description',
      placeHolder: 'E.g., Implement feature X, Debug issue Y, etc.',
      ignoreFocusOut: true
    });

    if (!task || !task.trim()) {
      return;
    }

    try {
      const memoryStore = getMemoryStore();
      const today = new Date().toISOString().split('T')[0];
      const timestamp = new Date().toISOString();
      
      await memoryStore.appendEntry({
        file_type: 'CONTEXT',
        timestamp,
        tag: `[TASK:${today}] ${task.trim()}`,
        content: `Starting new task: ${task.trim()}\n\nInitial phase: research`,
        phase: 'research',
        progress_status: 'in-progress'
      });

      vscode.window.showInformationMessage(`New task created: ${task.trim()}`);
      memoryDashboardProvider.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create task: ${err}`);
    }
  }));

  // Create memory bank
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.create', async () => {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws || !ws.length) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    let folder: vscode.WorkspaceFolder;
    if (ws.length === 1) {
      folder = ws[0];
    } else {
      const pick = await vscode.window.showQuickPick(
        ws.map(f => ({ label: f.name, folder: f })),
        { placeHolder: 'Select workspace folder to create memory bank in' }
      );
      if (!pick) return;
      folder = pick.folder;
    }

    await memoryService.createMemoryBank(folder);
  }));

  // Show memory summary
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.show', async () => {
    const summary = await memoryService.showMemory();
    const doc = await vscode.workspace.openTextDocument({ content: summary, language: 'markdown' });
    await vscode.window.showTextDocument(doc, { preview: true });
  }));

  // Log decision command (interactive with user prompts)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.logDecision', async (decision?: string, rationale?: string) => {
    // If called with arguments (e.g., from agent via runCommands), use them directly
    if (!decision) {
      decision = await vscode.window.showInputBox({
        prompt: 'Enter the decision',
        placeHolder: 'e.g., Use React Query for data fetching'
      });
    }
    if (!decision) return;

    if (!rationale) {
      rationale = await vscode.window.showInputBox({
        prompt: 'Enter the rationale',
        placeHolder: 'e.g., Better caching and automatic refetching'
      });
    }
    if (!rationale) return;

    const success = await memoryService.logDecision(decision, rationale);
    if (success) {
      vscode.window.showInformationMessage(`Decision logged: ${decision}`);
    }
  }));

  // Update context command (accepts context as argument for agent use)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.updateContext', async (contextText?: string) => {
    if (!contextText) {
      contextText = await vscode.window.showInputBox({
        prompt: 'Enter context update',
        placeHolder: 'e.g., Working on authentication module'
      });
    }
    if (!contextText) return;

    const success = await memoryService.updateContext(contextText);
    if (success) {
      vscode.window.showInformationMessage('Context updated');
    }
  }));

  // Update progress command (accepts item and status as arguments for agent use)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.updateProgress', async (item?: string, statusValue?: 'done'|'doing'|'next') => {
    if (!item) {
      item = await vscode.window.showInputBox({
        prompt: 'Enter progress item',
        placeHolder: 'e.g., Implement user login'
      });
    }
    if (!item) return;

    if (!statusValue) {
      const status = await vscode.window.showQuickPick(
        [
          { label: 'Done', value: 'done' },
          { label: 'Doing', value: 'doing' },
          { label: 'Next', value: 'next' }
        ],
        { placeHolder: 'Select status' }
      );
      if (!status) return;
      statusValue = status.value as 'done'|'doing'|'next';
    }

    const success = await memoryService.updateProgress(item, statusValue!);
    if (success) {
      const statusLabel = statusValue === 'done' ? 'Done' : statusValue === 'doing' ? 'Doing' : 'Next';
      vscode.window.showInformationMessage(`Progress updated: ${item} → ${statusLabel}`);
    }
  }));

  // Update patterns command (accepts pattern and description as arguments for agent use)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.updatePatterns', async (pattern?: string, description?: string) => {
    if (!pattern) {
      pattern = await vscode.window.showInputBox({
        prompt: 'Enter pattern name',
        placeHolder: 'e.g., Repository Pattern'
      });
    }
    if (!pattern) return;

    if (!description) {
      description = await vscode.window.showInputBox({
        prompt: 'Enter pattern description',
        placeHolder: 'e.g., Abstraction layer for data access'
      });
    }
    if (!description) return;

    const success = await memoryService.updateSystemPatterns(pattern, description);
    if (success) {
      vscode.window.showInformationMessage(`Pattern recorded: ${pattern}`);
    }
  }));

  // Dump memory to markdown files (user-triggered one-shot export)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.dump', async () => {
    const state = await memoryService.detectMemoryBank();
    if (!state.active) {
      vscode.window.showWarningMessage('AI-Memory not active. Create one first.');
      return;
    }
    
    const success = await memoryService.exportToMarkdown();
    if (success) {
      vscode.window.showInformationMessage('Memory dumped to markdown files successfully.');
    } else {
      vscode.window.showErrorMessage('Failed to dump memory to markdown.');
    }
  }));

  // Generate embeddings for all entries (background indexing)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.generateEmbeddings', async () => {
    const state = await memoryService.detectMemoryBank();
    if (!state.active) {
      vscode.window.showWarningMessage('AI-Memory not active. Create one first.');
      return;
    }

    logger.info('[Embeddings] Starting full embedding generation for all entries');
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Generating embeddings for memory entries',
      cancellable: false
    }, async (progress) => {
      try {
        const memoryStore = getMemoryStore();
        
        // Get all entries
        const allTypes: ('CONTEXT' | 'DECISION' | 'PROGRESS' | 'PATTERN' | 'BRIEF')[] = ['CONTEXT', 'DECISION', 'PROGRESS', 'PATTERN', 'BRIEF'];
        let allEntries: any[] = [];
        
        for (const type of allTypes) {
          const result = await memoryStore.queryByType(type, 1000);
          allEntries = allEntries.concat(result.entries);
        }

        const total = allEntries.length;
        progress.report({ increment: 0, message: `Found ${total} entries` });

        // Filter entries that don't have embeddings
        const entriesWithEmbeddings = await memoryStore.queryEntriesWithEmbeddings(10000);
        const idsWithEmbeddings = new Set(entriesWithEmbeddings.map(e => e.id));
        const entriesNeedingEmbeddings = allEntries.filter(e => !idsWithEmbeddings.has(e.id));

        if (entriesNeedingEmbeddings.length === 0) {
          vscode.window.showInformationMessage('All entries already have embeddings!');
          return;
        }

        progress.report({ message: `Generating embeddings for ${entriesNeedingEmbeddings.length} entries...` });

        // Generate embeddings with progress updates
        const { getEmbeddingService, quantizeEmbedding } = await import('./embeddingService');
        const embeddingService = getEmbeddingService();
        
        let processed = 0;
        let failed = 0;
        let skipped = 0;
        for (const entry of entriesNeedingEmbeddings) {
          try {
            const content = typeof entry.content === 'string' ? entry.content : '';
            if (!content.trim()) {
              skipped++;
              logger.warn(`[Embeddings] Skipping empty entry ${entry.id}`);
              continue;
            }

            const result = await embeddingService.embed(content);
            const quantized = quantizeEmbedding(result.embedding);
            const buffer = Buffer.from(quantized);

            // Update the entry with the embedding
            if (memoryStore.backend === 'better-sqlite3') {
              const stmt = (memoryStore as any).db.prepare(`UPDATE entries SET embedding = ? WHERE id = ?`);
              stmt.run(buffer, entry.id);
            } else if (memoryStore.backend === 'sql.js') {
              (memoryStore as any).db.run(`UPDATE entries SET embedding = ? WHERE id = ?`, [buffer, entry.id]);
              await (memoryStore as any).persistSqlJs();
            }

            processed++;
            const percentage = Math.round((processed / entriesNeedingEmbeddings.length) * 100);
            progress.report({ 
              increment: 100 / entriesNeedingEmbeddings.length,
              message: `${processed}/${entriesNeedingEmbeddings.length} (${percentage}%)`
            });
          } catch (err: any) {
            const message = err?.message || String(err);
            logger.error(`[Embeddings] Failed to generate embedding for entry ${entry.id}: ${message}`, err?.stack || err);
            failed++;
          }
        }

        if (failed > 0) {
          logger.warn(`[Embeddings] Completed with failures. Processed ${processed}/${entriesNeedingEmbeddings.length}, failed ${failed}, skipped ${skipped}.`);
          vscode.window.showWarningMessage(`Generated embeddings for ${processed}/${entriesNeedingEmbeddings.length} (skipped ${skipped}, failed ${failed}). See Output: AI Skeleton for details.`);
        } else {
          logger.info(`[Embeddings] Successfully generated embeddings for ${processed}/${entriesNeedingEmbeddings.length} entries (skipped ${skipped}).`);
          vscode.window.showInformationMessage(`Successfully generated embeddings for ${processed}/${entriesNeedingEmbeddings.length} entries (skipped ${skipped}).`);
        }
      } catch (err) {
        logger.error('[Embeddings] Fatal error during generation:', err);
        vscode.window.showErrorMessage(`Failed to generate embeddings. See Output: AI Skeleton for details.`);
      }
    });
  }));

  // Generic memory update command (accepts context, progress, or pattern updates)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.update', async (entry?: any) => {
    if (!entry) {
      await vscode.commands.executeCommand('aiSkeleton.memory.updateContext');
      return;
    }

    // Handle different update types based on entry structure
    if (typeof entry === 'object') {
      // Support both new format (type/content) and old format (specific fields)
      if (entry.type && entry.content) {
        // New format from tests/LM tools
        const type = entry.type.toUpperCase();
        if (type === 'CONTEXT') {
          await memoryService.updateContext(entry.content);
        } else if (type === 'DECISION' && entry.rationale) {
          await memoryService.logDecision(entry.content, entry.rationale);
        } else if (type === 'DECISION') {
          // For decisions without explicit rationale, use content as both
          await memoryService.logDecision(entry.content, '');
        } else if (type === 'PROGRESS' && entry.status) {
          await memoryService.updateProgress(entry.content, entry.status);
        } else if (type === 'PROGRESS') {
          // Default status for progress entries
          await memoryService.updateProgress(entry.content, 'doing');
        } else if (type === 'PATTERN' && entry.description) {
          await memoryService.updateSystemPatterns(entry.content, entry.description);
        } else if (type === 'PATTERN') {
          // Pattern without description
          await memoryService.updateSystemPatterns(entry.content, '');
        }
      } else if (entry.context) {
        // Old format
        await memoryService.updateContext(entry.context);
      } else if (entry.decision && entry.rationale) {
        await memoryService.logDecision(entry.decision, entry.rationale);
      } else if (entry.item && entry.status) {
        await memoryService.updateProgress(entry.item, entry.status);
      } else if (entry.pattern && entry.description) {
        await memoryService.updateSystemPatterns(entry.pattern, entry.description);
      }
      vscode.window.showInformationMessage('Memory updated');
    }
  }));

  // Refresh prompts tree view command
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.prompts.refresh', async () => {
    await reload();
    provider.refresh();
    vscode.window.showInformationMessage('Prompts tree refreshed');
  }));

  // Export research report from RESEARCH phase entries
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.exportResearchReport', async () => {
    try {
      const success = await memoryService.savePhaseReport('research');
      if (success) {
        vscode.window.showInformationMessage('✓ Research report exported successfully');
      } else {
        vscode.window.showWarningMessage('No research entries found to export');
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to export research report: ${err instanceof Error ? err.message : String(err)}`);
    }
  }));

  // Export plan report from PLANNING phase entries
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.exportPlanReport', async () => {
    try {
      const success = await memoryService.savePhaseReport('planning');
      if (success) {
        vscode.window.showInformationMessage('✓ Plan report exported successfully');
      } else {
        vscode.window.showWarningMessage('No planning entries found to export');
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to export plan report: ${err instanceof Error ? err.message : String(err)}`);
    }
  }));

  // Export execution report from EXECUTION phase entries
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.exportExecutionReport', async () => {
    try {
      const success = await memoryService.savePhaseReport('execution');
      if (success) {
        vscode.window.showInformationMessage('✓ Execution report exported successfully');
      } else {
        vscode.window.showWarningMessage('No execution entries found to export');
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to export execution report: ${err instanceof Error ? err.message : String(err)}`);
    }
  }));

  // Export all phase reports (research, plan, execution)
  context.subscriptions.push(vscode.commands.registerCommand('aiSkeleton.memory.exportAllReports', async () => {
    try {
      const success = await memoryService.saveAllPhaseReports();
      if (success) {
        vscode.window.showInformationMessage('✓ All phase reports exported successfully');
      } else {
        vscode.window.showWarningMessage('Some reports may have failed. Check the AI-Memory folder.');
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to export reports: ${err instanceof Error ? err.message : String(err)}`);
    }
  }));

  // React to configuration changes
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
    if (e.affectsConfiguration('aiSkeleton.prompts.source')) {
      await reload();
    }
  }));
}

function openPromptDocument(prompt: Prompt | undefined) {
  if (!prompt) return;
  const docPromise = vscode.workspace.openTextDocument({ content: prompt.content, language: 'markdown' });
  docPromise.then((d: vscode.TextDocument) => vscode.window.showTextDocument(d, { preview: false }));
}

export function deactivate() {}
