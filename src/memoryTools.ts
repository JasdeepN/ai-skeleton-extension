// AI-Memory Language Model Tools
// Registers tools with vscode.lm.registerTool() for Copilot agent integration
// Uses VS Code Language Model Tools API (stable in VS Code 1.95+)
// Works in normal VS Code installs via VSIX; EDH (F5) is optional for development

import * as vscode from 'vscode';
import { getMemoryService } from './memoryService';
import { getMemoryStore } from './memoryStore';

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

// Memory tools use SQLite backend - no file validation needed

/**
 * Tool: Show AI-Memory contents
 */
export class ShowMemoryTool implements vscode.LanguageModelTool<ShowMemoryParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ShowMemoryParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Count input tokens
    const inputTokens = await options.tokenizationOptions?.countTokens(JSON.stringify(options.input)) ?? 0;
    
    const service = getMemoryService();
    // Note: file parameter is deprecated, we now use showMemory() which includes all data
    const content = await service.showMemory();

    // Count output tokens
    const outputTokens = await options.tokenizationOptions?.countTokens(content) ?? 0;
    
    // Log metrics asynchronously (non-blocking)
    void getMemoryStore().logTokenMetric({
      timestamp: new Date().toISOString(),
      model: 'unknown',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      operation: 'showMemory',
      context_status: 'healthy'
    });

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
    // Count input tokens
    const inputTokens = await options.tokenizationOptions?.countTokens(JSON.stringify(options.input)) ?? 0;
    
    const service = getMemoryService();
    const { decision, rationale } = options.input;

    const success = await service.logDecision(decision, rationale);
    const message = success
      ? `✓ Decision logged: "${decision}"`
      : `✗ Failed to log decision. AI-Memory may not be initialized.`;

    // Count output tokens
    const outputTokens = await options.tokenizationOptions?.countTokens(message) ?? 0;
    
    // Log metrics asynchronously (non-blocking)
    void getMemoryStore().logTokenMetric({
      timestamp: new Date().toISOString(),
      model: 'unknown',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      operation: 'logDecision',
      context_status: 'healthy'
    });

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
    // Count input tokens
    const inputTokens = await options.tokenizationOptions?.countTokens(JSON.stringify(options.input)) ?? 0;
    
    const service = getMemoryService();
    const { context } = options.input;

    const success = await service.updateContext(context);
    const message = success
      ? `✓ Context updated`
      : `✗ Failed to update context. AI-Memory may not be initialized.`;

    // Count output tokens
    const outputTokens = await options.tokenizationOptions?.countTokens(message) ?? 0;
    
    // Log metrics asynchronously (non-blocking)
    void getMemoryStore().logTokenMetric({
      timestamp: new Date().toISOString(),
      model: 'unknown',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      operation: 'updateContext',
      context_status: 'healthy'
    });

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
    // Count input tokens
    const inputTokens = await options.tokenizationOptions?.countTokens(JSON.stringify(options.input)) ?? 0;
    
    const service = getMemoryService();
    const { item, status } = options.input;

    const success = await service.updateProgress(item, status);
    const message = success
      ? `✓ Progress updated: ${item} → ${status}`
      : `✗ Failed to update progress. AI-Memory may not be initialized.`;

    // Count output tokens
    const outputTokens = await options.tokenizationOptions?.countTokens(message) ?? 0;
    
    // Log metrics asynchronously (non-blocking)
    void getMemoryStore().logTokenMetric({
      timestamp: new Date().toISOString(),
      model: 'unknown',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      operation: 'updateProgress',
      context_status: 'healthy'
    });

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
    // Count input tokens
    const inputTokens = await options.tokenizationOptions?.countTokens(JSON.stringify(options.input)) ?? 0;
    
    const service = getMemoryService();
    const { pattern, description } = options.input;

    const success = await service.updateSystemPatterns(pattern, description);
    const message = success
      ? `✓ Pattern recorded: ${pattern}`
      : `✗ Failed to record pattern. AI-Memory may not be initialized.`;

    // Count output tokens
    const outputTokens = await options.tokenizationOptions?.countTokens(message) ?? 0;
    
    // Log metrics asynchronously (non-blocking)
    void getMemoryStore().logTokenMetric({
      timestamp: new Date().toISOString(),
      model: 'unknown',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      operation: 'updatePatterns',
      context_status: 'healthy'
    });

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
    // Count input tokens
    const inputTokens = await options.tokenizationOptions?.countTokens(JSON.stringify(options.input)) ?? 0;
    
    const service = getMemoryService();
    const success = await service.updateProjectBrief(options.input.content);
    const message = success ? '✓ Project brief updated' : '✗ Failed to update project brief';
    
    // Count output tokens
    const outputTokens = await options.tokenizationOptions?.countTokens(message) ?? 0;
    
    // Log metrics asynchronously (non-blocking)
    void getMemoryStore().logTokenMetric({
      timestamp: new Date().toISOString(),
      model: 'unknown',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      operation: 'updateProjectBrief',
      context_status: 'healthy'
    });
    
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(message)
    ]);
  }

  async prepareInvocation() {
    return { invocationMessage: 'Updating project brief' };
  }
}

/**
 * Tool: Mark item as deprecated
 */
export class MarkDeprecatedTool implements vscode.LanguageModelTool<MarkDeprecatedParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<MarkDeprecatedParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Count input tokens
    const inputTokens = await options.tokenizationOptions?.countTokens(JSON.stringify(options.input)) ?? 0;
    
    const service = getMemoryService();
    const { file, item, reason } = options.input;
    const success = await service.markDeprecated(file, item, reason);
    const message = success 
      ? `✓ Marked deprecated in ${file}: ${item}` 
      : `✗ Failed to mark deprecated. AI-Memory may not be initialized.`;
    
    // Count output tokens
    const outputTokens = await options.tokenizationOptions?.countTokens(message) ?? 0;
    
    // Log metrics asynchronously (non-blocking)
    void getMemoryStore().logTokenMetric({
      timestamp: new Date().toISOString(),
      model: 'unknown',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      operation: 'markDeprecated',
      context_status: 'healthy'
    });
    
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(message)
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<MarkDeprecatedParams>,
    _token: vscode.CancellationToken
  ) {
    return {
      invocationMessage: `Marking deprecated in ${options.input.file}: ${options.input.item}`,
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
