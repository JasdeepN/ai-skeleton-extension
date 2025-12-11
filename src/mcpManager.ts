import * as vscode from 'vscode';
import * as path from 'path';

interface MCPConfig {
  servers: Record<string, any>;
}

function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const ws = vscode.workspace.workspaceFolders;
  return ws && ws.length ? ws[0] : undefined;
}

function expandVariables(text: string, folder?: vscode.WorkspaceFolder): string {
  if (!text) return text;
  const folderPath = folder?.uri.fsPath ?? '';
  return text.replace(/\$\{workspaceFolder\}/g, folderPath);
}

export async function startMCPServers(context: vscode.ExtensionContext): Promise<void> {
  const folder = getWorkspaceFolder();
  if (!folder) {
    vscode.window.showWarningMessage('No workspace folder open. Cannot start MCP servers.');
    return;
  }

  const mcpUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'mcp.json');
  let configText: string | undefined;
  try {
    const data = await vscode.workspace.fs.readFile(mcpUri);
    configText = Buffer.from(data).toString('utf8');
  } catch {
    vscode.window.showWarningMessage('No .vscode/mcp.json found in the workspace. Install MCP servers first.');
    return;
  }

  let config: MCPConfig | undefined;
  try {
    config = JSON.parse(configText!);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to parse .vscode/mcp.json: ${err}`);
    return;
  }

  const servers = config?.servers ?? {};
  const entries = Object.entries(servers);
  if (!entries.length) {
    vscode.window.showInformationMessage('No MCP servers configured in .vscode/mcp.json.');
    return;
  }

  // Start command-based servers (http servers do not need local start)
  for (const [id, server] of entries) {
    try {
      if (server.type === 'http') {
        // HTTP servers are remote endpoints; nothing to start locally
        continue;
      }
      const command: string = server.command;
      const args: string[] = Array.isArray(server.args) ? server.args : [];
      const expandedArgs = args.map(a => expandVariables(a, folder));
      const escapedArgs = expandedArgs.map(a => /\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

      const termName = `MCP: ${id}`;
      // Avoid duplicate terminals with same name
      const existing = vscode.window.terminals.find(t => t.name === termName);
      if (existing) {
        // If terminal still active, skip starting again
        continue;
      }

      // Create terminal in background without showing it
      const terminal = vscode.window.createTerminal({ 
        name: termName, 
        iconPath: new vscode.ThemeIcon('plug'),
        hideFromUser: true  // Keep terminal truly hidden/background
      });

      // If the command uses uvx, ensure we run it with a clean Python environment to avoid
      // leaking user/site packages (e.g., ESP-IDF) that can break mcp-server-* dependencies.
      const isUv = path.basename(command) === 'uvx' || command.includes('uvx ');
      let commandLine = [command, ...escapedArgs].join(' ');

      if (isUv) {
        if (process.platform === 'win32') {
          // Best-effort Windows equivalent: clear PYTHONPATH and disable user site packages
          commandLine = `set PYTHONPATH=& set PYTHONNOUSERSITE=1& ${commandLine}`;
        } else {
          commandLine = `env -u PYTHONPATH PYTHONNOUSERSITE=1 ${commandLine}`;
        }
      }
      terminal.sendText(commandLine, true);
      // Don't show terminal - keep it in background
      context.subscriptions.push(terminal);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to start MCP server '${id}': ${err}`);
    }
  }

  vscode.window.showInformationMessage('✓ MCP servers start triggered (terminals created where applicable).');
}

export async function maybeAutoStartMCPs(context: vscode.ExtensionContext): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('aiSkeleton');
  const autoStart = cfg.get<boolean>('mcp.autoStart', false);
  if (!autoStart) return;

  // Ask once per workspace (stores state key)
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const key = `aiSkeleton.mcp.autoStart.confirmed:${ws}`;
  const confirmed = context.globalState.get<boolean>(key, false);
  if (!confirmed) {
    const action = await vscode.window.showInformationMessage(
      'Start configured MCP servers on startup?',
      { title: 'Start Now' },
      { title: "Don't Ask Again", isCloseAffordance: false },
      { title: 'Cancel', isCloseAffordance: true }
    );
    
    if (action?.title === 'Start Now') {
      await startMCPServers(context);
    } else if (action?.title === "Don't Ask Again") {
      // Store preference and auto-start in the future
      await context.globalState.update(key, true);
      await startMCPServers(context);
    }
    // Cancel does nothing, just returns
    return;
  }

  // User previously selected "Don't Ask Again", so auto-start now
  await startMCPServers(context);
}
