// Setup Service - Unified installation and smart merge for AI Skeleton components
// Handles: AI-Memory, Prompts, Agents, Protected Files, MCP Configuration

import * as vscode from 'vscode';
import { getPrompts } from './promptStore';
import { getAgents, getProtectedFilesEmbedded } from './agentStore';
import { getMCPConfigString } from './mcpStore';
import { getMemoryService } from './memoryService';

// Component definition for installation
export interface InstallableComponent {
  id: string;
  label: string;
  description: string;
  detail: string;
  picked: boolean;
  fileCount: number;
  targetPath: string;
}

// Metadata for tracking installed files
interface InstalledFileMetadata {
  version: string;
  hash: string;
  installedAt: string;
  hasUserSection: boolean;
}

// Section markers for smart merge
const SYSTEM_START = '<!-- SYSTEM:START - DO NOT MODIFY THIS SECTION -->';
const SYSTEM_END = '<!-- SYSTEM:END -->';
const USER_START = '<!-- USER:START - Your customizations below -->';
const USER_END = '<!-- USER:END -->';

/**
 * Get the extension version from package.json
 */
function getExtensionVersion(): string {
  const ext = vscode.extensions.getExtension('jasdeepn.ai-skeleton-extension');
  return ext?.packageJSON?.version || '0.0.0';
}

/**
 * Simple hash function for content comparison
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Encode text to Uint8Array for file writing
 */
function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Decode Uint8Array to text
 */
function decode(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

/**
 * Detect which components are missing or need updates
 */
export async function detectMissingComponents(context: vscode.ExtensionContext): Promise<InstallableComponent[]> {
  const ws = vscode.workspace.workspaceFolders;
  if (!ws || !ws.length) return [];
  
  const rootUri = ws[0].uri;
  const components: InstallableComponent[] = [];
  
  // Check AI-Memory
  const memoryService = getMemoryService();
  if (!memoryService.state.active) {
    components.push({
      id: 'memory',
      label: '$(database) AI-Memory',
      description: '5 template files',
      detail: 'Memory management for persistent AI context across sessions',
      picked: true,
      fileCount: 5,
      targetPath: 'AI-Memory/'
    });
  }
  
  // Check Prompts
  const promptsPath = vscode.Uri.joinPath(rootUri, '.github', 'prompts');
  const promptsMissing = await checkDirectoryMissing(promptsPath);
  if (promptsMissing) {
    const prompts = await getPrompts('embedded');
    components.push({
      id: 'prompts',
      label: '$(file-text) Workflow Prompts',
      description: `${prompts.length} prompt files`,
      detail: 'Think, Plan, Execute, Checkpoint, Startup, Sync, GH workflow templates',
      picked: true,
      fileCount: prompts.length,
      targetPath: '.github/prompts/'
    });
  }
  
  // Check Agents
  const agentsPath = vscode.Uri.joinPath(rootUri, '.github', 'agents');
  const agentsMissing = await checkDirectoryMissing(agentsPath);
  if (agentsMissing) {
    const agents = await getAgents();
    components.push({
      id: 'agents',
      label: '$(hubot) Agent Definitions',
      description: `${agents.length} agent files`,
      detail: 'Memory-Deep-Think, Memory-MCP-Research, Memory-Prompt agent modes',
      picked: true,
      fileCount: agents.length,
      targetPath: '.github/agents/'
    });
  }
  
  // Check Protected Files
  const guardrailsPath = vscode.Uri.joinPath(rootUri, 'GUARDRAILS.md');
  const guardrailsMissing = await checkFileMissing(guardrailsPath);
  if (guardrailsMissing) {
    const protectedFiles = getProtectedFilesEmbedded();
    components.push({
      id: 'protected',
      label: '$(shield) Protected Files',
      description: `${protectedFiles.length} files`,
      detail: 'GUARDRAILS.md (safety rules), .copilotignore, PROTECTED_FILES.md',
      picked: true,
      fileCount: protectedFiles.length,
      targetPath: 'workspace root'
    });
  }
  
  // Check MCP Configuration (optional by default)
  const mcpPath = vscode.Uri.joinPath(rootUri, '.vscode', 'mcp.json');
  const mcpMissing = await checkFileMissing(mcpPath);
  if (mcpMissing) {
    components.push({
      id: 'mcp',
      label: '$(plug) MCP Configuration',
      description: 'Optional',
      detail: 'Model Context Protocol server configuration for enhanced AI capabilities',
      picked: false, // MCP is optional, unchecked by default
      fileCount: 1,
      targetPath: '.vscode/mcp.json'
    });
  }
  
  return components;
}

async function checkDirectoryMissing(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.type !== vscode.FileType.Directory;
  } catch {
    return true;
  }
}

