// AI-Memory Language Model Tools
// Registers tools with vscode.lm.registerTool() for Copilot agent integration
// Uses VS Code Language Model Tools API (stable in VS Code 1.95+)
// Works in normal VS Code installs via VSIX; EDH (F5) is optional for development

import * as vscode from 'vscode';
import { getMemoryService } from './memoryService';
import { getMemoryStore } from './memoryStore';
import { detectPhase } from './phaseDetector';
import { synthesizeResearchReport, synthesizePlanReport, synthesizeExecutionReport } from './reportSynthesizer';

/**
 * Generic wrapper for memory tools to eliminate boilerplate
 * Handles token counting, metrics logging, and phase detection
 */
function createMemoryTool<T extends Record<string, any>>(
  name: string,
  operationName: string,
  handler: (input: T, service: ReturnType<typeof getMemoryService>) => Promise<boolean>,
  prepareFn?: (input: T) => Omit<vscode.PreparedToolInvocation, 'parameters'>
): vscode.LanguageModelTool<T> {
  return {
    async invoke(
      options: vscode.LanguageModelToolInvocationOptions<T>,
      _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
      // Count input tokens
      const inputTokens = await options.tokenizationOptions?.countTokens(JSON.stringify(options.input)) ?? 0;
      
      const service = getMemoryService();
      const success = await handler(options.input, service);
      
      const message = success
        ? `✓ ${name} completed`
        : `✗ Failed to ${operationName}. AI-Memory may not be initialized.`;

      // Count output tokens
      const outputTokens = await options.tokenizationOptions?.countTokens(message) ?? 0;
      
      // Log metrics asynchronously (non-blocking)
      void getMemoryStore().logTokenMetric({
        timestamp: new Date().toISOString(),
        model: 'unknown',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        operation: operationName,
        context_status: 'healthy'
      });

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(message)
      ]);
    },

    prepareInvocation(
      options: vscode.LanguageModelToolInvocationPrepareOptions<T>,
      _token: vscode.CancellationToken
    ) {
      if (prepareFn) {
        return { 
          ...prepareFn(options.input),
          parameters: options.input 
        };
      }
      return { invocationMessage: `${name}...`, parameters: options.input };
    }
  };
}

// Tool parameter interfaces
interface ShowMemoryParams {
  query?: string;
  limit?: number;
}

interface LogDecisionParams {
  decision: string;
  rationale: string;
  metadata?: {
    progress?: 'done' | 'in-progress' | 'draft' | 'deprecated';
    targets?: ('ui' | 'db' | 'refactor' | 'tests' | 'docs' | 'perf' | 'integration' | 'infra')[];
    phase?: 'research' | 'planning' | 'execution' | 'checkpoint';
  };
}

interface UpdateContextParams {
  context: string;
  metadata?: {
    progress?: 'done' | 'in-progress' | 'draft' | 'deprecated';
    targets?: ('ui' | 'db' | 'refactor' | 'tests' | 'docs' | 'perf' | 'integration' | 'infra')[];
    phase?: 'research' | 'planning' | 'execution' | 'checkpoint';
  };
}

interface UpdateProgressParams {
  item: string;
  status: 'done' | 'doing' | 'next';
  metadata?: {
    progress?: 'done' | 'in-progress' | 'draft' | 'deprecated';
    targets?: ('ui' | 'db' | 'refactor' | 'tests' | 'docs' | 'perf' | 'integration' | 'infra')[];
    phase?: 'research' | 'planning' | 'execution' | 'checkpoint';
  };
}

interface UpdatePatternsParams {
  pattern: string;
  description: string;
  metadata?: {
    progress?: 'done' | 'in-progress' | 'draft' | 'deprecated';
    targets?: ('ui' | 'db' | 'refactor' | 'tests' | 'docs' | 'perf' | 'integration' | 'infra')[];
    phase?: 'research' | 'planning' | 'execution' | 'checkpoint';
  };
}

interface UpdateBriefParams {
  content: string;
  metadata?: {
    progress?: 'done' | 'in-progress' | 'draft' | 'deprecated';
    targets?: ('ui' | 'db' | 'refactor' | 'tests' | 'docs' | 'perf' | 'integration' | 'infra')[];
    phase?: 'research' | 'planning' | 'execution' | 'checkpoint';
  };
}

