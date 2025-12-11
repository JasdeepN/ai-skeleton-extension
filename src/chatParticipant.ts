import * as vscode from 'vscode';
import { getMemoryService } from './memoryService';
import { detectKeyword } from './keywordDetector';
import { buildUnifiedToolRegistry, formatAvailabilitySummary } from './toolRegistry';

/**
 * System prompt for the @aiSkeleton chat participant
 * Optimized to FORCE memory tool usage for context-aware responses
 */
const SYSTEM_PROMPT = `You are @aiSkeleton, a memory-aware AI assistant. You MUST use the aiSkeleton_showMemory tool before responding to ANY question about the project.

CRITICAL: You have access to a database with project memory. ALWAYS call aiSkeleton_showMemory FIRST to check for existing context before answering.

Available Memory Tools (USE THESE):
- aiSkeleton_showMemory: ALWAYS call this first to retrieve project context, decisions, patterns, and progress
- aiSkeleton_logDecision: Log important decisions with rationale
- aiSkeleton_updateContext: Update working context when focus shifts
- aiSkeleton_updateProgress: Track task completion (done/doing/next)
- aiSkeleton_updatePatterns: Document patterns and conventions
- aiSkeleton_updateProjectBrief: Update project goals and scope
- aiSkeleton_markDeprecated: Mark outdated entries

REQUIRED WORKFLOW:
1. FIRST: Call aiSkeleton_showMemory to load database contents
2. Read the memory contents returned
3. Then provide your response based on actual project data

DO NOT respond with "no memory found" without actually calling the tool. The database has 100+ entries.

Guidelines:
- Check memory BEFORE answering questions about the project
- Log important decisions via aiSkeleton_logDecision
- Update context when user shifts focus
- Track completed work with aiSkeleton_updateProgress

Key Principles:
- Always verify against memory first—avoid contradicting past decisions
- Use tools proactively
- Provide context-aware responses that reference past decisions and patterns`;

const CONTEXT_WINDOW = 200_000;
const OUTPUT_BUFFER = 20_000; // reserve for model output and safety
const AVAILABILITY_TOKEN_CEILING = 800; // cap for availability header before falling back to counts-only

async function estimateTokens(model: any, text: string): Promise<number> {
  if (!text) return 0;
  try {
    const maybeCountTokens = model?.countTokens;
    if (typeof maybeCountTokens === 'function') {
      const result = await maybeCountTokens([text]);
      if (typeof result === 'number') {
        return result;
      }
      if (result && typeof result.tokenCount === 'number') {
        return result.tokenCount;
      }
    }
  } catch (err) {
    console.warn('[ChatParticipant] countTokens failed, falling back to length estimation:', err);
  }
  // Fallback: rough heuristic (4 chars ≈ 1 token)
  return Math.ceil(text.length / 4);
}

function approximateTokensFromStrings(parts: string[]): number {
  if (!parts.length) return 0;
  const combined = parts.join('\n\n');
  return Math.ceil(combined.length / 4);
}

/**
 * Handler for the @aiSkeleton chat participant
 * Implements tool calling loop: sendRequest → detect ToolCallPart → invokeTool → recurse
 */