async function checkFileMissing(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return false;
  } catch {
    return true;
  }
}

/**
 * Show unified setup dialog - ONLY on first time or if user hasn't dismissed
 */
export async function showSetupDialog(context: vscode.ExtensionContext): Promise<void> {
  const components = await detectMissingComponents(context);
  
  // Filter to only recommended components (MCP is optional, shouldn't trigger dialog)
  const recommended = components.filter(c => c.picked);
  
  if (recommended.length === 0) {
    // No required components missing - don't show dialog
    return;
  }
  
  // Check if user already dismissed the setup for this workspace
  const dismissedSetup = context.workspaceState.get<boolean>('aiSkeleton.setupDismissed', false);
  if (dismissedSetup) {
    // User previously chose "Later" - don't bother them again
    // They can use Command Palette or Activity Bar to install
    return;
  }
  
  // Get optional components (MCP)
  const optional = components.filter(c => !c.picked);
  
  // Build friendly component summary
  const componentNames = recommended.map(c => c.label.replace(/\$\([^)]+\)\s*/, '')).join(', ');
  
  // Use MODAL information dialog - centered, friendly blue styling
  const choice = await vscode.window.showInformationMessage(
    `Welcome to AI Skeleton! 🚀`,
    { 
      modal: true, 
      detail: `This workspace needs ${recommended.length} component${recommended.length !== 1 ? 's' : ''} for full AI agent functionality:\n\n` +
              `${componentNames}${optional.length > 0 ? `\n\n(+${optional.length} optional: MCP Configuration)` : ''}\n\n` +
              `• AI-Memory: Persistent context across sessions\n` +
              `• Prompts: Think → Plan → Execute workflow\n` +
              `• Agents: Deep-Think, MCP-Research, Prompt modes\n` +
              `• GUARDRAILS: Safe AI operation rules\n\n` +
              `Install now for the best experience!`
    },
    'Install Recommended',
    'Customize...',
    'Later'
  );
  
  if (choice === 'Install Recommended') {
    await installComponents(context, recommended);
    vscode.window.showInformationMessage(
      `✅ AI Skeleton setup complete! Installed ${recommended.length} component${recommended.length !== 1 ? 's' : ''}.`
    );
  } else if (choice === 'Customize...') {
    const selected = await showComponentPicker(components);
    if (selected && selected.length > 0) {
      await installComponents(context, selected);
      vscode.window.showInformationMessage(
        `✅ AI Skeleton setup complete! Installed ${selected.length} component${selected.length !== 1 ? 's' : ''}.`
      );
    }
  } else {
    // User clicked "Later" or closed the dialog - remember this choice
    await context.workspaceState.update('aiSkeleton.setupDismissed', true);
    if (choice === 'Later') {
      vscode.window.showInformationMessage(
        '📋 Setup skipped. Install later via Command Palette: "AI Skeleton: Initialize AI-Memory", "AI Skeleton: Install Prompts/Agents"',
        'OK'
      );
    }
  }
}

/**
 * Show QuickPick for component selection
 */
async function showComponentPicker(components: InstallableComponent[]): Promise<InstallableComponent[] | undefined> {
  const items: vscode.QuickPickItem[] = components.map(c => ({
    label: c.label,
    description: c.description,
    detail: c.detail,
    picked: c.picked
  }));
  
  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: 'Select components to install',
    title: 'AI Skeleton Setup - Choose Components'
  });
  
  if (!selected) return undefined;
  
  // Map back to components
  return components.filter(c => 
    selected.some(s => s.label === c.label)
  );
}

/**
 * Install selected components
 */
export async function installComponents(
  context: vscode.ExtensionContext, 
  components: InstallableComponent[]
): Promise<void> {
  const ws = vscode.workspace.workspaceFolders;
  if (!ws || !ws.length) return;
  
  const rootUri = ws[0].uri;
  
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Installing AI Skeleton components...',
    cancellable: false
  }, async (progress) => {
    const total = components.length;
    let current = 0;
    
    for (const component of components) {
      progress.report({ 
        increment: (100 / total), 
        message: `Installing ${component.label}...` 
      });
      
      switch (component.id) {
        case 'memory':
          await installMemory(context, rootUri);
          break;
        case 'prompts':
          await installPrompts(context, rootUri);
          break;
        case 'agents':
          await installAgents(context, rootUri);
          break;
        case 'protected':
          await installProtected(context, rootUri);
          break;
        case 'mcp':
          await installMCP(context, rootUri);
          break;
      }
      
      current++;
    }
  });
}