interface SaveResearchParams {
  content?: string;  // Optional - will be auto-synthesized if not provided
  metadata?: {
    progress?: 'done' | 'in-progress' | 'draft' | 'deprecated';
    targets?: ('ui' | 'db' | 'refactor' | 'tests' | 'docs' | 'perf' | 'integration' | 'infra')[];
    phase?: 'research' | 'planning' | 'execution' | 'checkpoint';
  };
}

interface SavePlanParams {
  content?: string;  // Optional - will be auto-synthesized if not provided
  metadata?: {
    progress?: 'done' | 'in-progress' | 'draft' | 'deprecated';
    targets?: ('ui' | 'db' | 'refactor' | 'tests' | 'docs' | 'perf' | 'integration' | 'infra')[];
    phase?: 'research' | 'planning' | 'execution' | 'checkpoint';
  };
}

interface SaveExecutionParams {
  content?: string;  // Optional - will be auto-synthesized if not provided
  metadata?: {
    progress?: 'done' | 'in-progress' | 'draft' | 'deprecated';
    targets?: ('ui' | 'db' | 'refactor' | 'tests' | 'docs' | 'perf' | 'integration' | 'infra')[];
    phase?: 'research' | 'planning' | 'execution' | 'checkpoint';
  };
}

interface MarkDeprecatedParams {
  file: string; // Accepts: context, decision, progress, patterns, brief (no .md extension)
  item: string;
  reason: string;
}

interface EditEntryParams {
  id: number;
  updates: {
    content?: string;
    tag?: string;
    phase?: 'research' | 'planning' | 'execution' | 'checkpoint';
    progress_status?: 'done' | 'in-progress' | 'draft' | 'deprecated';
  };
}

interface AppendToEntryParams {
  id: number;
  additionalContent: string;
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
    // Count input tokens (ignore any file parameter to guarantee DB-only reads)
    const sanitizedInput = { query: options.input?.query ?? '', limit: options.input?.limit ?? undefined };
    const inputTokens = await options.tokenizationOptions?.countTokens(JSON.stringify(sanitizedInput)) ?? 0;
    
    const service = getMemoryService();
    
    // CRITICAL FIX: Use smart context selection instead of returning entire database
    // Reserve 50K tokens for memory context within 200K total budget
    const tokenBudget = 50000;
    
    let content: string;
    const query = options.input?.query ?? 'recent relevant entries';
    const limit = options.input?.limit ?? undefined;
    
    try {
      // Use selectContextForBudget() for intelligent filtering
      const selection = await service.selectContextForBudget(query, tokenBudget, {
        useSemanticSearch: true, // Enable semantic search blending
      });
      
      // Format selected entries with coverage stats
      const selectedCount = selection.entries.length;
      const totalCount = (await getMemoryStore().getEntryCounts());
      const totalEntries = Object.values(totalCount).reduce((a, b) => a + b, 0);
      
      // Build response: selected entries + coverage stats + search results
      let response = `[MEMORY SELECTION: SMART FILTERED]

Selected: ${selectedCount} / ${totalEntries} entries (${selection.coverage})
Token Budget: ${selection.tokensUsed} / ${tokenBudget} tokens used

---

## Selected Entries

${selection.formattedContext}`;

      // If query provided and semantic search enabled, include semantic matches
      if (options.input?.query && limit === undefined) {
        try {
          const semantic = await service.semanticSearch(options.input.query, 5);
          if (semantic.entries.length > 0) {
            const formatted = semantic.entries
              .map(e => `- ${e.tag || e.file_type} (score: ${e.score ?? 'n/a'})\n${(e.content || '').slice(0, 200)}\n`)
              .join('\n');
            response += `\n\n---\n\n[SEMANTIC MATCHES]\nQuery: ${options.input.query}\nTop ${semantic.entries.length} results:\n${formatted}`;
          }
        } catch (err) {
          // Silent fail - semantic search optional
        }
      }
      
      content = response;
    } catch (err) {
      // Fallback: show basic memory structure if selection fails
      console.error('[ShowMemoryTool] selectContextForBudget failed:', err);
      content = await service.showMemory();
    }

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
    // Explicitly ignore file param to avoid any markdown access
    return {
      invocationMessage: 'Reading AI-Memory (smart filtered context selection)',
    };
  }
}

/**
 * Tool: Log a decision
 */