const handler: vscode.ChatRequestHandler = async (
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
) => {
  try {
    // Model Selection: Always select a real model via selectChatModels()
    // request.model from chat UI may be "auto" which isn't a valid endpoint
    // We must explicitly select an available model to get a working endpoint
    const models = await vscode.lm.selectChatModels({
      vendor: 'copilot'
    });
    
    if (!models || models.length === 0) {
      stream.markdown(
        '🤖 **No Language Model Available**\n\n' +
        'The @aiSkeleton chat participant requires a language model to be available. ' +
        'Please ensure:\n' +
        '- GitHub Copilot is installed and enabled\n' +
        '- You are signed in to GitHub\n' +
        '- A chat model is available in your VS Code instance'
      );
      return;
    }
    
    // Use the first available Copilot model
    const model = models[0];
    console.log('[ChatParticipant] Using model:', model.id, model.vendor, model.family);

    const cfg = vscode.workspace.getConfiguration('aiSkeleton');
    const priority = cfg.get<'mcp' | 'extension' | 'mixed'>('mcp.priority', 'mcp');
    const restrictions = cfg.get<string[]>('restrictions', []) ?? [];

    const registry = buildUnifiedToolRegistry({ priority, restrictions });
    const tools = registry.allowed.map(entry => entry.tool);
    const toolSourceMap = new Map<string, string>(registry.allowed.map(entry => [entry.name, entry.source]));

    console.log('[ChatParticipant] Tool registry summary:', {
      priority,
      allowed: registry.summary.allowedCount,
      blocked: registry.summary.blockedCount,
      bySource: registry.summary.bySource,
      blockedNames: registry.summary.blockedNames
    });

    if (tools.length === 0) {
      stream.markdown('⚠️ No LM tools available after applying priority/restrictions. Please ensure AI Skeleton and MCP servers are initialized.');
      return;
    }

    // Build availability summary (token-light, trims if large)
    let availabilitySummary = formatAvailabilitySummary(registry.summary, {
      includeBlocked: registry.summary.blockedCount > 0,
      maxNames: 5
    });
    const countsOnlySummary = formatAvailabilitySummary(registry.summary, {
      includeBlocked: registry.summary.blockedCount > 0,
      maxNames: 0
    });

    const summaryTokens = await estimateTokens(model, availabilitySummary);
    if (summaryTokens > AVAILABILITY_TOKEN_CEILING) {
      console.log('[ChatParticipant] Availability summary trimmed to counts-only. Tokens:', summaryTokens);
      availabilitySummary = countsOnlySummary;
    }

    // KEYWORD DETECTION: Check if user input contains trigger words
    // If detected, inject concise summary to guide LM autonomously (context-efficient)
    let systemPrompt = SYSTEM_PROMPT;
    const detectedKeyword = detectKeyword(request.prompt);
    
    if (detectedKeyword) {
      console.log('[ChatParticipant] Keyword detected:', detectedKeyword.keyword, 'prompt:', detectedKeyword.promptKey);
      console.log('[ChatParticipant] Injecting concise summary (~50 tokens) instead of full prompt');
      
      // Inject SUMMARY guidance (50 tokens) instead of full prompt (500+ tokens)
      // This conserves context while still guiding LM autonomously
      systemPrompt = `${SYSTEM_PROMPT}

[${detectedKeyword.promptKey.toUpperCase()} MODE]
${detectedKeyword.summary}`;
      
      console.log('[ChatParticipant] Injected summary for:', detectedKeyword.promptKey);
    }

    // PRE-FETCH MEMORY: Load RELEVANT memory content BEFORE sending to LM
    // Use smart context selection with relevance scoring + token budget
    // This ensures concise, targeted context instead of dumping entire database
    let preloadedMemory = '';
    let contextCoverage = '';
    try {
      console.log('[ChatParticipant] Pre-fetching RELEVANT memory content via smart context selection');
      const memoryService = getMemoryService();
      
      // Step 1: Perform semantic search to find relevant entries
      console.log('[ChatParticipant] Running semantic search on user query');
      const semanticResults = await memoryService.semanticSearch(
        request.prompt, // User query for semantic matching
        15 // Top 15 semantically relevant entries
      );
      console.log('[ChatParticipant] Semantic search found', semanticResults.entries.length, 'relevant entries in', semanticResults.searchTime.toFixed(0), 'ms');
      
      // Log semantic search results for debugging
      if (semanticResults.entries.length > 0) {
        const topMatches = semanticResults.entries.slice(0, 3).map(e => `${e.tag} (score: ${e.score})`).join(', ');
        console.log('[ChatParticipant] Top semantic matches:', topMatches);
      }
      
      // Step 2: Smart context selection with 50K token budget
      // Uses relevance scoring, recency weighting, and priority multipliers
      // Now informed by semantic search results
      const contextResult = await memoryService.selectContextForBudget(
        request.prompt, // User query for relevance matching
        50000, // 50K token budget for context
        {
          minRelevanceThreshold: 0.1, // Include entries with >10% relevance
          maxAgeDays: 90 // Only entries from last 90 days
        }
      );
      
      preloadedMemory = contextResult.formattedContext;
      contextCoverage = contextResult.coverage;
      console.log('[ChatParticipant] Smart context selection:', contextCoverage);
      console.log('[ChatParticipant] Selected context length:', preloadedMemory.length, 'chars');
      console.log('[ChatParticipant] Semantic search + smart context complete');
    } catch (err) {
      console.error('[ChatParticipant] Failed to pre-load memory:', err);
      // Continue without preloaded memory - fallback will still work
    }

    // Build messages array: system prompt (with optional injected guidance) + availability summary + preloaded memory + user query
    const messages: vscode.LanguageModelChatMessage[] = [];
    const messageStrings: string[] = [];

    const systemMessage = vscode.LanguageModelChatMessage.User(`[SYSTEM PROMPT]\n${systemPrompt}`);
    messages.push(systemMessage);
    messageStrings.push(systemPrompt);

    let availabilityMessage: vscode.LanguageModelChatMessage | undefined;
    if (availabilitySummary) {
      availabilityMessage = vscode.LanguageModelChatMessage.User(`[TOOL AVAILABILITY]\n${availabilitySummary}`);
      messages.push(availabilityMessage);
      messageStrings.push(availabilitySummary);
    }
    
    // Include preloaded memory as context if available
    if (preloadedMemory) {
      messages.push(vscode.LanguageModelChatMessage.User(`[CURRENT MEMORY STATE]\n${preloadedMemory}`));
      messageStrings.push(preloadedMemory);
    }
    
    messages.push(vscode.LanguageModelChatMessage.User(request.prompt));
    messageStrings.push(request.prompt);

    // Pre-send budget check: drop availability header if we are close to the context window
    const approxTokens = await estimateTokens(model, messageStrings.join('\n\n'));
    const budgetLimit = CONTEXT_WINDOW - OUTPUT_BUFFER;
    if (approxTokens > budgetLimit && availabilityMessage) {
      console.log('[ChatParticipant] Dropping availability summary to stay within budget. Approx tokens:', approxTokens);
      const idx = messages.indexOf(availabilityMessage);
      if (idx >= 0) {
        messages.splice(idx, 1);
      }
      const msgIdx = messageStrings.indexOf(availabilitySummary);
      if (msgIdx >= 0) {
        messageStrings.splice(msgIdx, 1);
      }
    }

    // Ensure we force at least one memory fetch even if the model does not emit tool calls
    // Note: This is now a secondary fallback since we pre-fetch above
    let forcedMemoryInvocation = preloadedMemory.length > 0;

    // Helper function to run tool calling loop
    const runToolCallingLoop = async (): Promise<void> => {
      // Check for cancellation before making request
      if (token.isCancellationRequested) {
        return;
      }

      console.log('[ChatParticipant] Sending request to model with', tools.length, 'tools available');
      console.log('[ChatParticipant] Available tools:', (tools as any[]).map(t => (t as any).name).join(', '));

      // Send request to LM with available tools
      const response = await model.sendRequest(messages, { tools: tools as any }, token);

      let hasToolCalls = false;

      // Stream response and collect tool calls
      const toolCalls: Array<{ part: vscode.LanguageModelToolCallPart; index: number }> = [];
      let responseIndex = 0;

      for await (const part of response.stream) {
        // Check for cancellation
        if (token.isCancellationRequested) {
          return;
        }

        if (part instanceof vscode.LanguageModelTextPart) {
          // Stream text response directly to user
          console.log('[ChatParticipant] Received text part:', part.value.substring(0, 100) + '...');
          stream.markdown(part.value);
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          // Collect tool calls for processing
          console.log('[ChatParticipant] Received tool call:', part.name, 'source:', toolSourceMap.get(part.name) ?? 'unknown', 'with input:', JSON.stringify(part.input).substring(0, 100));
          hasToolCalls = true;
          toolCalls.push({ part, index: responseIndex });
          responseIndex++;
        }
      }

      console.log('[ChatParticipant] Stream complete. Tool calls detected:', hasToolCalls, 'Count:', toolCalls.length);

      // Process collected tool calls if any
      if (hasToolCalls && toolCalls.length > 0) {
        console.log('[ChatParticipant] Processing', toolCalls.length, 'tool calls');
        // Create assistant message with tool calls
        const assistantMessage = vscode.LanguageModelChatMessage.Assistant(
          toolCalls.map(tc => tc.part)
        );
        messages.push(assistantMessage);

        // Invoke each tool and collect results
        const toolResults: vscode.LanguageModelToolResultPart[] = [];

        for (const { part: toolCall } of toolCalls) {
          try {
            console.log('[ChatParticipant] Invoking tool:', toolCall.name, 'source:', toolSourceMap.get(toolCall.name) ?? 'unknown', 'with callId:', toolCall.callId);
            // Invoke the tool with the provided input
            const toolResult = await vscode.lm.invokeTool(
              toolCall.name,
              {
                input: toolCall.input,
                toolInvocationToken: request.toolInvocationToken
              },
              token
            );

            console.log('[ChatParticipant] Tool result received for', toolCall.name, ':', String(toolResult).substring(0, 100));
            // Create result part with proper tool call ID reference
            // The callId links the result back to the original tool call
            const resultPart = new vscode.LanguageModelToolResultPart(
              toolCall.callId,
              [String(toolResult)]
            );
            toolResults.push(resultPart);
          } catch (err) {
            // Handle individual tool invocation errors gracefully
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('[ChatParticipant] Tool invocation error for', toolCall.name, ':', errorMessage);
            const resultPart = new vscode.LanguageModelToolResultPart(
              toolCall.callId,
              [`Error invoking ${toolCall.name}: ${errorMessage}`]
            );
            toolResults.push(resultPart);
          }
        }

        // Add user message with tool results
        const userMessage = vscode.LanguageModelChatMessage.User(toolResults);
        messages.push(userMessage);

        // Recursively continue the conversation to process tool results
        console.log('[ChatParticipant] Tool results collected. Recursing into tool calling loop for further processing');
        return await runToolCallingLoop();
      } else {
        console.log('[ChatParticipant] No tool calls detected in response. Stream processing complete.');

        // Force a memory load if none occurred to avoid "no memory" answers
        if (!forcedMemoryInvocation) {
          forcedMemoryInvocation = true;
          try {
            console.log('[ChatParticipant] Forcing aiSkeleton_showMemory invocation because model did not request tools');
            const forcedResult = await vscode.lm.invokeTool(
              'aiSkeleton_showMemory',
              {
                input: {},
                toolInvocationToken: request.toolInvocationToken
              },
              token
            );

            // Normalize tool result into plain text
            let forcedText: string;
            if (typeof forcedResult === 'string') {
              forcedText = forcedResult;
            } else if (Array.isArray((forcedResult as any).content)) {
              const parts = (forcedResult as any).content as any[];
              forcedText = parts.map(p => (p as any).value ?? String(p)).join('\n');
            } else {
              forcedText = String(forcedResult);
            }

            // Inject the memory contents into the conversation history
            const forcedMessage = vscode.LanguageModelChatMessage.User(forcedText);
            messages.push(forcedMessage);

            // Re-run the loop so the model can use the injected memory
            return await runToolCallingLoop();
          } catch (err) {
            console.error('[ChatParticipant] Forced aiSkeleton_showMemory invocation failed:', err);
            stream.markdown('⚠️ Failed to load AI-Memory automatically. Please try again or run /memory.');
          }
        }
      }
    };

    // Execute the tool calling loop
    await runToolCallingLoop();
  } catch (err) {
    // Handle errors based on error type
    if (err instanceof vscode.LanguageModelError) {
      // Check the error code string representation
      const errorCodeStr = String(err.code);
      if (errorCodeStr.includes('NoPermissions')) {
        stream.markdown(
          '🔐 **Enable GitHub Copilot**\n\n' +
          '@aiSkeleton requires GitHub Copilot to be enabled. ' +
          'Please sign in with your GitHub account in VS Code to use this feature.'
        );
      } else if (errorCodeStr.includes('Blocked')) {
        stream.markdown(
          '⛔ **Request Blocked**\n\n' +
          'Your request was blocked by GitHub Copilot. This may be due to:\n' +
          '- Quota exceeded for this billing period\n' +
          '- Content filtered by safety policies\n\n' +
          'Please try again later or check your GitHub Copilot settings.'
        );
      } else {
        stream.markdown(
          `❌ **Error**\n\nSomething went wrong. Please try again.`
        );
      }
    } else if (err instanceof Error) {
      stream.markdown(
        `❌ **Error**\n\nFailed to process request: ${err.message}`
      );
    } else if (token.isCancellationRequested) {
      // Silently ignore cancellation
      return;
    } else {
      stream.markdown(
        `❌ **Unexpected Error**\n\nAn unexpected error occurred. Please try again.`
      );
    }

    throw err;
  }
};