/**
 * Install AI-Memory templates
 */
async function installMemory(context: vscode.ExtensionContext, rootUri: vscode.Uri): Promise<void> {
  const memoryService = getMemoryService();
  await memoryService.createMemoryBank();
}

/**
 * Install prompt files with smart merge
 */
async function installPrompts(context: vscode.ExtensionContext, rootUri: vscode.Uri): Promise<void> {
  const prompts = await getPrompts('embedded');
  const promptsDir = vscode.Uri.joinPath(rootUri, '.github', 'prompts');
  
  // Create directory
  await vscode.workspace.fs.createDirectory(promptsDir);
  
  // Check for updates
  const updates = await checkFileUpdates(promptsDir, prompts);
  
  if (updates.length > 0) {
    // Prompt user about available updates
    const choice = await vscode.window.showInformationMessage(
      `${updates.length} prompt(s) have updates available. Install the latest versions?`,
      'Update Prompts',
      'Skip For Now'
    );
    
    if (choice === 'Update Prompts') {
      // Install fresh versions
      for (const prompt of prompts) {
        const filePath = vscode.Uri.joinPath(promptsDir, prompt.filename);
        await vscode.workspace.fs.writeFile(filePath, encode(prompt.content));
      }
      vscode.window.showInformationMessage('✅ Prompts updated to latest versions');
    }
    return;
  }
  
  // No updates, install only missing prompts
  for (const prompt of prompts) {
    const filePath = vscode.Uri.joinPath(promptsDir, prompt.filename);
    try {
      await vscode.workspace.fs.stat(filePath);
      // File exists and matches, skip
    } catch {
      // File doesn't exist, install it
      await vscode.workspace.fs.writeFile(filePath, encode(prompt.content));
    }
  }
}

/**
 * Install agent files with smart merge
 */
async function installAgents(context: vscode.ExtensionContext, rootUri: vscode.Uri): Promise<void> {
  const agents = await getAgents();
  const agentsDir = vscode.Uri.joinPath(rootUri, '.github', 'agents');
  
  // Create directory
  await vscode.workspace.fs.createDirectory(agentsDir);
  
  // Check for updates instead of auto-merging
  const updates = await checkAgentUpdates(agentsDir, agents);
  
  if (updates.length > 0) {
    // Prompt user about available updates
    const choice = await vscode.window.showInformationMessage(
      `${updates.length} agent(s) have updates available. Install the latest versions?`,
      'Update Agents',
      'Skip For Now',
      'Ask Next Time'
    );
    
    if (choice === 'Update Agents') {
      // Install fresh versions
      for (const agent of agents) {
        const filePath = vscode.Uri.joinPath(agentsDir, agent.filename);
        await vscode.workspace.fs.writeFile(filePath, encode(agent.content));
      }
      vscode.window.showInformationMessage('✅ Agents updated to latest versions');
    }
    // 'Skip For Now' and 'Ask Next Time' do nothing - will ask again next reload
    return;
  }
  
  // No updates needed, install only missing agents
  for (const agent of agents) {
    const filePath = vscode.Uri.joinPath(agentsDir, agent.filename);
    try {
      await vscode.workspace.fs.stat(filePath);
      // File exists and matches embedded version, skip
    } catch {
      // File doesn't exist, install it
      await vscode.workspace.fs.writeFile(filePath, encode(agent.content));
    }
  }
}

/**
 * Check if files have updates available
 */
async function checkFileUpdates(dir: vscode.Uri, files: any[]): Promise<any[]> {
  const updates: any[] = [];
  
  for (const file of files) {
    const filePath = vscode.Uri.joinPath(dir, file.filename);
    try {
      const existingData = await vscode.workspace.fs.readFile(filePath);
      const existingContent = decode(existingData);
      
      if (existingContent !== file.content) {
        updates.push(file);
      }
    } catch {
      // File doesn't exist, not an update
    }
  }
  
  return updates;
}

/**
 * Check if protected files have updates available
 */
async function checkProtectedUpdates(filesWithPaths: any[]): Promise<any[]> {
  const updates: any[] = [];
  
  for (const item of filesWithPaths) {
    try {
      const existingData = await vscode.workspace.fs.readFile(item.filePath);
      const existingContent = decode(existingData);
      
      if (existingContent !== item.content) {
        updates.push(item);
      }
    } catch {
      // File doesn't exist, not an update
    }
  }
  
  return updates;
}