export const LogDecisionTool = createMemoryTool<LogDecisionParams>(
  'Decision logged',
  'logDecision',
  async (input, service) => {
    const { decision, rationale } = input;
    const detectedPhase = input.metadata?.phase || (await detectPhase());
    const metadata = detectedPhase ? { phase: detectedPhase } : undefined;
    return service.logDecision(decision, rationale, metadata);
  },
  (input) => ({
    invocationMessage: `Logging decision: ${input.decision.slice(0, 50)}...`,
    confirmationMessages: {
      title: 'Log Decision to AI-Memory',
      message: new vscode.MarkdownString(
        `Log this decision?\n\n**Decision:** ${input.decision}\n\n**Rationale:** ${input.rationale}`
      ),
    },
  })
);

/**
 * Tool: Update active context
 */
export const UpdateContextTool = createMemoryTool<UpdateContextParams>(
  'Context updated',
  'updateContext',
  async (input, service) => {
    const { context } = input;
    const detectedPhase = input.metadata?.phase || (await detectPhase());
    const phase = (detectedPhase && detectedPhase !== 'checkpoint') ? detectedPhase : undefined;
    return service.updateContext(context, phase);
  },
  () => ({
    invocationMessage: 'Updating active context',
  })
);

/**
 * Tool: Update progress
 */
export const UpdateProgressTool = createMemoryTool<UpdateProgressParams>(
  'Progress updated',
  'updateProgress',
  async (input, service) => {
    const { item, status } = input;
    const detectedPhase = input.metadata?.phase || (await detectPhase());
    const phase = (detectedPhase && detectedPhase !== 'checkpoint') ? detectedPhase : undefined;
    return service.updateProgress(item, status, phase);
  },
  (input) => ({
    invocationMessage: `Updating progress: ${input.item} → ${input.status}`,
  })
);

/**
 * Tool: Update system patterns (includes architecture)
 */
export const UpdatePatternsTool = createMemoryTool<UpdatePatternsParams>(
  'Pattern recorded',
  'updatePatterns',
  async (input, service) => {
    const { pattern, description } = input;
    const detectedPhase = input.metadata?.phase || (await detectPhase());
    const phase = (detectedPhase && detectedPhase !== 'checkpoint') ? detectedPhase : undefined;
    return service.updateSystemPatterns(pattern, description, phase);
  },
  (input) => ({
    invocationMessage: `Recording pattern: ${input.pattern}`,
  })
);

/**
 * Tool: Update project brief (includes product context)
 */
export const UpdateProjectBriefTool = createMemoryTool<UpdateBriefParams>(
  'Project brief updated',
  'updateProjectBrief',
  async (input, service) => {
    const detectedPhase = input.metadata?.phase || (await detectPhase());
    const phase = (detectedPhase && detectedPhase !== 'checkpoint') ? detectedPhase : undefined;
    return service.updateProjectBrief(input.content, phase);
  },
  () => ({
    invocationMessage: 'Updating project brief',
  })
);

/**
 * Tool: Save research findings (from Think.prompt.md workflow)
 * Saves to RESEARCH_REPORT type
 * 
 * SMART: If no content provided, auto-synthesizes report from recent decisions/context
 */
export const SaveResearchTool = createMemoryTool<SaveResearchParams>(
  'Research saved',
  'saveResearch',
  async (input, service) => {
    let content = input.content;
    
    // If no content provided, auto-synthesize from memory context
    if (!content || content.trim().length === 0) {
      try {
        const report = await synthesizeResearchReport({ reportType: 'research' });
        content = report.content;
        console.log('[SaveResearchTool] Auto-synthesized report from', report.sourceCount, 'memory entries');
      } catch (err) {
        console.error('[SaveResearchTool] Failed to auto-synthesize, falling back to empty report:', err);
        content = 'Research findings (auto-generated - no memory entries found)';
      }
    }
    
    const detectedPhase = input.metadata?.phase || (await detectPhase());
    const phase = (detectedPhase && detectedPhase !== 'checkpoint') ? detectedPhase : undefined;
    return service.saveResearch(content, phase);
  },
  () => ({
    invocationMessage: 'Saving research findings (auto-synthesizing from memory)',
  })
);

/**
 * Tool: Save plan (from Plan.prompt.md workflow)
 * Saves to PLAN_REPORT type
 * 
 * SMART: If no content provided, auto-synthesizes report from recent progress/decisions
 */
