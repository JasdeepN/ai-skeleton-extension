// AI-Memory Language Model Tools
// Registers tools with vscode.lm.registerTool() for Copilot agent integration
// Uses VS Code Language Model Tools API (stable in VS Code 1.95+)
// Works in normal VS Code installs via VSIX; EDH (F5) is optional for development

import * as vscode from 'vscode';
import { getMemoryService, MemoryFileName } from './memoryService';

// Helper to log tool invocation with token tracking
async function logToolInvocation(toolName: string, params: any = {}): Promise<void> {
  try {
    const middleware = (global as any).__agentCallMiddleware;
    if (!middleware) {
      console.debug(`[MemoryTools] No agent middleware available for logging tool: ${toolName}`);
      return;
    }
    
    // Create a simple message for this tool invocation
    const toolMessage = `Tool ${toolName} invoked with params: ${JSON.stringify(params).slice(0, 100)}...`;
    await middleware('memory-tool', `System: Tool invocation tracking`, [
      { role: 'user', content: toolMessage }
    ]);
  } catch (err) {
    console.debug(`[MemoryTools] Failed to log tool invocation: ${err}`);
    // Non-fatal - don't block tool execution on middleware errors
  }
}

// Tool parameter interfaces
interface ShowMemoryParams {
  file?: string; // Optional: specific file to read
}

interface LogDecisionParams {
  decision: string;
  rationale: string;
}

interface UpdateContextParams {
  context: string;
}

interface UpdateProgressParams {
  item: string;
  status: 'done' | 'doing' | 'next';
}

interface UpdatePatternsParams {
  pattern: string;
  description: string;
}

interface UpdateBriefParams {
  content: string;
}

interface MarkDeprecatedParams {
  file: string;
  item: string;
  reason: string;
}

// Valid memory files (consolidated to 5)
// File-based memory is deprecated; all operations are now database-backed only.

/**
 * Tool: Show AI-Memory contents
 */
export class ShowMemoryTool implements vscode.LanguageModelTool<ShowMemoryParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ShowMemoryParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Log tool invocation for metrics
    await logToolInvocation('ShowMemory', options.input);
    
    const service = getMemoryService();
    // Note: file parameter is deprecated, we now use showMemory() which includes all data
    const content = await service.showMemory();

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(content)
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ShowMemoryParams>,
    _token: vscode.CancellationToken
  ) {
    const file = options.input.file;
    return {
      invocationMessage: file ? `Reading memory file: ${file}` : 'Reading AI-Memory contents',
    };
  }
}

/**
 * Tool: Log a decision
 */
export class LogDecisionTool implements vscode.LanguageModelTool<LogDecisionParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<LogDecisionParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Log tool invocation for metrics
    await logToolInvocation('LogDecision', options.input);
    
    const service = getMemoryService();
    const { decision, rationale } = options.input;

    const success = await service.logDecision(decision, rationale);
    const message = success
      ? `✓ Decision logged: "${decision}"`
      : `✗ Failed to log decision. AI-Memory may not be initialized.`;

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(message)
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<LogDecisionParams>,
    _token: vscode.CancellationToken
  ) {
    return {
      invocationMessage: `Logging decision: ${options.input.decision.slice(0, 50)}...`,
      confirmationMessages: {
        title: 'Log Decision to AI-Memory',
        message: new vscode.MarkdownString(
          `Log this decision?\n\n**Decision:** ${options.input.decision}\n\n**Rationale:** ${options.input.rationale}`
        ),
      },
    };
  }
}

/**
 * Tool: Update active context
 */
export class UpdateContextTool implements vscode.LanguageModelTool<UpdateContextParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<UpdateContextParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Log tool invocation for metrics
    await logToolInvocation('UpdateContext', options.input);
    
    const service = getMemoryService();
    const { context } = options.input;

    const success = await service.updateContext(context);
    const message = success
      ? `✓ Context updated`
      : `✗ Failed to update context. AI-Memory may not be initialized.`;

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(message)
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<UpdateContextParams>,
    _token: vscode.CancellationToken
  ) {
    return {
      invocationMessage: 'Updating active context',
    };
  }
}

/**
 * Tool: Update progress
 */
export class UpdateProgressTool implements vscode.LanguageModelTool<UpdateProgressParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<UpdateProgressParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Log tool invocation for metrics
    await logToolInvocation('UpdateProgress', options.input);
    
    const service = getMemoryService();
    const { item, status } = options.input;

    const success = await service.updateProgress(item, status);
    const message = success
      ? `✓ Progress updated: ${item} → ${status}`
      : `✗ Failed to update progress. AI-Memory may not be initialized.`;

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(message)
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<UpdateProgressParams>,
    _token: vscode.CancellationToken
  ) {
    return {
      invocationMessage: `Updating progress: ${options.input.item} → ${options.input.status}`,
    };
  }
}