/**
 * Check if agents have updates available
 */
async function checkAgentUpdates(agentsDir: vscode.Uri, agents: any[]): Promise<string[]> {
  const updates: string[] = [];
  
  for (const agent of agents) {
    const filePath = vscode.Uri.joinPath(agentsDir, agent.filename);
    try {
      const existingData = await vscode.workspace.fs.readFile(filePath);
      const existingContent = decode(existingData);
      
      // Compare with embedded version
      if (existingContent !== agent.content) {
        updates.push(agent.filename);
      }
    } catch {
      // File doesn't exist, not an update
    }
  }
  
  return updates;
}

/**
 * Install protected files
 */
async function installProtected(context: vscode.ExtensionContext, rootUri: vscode.Uri): Promise<void> {
  const protectedFiles = getProtectedFilesEmbedded();
  
  // Build file list with paths
  const filesWithPaths = protectedFiles.map(file => {
    let filePath: vscode.Uri;
    
    if (file.filename === '.copilotignore') {
      filePath = vscode.Uri.joinPath(rootUri, '.copilotignore');
    } else if (file.filename === 'GUARDRAILS.md') {
      filePath = vscode.Uri.joinPath(rootUri, 'GUARDRAILS.md');
    } else if (file.filename === 'PROTECTED_FILES.md') {
      const githubDir = vscode.Uri.joinPath(rootUri, '.github');
      filePath = vscode.Uri.joinPath(githubDir, 'PROTECTED_FILES.md');
    } else {
      filePath = vscode.Uri.joinPath(rootUri, file.filename);
    }
    
    return { ...file, filePath };
  });
  
  // Check for updates
  const updates = await checkProtectedUpdates(filesWithPaths);
  
  if (updates.length > 0) {
    // Prompt user about available updates
    const updateNames = updates.map(u => u.filename).join(', ');
    const choice = await vscode.window.showInformationMessage(
      `Protected files have updates: ${updateNames}. Install the latest versions?`,
      'Update Files',
      'Skip For Now'
    );
    
    if (choice === 'Update Files') {
      // Create directories and install
      try { await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, '.github')); } catch (e) { /* ignore */ }
      
      for (const item of filesWithPaths) {
        await vscode.workspace.fs.writeFile(item.filePath, encode(item.content));
      }
      vscode.window.showInformationMessage('✅ Protected files updated to latest versions');
    }
    return;
  }
  
  // No updates, install only missing files
  try { await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, '.github')); } catch (e) { /* ignore */ }
  
  for (const item of filesWithPaths) {
    try {
      await vscode.workspace.fs.stat(item.filePath);
      // File exists and matches, skip
    } catch {
      // File doesn't exist, install it
      await vscode.workspace.fs.writeFile(item.filePath, encode(item.content));
    }
  }
}

/**
 * Install MCP configuration
 */
async function installMCP(context: vscode.ExtensionContext, rootUri: vscode.Uri): Promise<void> {
  const vscodeDir = vscode.Uri.joinPath(rootUri, '.vscode');
  await vscode.workspace.fs.createDirectory(vscodeDir);
  
  const mcpPath = vscode.Uri.joinPath(vscodeDir, 'mcp.json');
  const mcpContent = getMCPConfigString();
  
  // Check for updates
  try {
    const existingData = await vscode.workspace.fs.readFile(mcpPath);
    const existingContent = decode(existingData);
    
    if (existingContent !== mcpContent) {
      // Config has changed, prompt user
      const choice = await vscode.window.showInformationMessage(
        'MCP configuration has updates. Install the latest version?',
        'Update MCP Config',
        'Skip For Now'
      );
      
      if (choice === 'Update MCP Config') {
        await vscode.workspace.fs.writeFile(mcpPath, encode(mcpContent));
        vscode.window.showInformationMessage('✅ MCP configuration updated');
      }
    }
    // If same, do nothing
  } catch {
    // File doesn't exist, create it
    await vscode.workspace.fs.writeFile(mcpPath, encode(mcpContent));
  }
}

/**
 * Smart install a file with merge support
 * - If file doesn't exist: install fresh
 * - If file exists with USER section: preserve USER, update SYSTEM
 * - If file exists without sections: treat as user-modified, don't overwrite
 */