export const SavePlanTool = createMemoryTool<SavePlanParams>(
  'Plan saved',
  'savePlan',
  async (input, service) => {
    let content = input.content;
    
    // If no content provided, auto-synthesize from memory context
    if (!content || content.trim().length === 0) {
      try {
        const report = await synthesizePlanReport({ reportType: 'plan' });
        content = report.content;
        console.log('[SavePlanTool] Auto-synthesized report from', report.sourceCount, 'memory entries');
      } catch (err) {
        console.error('[SavePlanTool] Failed to auto-synthesize, falling back to empty report:', err);
        content = 'Implementation plan (auto-generated - no memory entries found)';
      }
    }
    
    const detectedPhase = input.metadata?.phase || (await detectPhase());
    const phase = (detectedPhase && detectedPhase !== 'checkpoint') ? detectedPhase : undefined;
    return service.savePlan(content, phase);
  },
  () => ({
    invocationMessage: 'Saving implementation plan (auto-synthesizing from memory)',
  })
);

/**
 * Tool: Save execution summary (from Execute.prompt.md workflow)
 * Saves to EXECUTION_REPORT type
 * 
 * SMART: If no content provided, auto-synthesizes report from recent progress/decisions/context
 */
export const SaveExecutionTool = createMemoryTool<SaveExecutionParams>(
  'Execution summary saved',
  'saveExecution',
  async (input, service) => {
    let content = input.content;
    
    // If no content provided, auto-synthesize from memory context
    if (!content || content.trim().length === 0) {
      try {
        const report = await synthesizeExecutionReport({ reportType: 'execution' });
        content = report.content;
        console.log('[SaveExecutionTool] Auto-synthesized report from', report.sourceCount, 'memory entries');
      } catch (err) {
        console.error('[SaveExecutionTool] Failed to auto-synthesize, falling back to empty report:', err);
        content = 'Execution summary (auto-generated - no memory entries found)';
      }
    }
    
    const detectedPhase = input.metadata?.phase || (await detectPhase());
    const phase = (detectedPhase && detectedPhase !== 'checkpoint') ? detectedPhase : undefined;
    return service.saveExecution(content, phase);
  },
  () => ({
    invocationMessage: 'Saving execution summary (auto-synthesizing from memory)',
  })
);

/**
 * Tool: Edit an existing memory entry
 * Allows correcting, refining, or updating previous entries
 */
export const EditEntryTool = createMemoryTool<EditEntryParams>(
  'Entry edited',
  'editEntry',
  async (input, service) => {
    const { id, updates } = input;
    return service.editEntry(id, updates);
  },
  (input) => ({
    invocationMessage: `Editing memory entry #${input.id}`,
  })
);

/**
 * Tool: Append additional content to an existing entry
 * Useful for adding new discoveries without replacing original content
 */
export const AppendToEntryTool = createMemoryTool<AppendToEntryParams>(
  'Content appended',
  'appendToEntry',
  async (input, service) => {
    const { id, additionalContent } = input;
    return service.appendToEntry(id, additionalContent);
  },
  (input) => ({
    invocationMessage: `Appending to memory entry #${input.id}`,
  })
);

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
      vscode.lm.registerTool('aiSkeleton_logDecision', LogDecisionTool),
      vscode.lm.registerTool('aiSkeleton_updateContext', UpdateContextTool),
      vscode.lm.registerTool('aiSkeleton_updateProgress', UpdateProgressTool),
      vscode.lm.registerTool('aiSkeleton_updatePatterns', UpdatePatternsTool),
      vscode.lm.registerTool('aiSkeleton_updateProjectBrief', UpdateProjectBriefTool),
      vscode.lm.registerTool('aiSkeleton_saveResearch', SaveResearchTool),
      vscode.lm.registerTool('aiSkeleton_savePlan', SavePlanTool),
      vscode.lm.registerTool('aiSkeleton_saveExecution', SaveExecutionTool),
      vscode.lm.registerTool('aiSkeleton_editEntry', EditEntryTool),
      vscode.lm.registerTool('aiSkeleton_appendToEntry', AppendToEntryTool),
      vscode.lm.registerTool('aiSkeleton_markDeprecated', new MarkDeprecatedTool())
    );
    console.log('[AI Skeleton] Memory tools registered successfully (12 LM tools)');
    
    // Show transient notification about tool status
    void vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '✅ AI Skeleton memory tools ready',
      cancellable: false
    }, async (progress) => {
      progress.report({ message: '12 tools registered and active' });
      // Auto-dismiss after 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));
    });
  } catch (err) {
    console.error('[AI Skeleton] Failed to register memory tools:', err);
    void vscode.window.showErrorMessage(`AI Skeleton: Failed to register memory tools: ${err}`);
  }
}