/**
 * Create and register the @aiSkeleton chat participant
 * Called during extension activation to make the participant available
 */
export function createChatParticipant(context: vscode.ExtensionContext) {
  // Verify chat API is available
  if (!vscode.chat || !vscode.chat.createChatParticipant) {
    console.error('[ChatParticipant] vscode.chat API not available - this requires VS Code 1.90+');
    return;
  }

  try {
    const participant = vscode.chat.createChatParticipant('aiSkeleton', handler);

    // Set participant display properties
    participant.iconPath = new vscode.ThemeIcon('database');
    
    participant.followupProvider = {
      provideFollowups: async (
        result: vscode.ChatResult,
        _context: vscode.ChatContext,
        _token: vscode.CancellationToken
      ): Promise<vscode.ChatFollowup[]> => {
        // Provide contextual followup suggestions based on conversation
        const followups: vscode.ChatFollowup[] = [];

        // Always suggest memory access
        followups.push({
          prompt: '/memory recent decisions',
          label: '📚 Show Recent Decisions',
          command: 'aiSkeleton.chat.showMemory'
        });

        // Suggest decision logging if not already in response
        if (result.metadata === undefined) {
          followups.push({
            prompt: '/decide',
            label: '📝 Log a Decision',
            command: 'aiSkeleton.chat.logDecision'
          });
        }

        return followups;
      }
    };

    // Optional: Subscribe to feedback for telemetry
    // This could be used to track which tools are most helpful
    participant.onDidReceiveFeedback((feedback: vscode.ChatResultFeedback) => {
      if (feedback.kind === vscode.ChatResultFeedbackKind.Helpful) {
        console.log('[ChatParticipant] User found response helpful');
      } else if (feedback.kind === vscode.ChatResultFeedbackKind.Unhelpful) {
        console.log('[ChatParticipant] User found response unhelpful');
      }
    });

    // Log successful registration
    console.log('[ChatParticipant] @aiSkeleton chat participant registered successfully');

    // Add to context subscriptions for cleanup on deactivation
    context.subscriptions.push(participant);
  } catch (err) {
    console.error('[ChatParticipant] Failed to create chat participant:', err);
  }
}