async function smartInstallFile(
  context: vscode.ExtensionContext,
  filePath: vscode.Uri,
  newContent: string,
  metadataKey: string
): Promise<void> {
  const metadata = context.workspaceState.get<Record<string, InstalledFileMetadata>>('aiSkeleton.installedFiles', {});
  const version = getExtensionVersion();
  
  try {
    // Check if file exists
    const existingData = await vscode.workspace.fs.readFile(filePath);
    const existingContent = decode(existingData);
    
    // Check if file has section markers
    const hasSystemSection = existingContent.includes(SYSTEM_START) && existingContent.includes(SYSTEM_END);
    const hasUserSection = existingContent.includes(USER_START) && existingContent.includes(USER_END);
    
    if (hasSystemSection && hasUserSection) {
      // Smart merge: update SYSTEM, preserve USER
      const merged = mergeContent(existingContent, newContent);
      await vscode.workspace.fs.writeFile(filePath, encode(merged));
      
      // Update metadata
      metadata[metadataKey] = {
        version,
        hash: hashContent(newContent),
        installedAt: new Date().toISOString(),
        hasUserSection: true
      };
    } else {
      // File exists but no sections - user has modified it
      // Check if content is different from our version
      const existingHash = hashContent(existingContent);
      const newHash = hashContent(newContent);
      
      if (existingHash !== newHash) {
        // User has customized - don't overwrite
        console.log(`[AI Skeleton] Skipping ${filePath.fsPath} - user customized`);
        return;
      }
      // Same content, can update safely
    }
  } catch {
    // File doesn't exist - fresh install
    // Wrap content with section markers for future smart merge
    const wrappedContent = wrapWithSections(newContent);
    await vscode.workspace.fs.writeFile(filePath, encode(wrappedContent));
    
    // Store metadata
    metadata[metadataKey] = {
      version,
      hash: hashContent(newContent),
      installedAt: new Date().toISOString(),
      hasUserSection: true
    };
  }
  
  await context.workspaceState.update('aiSkeleton.installedFiles', metadata);
}

/**
 * Wrap content with SYSTEM/USER section markers
 */
function wrapWithSections(content: string): string {
  // Find a good split point - after the header/title section
  const lines = content.split('\n');
  let splitIndex = 0;
  
  // Look for first ## heading after # heading to split
  let foundMainHeading = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('# ')) {
      foundMainHeading = true;
    } else if (foundMainHeading && lines[i].startsWith('## ')) {
      splitIndex = i;
      break;
    }
  }
  
  // If no good split point, put everything in SYSTEM
  if (splitIndex === 0) {
    return `${SYSTEM_START}\n${content}\n${SYSTEM_END}\n\n${USER_START}\n\n${USER_END}\n`;
  }
  
  // Split content
  const header = lines.slice(0, splitIndex).join('\n');
  const body = lines.slice(splitIndex).join('\n');
  
  return `${header}\n\n${SYSTEM_START}\n${body}\n${SYSTEM_END}\n\n${USER_START}\n<!-- Add your customizations here. This section is preserved on extension updates. -->\n\n${USER_END}\n`;
}

/**
 * Merge existing content with new content
 * - Extract USER section from existing
 * - Use SYSTEM section from new
 */
function mergeContent(existing: string, newContent: string): string {
  // Extract USER section from existing
  const userMatch = existing.match(new RegExp(`${escapeRegex(USER_START)}([\\s\\S]*?)${escapeRegex(USER_END)}`));
  const userSection = userMatch ? userMatch[1] : '\n<!-- Add your customizations here. This section is preserved on extension updates. -->\n\n';
  
  // Wrap new content and insert preserved USER section
  const wrapped = wrapWithSections(newContent);
  
  // Replace the default USER section with preserved one
  return wrapped.replace(
    new RegExp(`${escapeRegex(USER_START)}[\\s\\S]*?${escapeRegex(USER_END)}`),
    `${USER_START}${userSection}${USER_END}`
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if any components need updates
 */
export async function checkForUpdates(context: vscode.ExtensionContext): Promise<boolean> {
  const metadata = context.workspaceState.get<Record<string, InstalledFileMetadata>>('aiSkeleton.installedFiles', {});
  const currentVersion = getExtensionVersion();
  
  for (const [key, data] of Object.entries(metadata)) {
    if (data.version !== currentVersion) {
      return true;
    }
  }
  
  return false;
}

/**
 * Force reinstall all components (for updates)
 */
export async function reinstallAll(context: vscode.ExtensionContext): Promise<void> {
  const ws = vscode.workspace.workspaceFolders;
  if (!ws || !ws.length) return;
  
  const rootUri = ws[0].uri;
  
  await installPrompts(context, rootUri);
  await installAgents(context, rootUri);
  await installProtected(context, rootUri);
  
  vscode.window.showInformationMessage('✓ AI Skeleton components updated (your customizations preserved).');
}
