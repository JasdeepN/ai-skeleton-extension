import * as vscode from 'vscode';

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
        existing.show(false);
        continue;
      }

      const terminal = vscode.window.createTerminal({ name: termName, iconPath: new vscode.ThemeIcon('plug') });
      const commandLine = [command, ...escapedArgs].join(' ');
      terminal.sendText(commandLine, true);
      terminal.show(false);
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
    const action = await vscode.window.showInformationMessage('Start configured MCP servers on startup?', 'Start Now', 'Always', 'Not Now');
    if (action === 'Always') {
      await context.globalState.update(key, true);
      await startMCPServers(context);
    } else if (action === 'Start Now') {
      await startMCPServers(context);
    }
    return;
  }

  await startMCPServers(context);
}