/**
 * Tool: Update system patterns (includes architecture)
 */
export class UpdatePatternsTool implements vscode.LanguageModelTool<UpdatePatternsParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<UpdatePatternsParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Log tool invocation for metrics
    await logToolInvocation('UpdatePatterns', options.input);
    
    const service = getMemoryService();
    const { pattern, description } = options.input;

    const success = await service.updateSystemPatterns(pattern, description);
    const message = success
      ? `✓ Pattern recorded: ${pattern}`
      : `✗ Failed to record pattern. AI-Memory may not be initialized.`;

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(message)
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<UpdatePatternsParams>,
    _token: vscode.CancellationToken
  ) {
    return {
      invocationMessage: `Recording pattern: ${options.input.pattern}`,
    };
  }
}

/**
 * Tool: Update project brief (includes product context)
 */
export class UpdateProjectBriefTool implements vscode.LanguageModelTool<UpdateBriefParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<UpdateBriefParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Log tool invocation for metrics
    await logToolInvocation('UpdateProjectBrief', options.input);
    
    const service = getMemoryService();
    const success = await service.updateProjectBrief(options.input.content);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(success ? '✓ Project brief updated' : '✗ Failed to update project brief')
    ]);
  }

  async prepareInvocation() {
    return { invocationMessage: 'Updating project brief' };
  }
}

/**
 * Tool: Mark item as deprecated (for cleanup without deletion)
 */
export class MarkDeprecatedTool implements vscode.LanguageModelTool<MarkDeprecatedParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<MarkDeprecatedParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Log tool invocation for metrics
    await logToolInvocation('MarkDeprecated', options.input);
    
    const service = getMemoryService();
    const { file, item, reason } = options.input;

    if (!VALID_FILES.includes(file as MemoryFileName)) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Invalid file: ${file}. Valid files: ${VALID_FILES.join(', ')}`)
      ]);
    }

    const success = await service.markDeprecated(file as MemoryFileName, item, reason);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(success 
        ? `✓ Marked as deprecated: ${item}` 
        : '✗ Failed to mark as deprecated')
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<MarkDeprecatedParams>,
    _token: vscode.CancellationToken
  ) {
    return {
      invocationMessage: `Marking deprecated: ${options.input.item}`,
      confirmationMessages: {
        title: 'Mark as Deprecated',
        message: new vscode.MarkdownString(
          `Mark this item as deprecated?\n\n**Item:** ${options.input.item}\n\n**Reason:** ${options.input.reason}`
        ),
      },
    };
  }
}

/**
 * Register all memory tools with the Language Model API
 * Uses stable VS Code LM Tools API (available since VS Code 1.95+)
 */
export function registerMemoryTools(context: vscode.ExtensionContext): void {
  // Check if lm.registerTool is available (requires VS Code 1.95+)
  if (typeof vscode.lm?.registerTool !== 'function') {
    console.warn('[AI Skeleton] vscode.lm.registerTool is not available.');
    console.warn('[AI Skeleton] Please ensure you are running VS Code 1.95 or later.');
    void vscode.window.showWarningMessage(
      'AI Skeleton: Language Model Tools API requires VS Code 1.95+. Please update VS Code.',
      'Check Version'
    ).then(action => {
      if (action === 'Check Version') {
        vscode.commands.executeCommand('workbench.action.showAboutDialog');
      }
    });
    return;
  }

  try {
    context.subscriptions.push(
      vscode.lm.registerTool('aiSkeleton_showMemory', new ShowMemoryTool()),
      vscode.lm.registerTool('aiSkeleton_logDecision', new LogDecisionTool()),
      vscode.lm.registerTool('aiSkeleton_updateContext', new UpdateContextTool()),
      vscode.lm.registerTool('aiSkeleton_updateProgress', new UpdateProgressTool()),
      vscode.lm.registerTool('aiSkeleton_updatePatterns', new UpdatePatternsTool()),
      vscode.lm.registerTool('aiSkeleton_updateProjectBrief', new UpdateProjectBriefTool()),
      vscode.lm.registerTool('aiSkeleton_markDeprecated', new MarkDeprecatedTool())
    );
    console.log('[AI Skeleton] Memory tools registered successfully (7 LM tools)');
  } catch (err) {
    console.error('[AI Skeleton] Failed to register memory tools:', err);
    void vscode.window.showErrorMessage(`AI Skeleton: Failed to register memory tools: ${err}`);
  }
}
