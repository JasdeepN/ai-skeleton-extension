import * as vscode from 'vscode';
import { getMemoryService } from './memoryService';

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

    // Filter tools to include only ai-skeleton memory tools
    const allTools = vscode.lm.tools;
    
    // Debug: Log ALL tool info including tags
    console.log('[ChatParticipant] ========== TOOL DEBUG START ==========');
    console.log('[ChatParticipant] Total tools registered:', allTools.length);
    for (const tool of allTools) {
      console.log('[ChatParticipant] Tool:', tool.name, 'Tags:', tool.tags?.join(', ') || 'NO TAGS');
    }
    console.log('[ChatParticipant] ========== TOOL DEBUG END ==========');
    
    // Try multiple filter strategies
    const toolsByTag = allTools.filter(t => t.tags?.includes('ai-skeleton'));
    const toolsByName = allTools.filter(t => t.name.startsWith('aiSkeleton_'));
    
    console.log('[ChatParticipant] Tools by tag (ai-skeleton):', toolsByTag.length);
    console.log('[ChatParticipant] Tools by name prefix (aiSkeleton_):', toolsByName.length);
    
    // Use name-based filter as fallback if tags aren't working
    const tools = toolsByTag.length > 0 ? toolsByTag : toolsByName;

    console.log('[ChatParticipant] Tool filtering: total=', allTools.length, 'filtered=', tools.length);
    console.log('[ChatParticipant] All available tools:', allTools.map(t => t.name).join(', '));
    console.log('[ChatParticipant] Filtered tools (ai-skeleton):', tools.map(t => t.name).join(', '));

    if (tools.length === 0) {
      stream.markdown('⚠️ No memory tools available. Please ensure AI Skeleton extension is properly initialized.');
      return;
    }

    // Build messages array: system prompt + user query
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(`[SYSTEM PROMPT]\n${SYSTEM_PROMPT}`),
      vscode.LanguageModelChatMessage.User(request.prompt)
    ];

    // Ensure we force at least one memory fetch even if the model does not emit tool calls
    let forcedMemoryInvocation = false;

    // Helper function to run tool calling loop
    const runToolCallingLoop = async (): Promise<void> => {
      // Check for cancellation before making request
      if (token.isCancellationRequested) {
        return;
      }

      console.log('[ChatParticipant] Sending request to model with', tools.length, 'tools available');
      console.log('[ChatParticipant] Available tools:', tools.map(t => t.name).join(', '));

      // Send request to LM with available tools
      const response = await model.sendRequest(messages, { tools }, token);

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
          console.log('[ChatParticipant] Received tool call:', part.name, 'with input:', JSON.stringify(part.input).substring(0, 100));
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
            console.log('[ChatParticipant] Invoking tool:', toolCall.name, 'with callId:', toolCall.callId);
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
