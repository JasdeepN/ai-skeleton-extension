// Setup Service - Unified installation and smart merge for AI Skeleton components
// Handles: AI-Memory, Prompts, Agents, Protected Files, MCP Configuration

import * as vscode from 'vscode';
import { getPrompts } from './promptStore';
import { getAgents, getProtectedFilesEmbedded } from './agentStore';
import { getAllMemoryTemplates } from './memoryTemplateStore';
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
 * Show unified setup dialog
 */
export async function showSetupDialog(context: vscode.ExtensionContext): Promise<void> {
  const components = await detectMissingComponents(context);
  
  if (components.length === 0) {
    // Everything is installed
    return;
  }
  
  // Check if user disabled setup prompts
  const config = vscode.workspace.getConfiguration('aiSkeleton');
  const showSetup = config.get<boolean>('setup.showPrompt', true);
  if (!showSetup) return;
  
  // Count how many are recommended (picked=true)
  const recommended = components.filter(c => c.picked);
  const optional = components.filter(c => !c.picked);
  
  // Build message
  let message = `AI Skeleton Setup: ${recommended.length} recommended component${recommended.length !== 1 ? 's' : ''} available`;
  if (optional.length > 0) {
    message += ` (+${optional.length} optional)`;
  }
  
  const choice = await vscode.window.showInformationMessage(
    message,
    { modal: false },
    'Install Recommended',
    'Customize...',
    'Skip',
    "Don't Ask Again"
  );
  
  if (choice === 'Install Recommended') {
    await installComponents(context, recommended);
    vscode.window.showInformationMessage(
      `✓ AI Skeleton setup complete! Installed ${recommended.length} component${recommended.length !== 1 ? 's' : ''}.`
    );
  } else if (choice === 'Customize...') {
    const selected = await showComponentPicker(components);
    if (selected && selected.length > 0) {
      await installComponents(context, selected);
      vscode.window.showInformationMessage(
        `✓ AI Skeleton setup complete! Installed ${selected.length} component${selected.length !== 1 ? 's' : ''}.`
      );
    }
  } else if (choice === "Don't Ask Again") {
    await config.update('setup.showPrompt', false, vscode.ConfigurationTarget.Global);
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
  
  for (const prompt of prompts) {
    const filePath = vscode.Uri.joinPath(promptsDir, prompt.filename);
    await smartInstallFile(context, filePath, prompt.content, `prompt:${prompt.id}`);
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
  
  for (const agent of agents) {
    const filePath = vscode.Uri.joinPath(agentsDir, agent.filename);
    await smartInstallFile(context, filePath, agent.content, `agent:${agent.id}`);
  }
}

/**
 * Install protected files
 */
async function installProtected(context: vscode.ExtensionContext, rootUri: vscode.Uri): Promise<void> {
  const protectedFiles = getProtectedFilesEmbedded();
  
  for (const file of protectedFiles) {
    let filePath: vscode.Uri;
    
    // Special handling for different protected files
    if (file.filename === '.copilotignore') {
      filePath = vscode.Uri.joinPath(rootUri, '.copilotignore');
    } else if (file.filename === 'GUARDRAILS.md') {
      filePath = vscode.Uri.joinPath(rootUri, 'GUARDRAILS.md');
    } else if (file.filename === 'PROTECTED_FILES.md') {
      // Install to .github/
      const githubDir = vscode.Uri.joinPath(rootUri, '.github');
      await vscode.workspace.fs.createDirectory(githubDir);
      filePath = vscode.Uri.joinPath(githubDir, 'PROTECTED_FILES.md');
    } else {
      filePath = vscode.Uri.joinPath(rootUri, file.filename);
    }
    
    await smartInstallFile(context, filePath, file.content, `protected:${file.id}`);
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
  
  // MCP is simple config, no smart merge needed
  try {
    await vscode.workspace.fs.stat(mcpPath);
    // File exists, don't overwrite
  } catch {
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
