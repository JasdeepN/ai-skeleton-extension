import * as vscode from 'vscode';
import { getMemoryService } from './memoryService';

/**
 * System prompt for the @aiSkeleton chat participant
 * Optimized to encourage memory tool usage for context-aware responses
 */
const SYSTEM_PROMPT = `You are an AI assistant with access to persistent project memory stored in a database.

Available Memory Tools:
- 📚 Show Memory: Retrieve context, decisions, patterns, or progress from the AI-Memory database
- 📝 Log Decision: Record architectural or technical decisions with rationale for future reference
- 📍 Update Context: Track current focus areas, blockers, and important state changes
- ✅ Update Progress: Log task completion (done), current work (doing), and next steps
- 🏗️ Update Patterns: Document code patterns, conventions, and architectural insights discovered
- 📖 Update Brief: Modify project goals, scope, features, or constraints when they change
- 🗑️ Mark Deprecated: Mark outdated patterns, decisions, or entries as deprecated

Guidelines for Tool Usage:
1. Before answering questions about the project: Check memory for existing context using Show Memory tool
2. When making or suggesting important decisions: Log them via Log Decision tool with clear rationale
3. When user shifts focus: Update Context tool to track the new focus area
4. When work completes: Update Progress tool to record completion
5. When discovering patterns: Update Patterns tool to document for team/future reference
6. When project goals change: Update Brief tool to reflect new reality
7. When information becomes stale: Mark Deprecated tool to remove outdated entries

Key Principles:
- Always verify against memory first—avoid contradicting past decisions
- Help the user maintain clear project state by suggesting memory updates
- Use tools proactively: don't just respond, help track and remember important information
- Provide context-aware responses that reference past decisions and patterns

Respond naturally while leveraging memory to provide consistent, informed guidance.`;

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
    // Model Selection: Auto (intelligent default) with User Override
    // 1. If user selected a specific model in the chat UI: request.model will be set → use it (user override)
    // 2. If no user selection: request.model will be undefined → auto-select best available (default "auto")
    let model = request.model;
    
    if (!model) {
      // Auto mode: intelligently select the best available model
      // VS Code's selectChatModels() returns models in priority order (best first)
      const models = await vscode.lm.selectChatModels();
      
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
      
      // Select the first (best) model from the available list (auto mode)
      model = models[0];
    }

    // Filter tools to include only ai-skeleton memory tools
    const allTools = vscode.lm.tools;
    const tools = allTools.filter(t => t.tags?.includes('ai-skeleton'));

    if (tools.length === 0) {
      stream.markdown('⚠️ No memory tools available. Please ensure AI Skeleton extension is properly initialized.');
      return;
    }

    // Build messages array: system prompt + user query
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
      vscode.LanguageModelChatMessage.User(request.prompt)
    ];

    // Helper function to run tool calling loop
    const runToolCallingLoop = async (): Promise<void> => {
      // Check for cancellation before making request
      if (token.isCancellationRequested) {
        return;
      }

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
          stream.markdown(part.value);
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          // Collect tool calls for processing
          hasToolCalls = true;
          toolCalls.push({ part, index: responseIndex });
          responseIndex++;
        }
      }

      // Process collected tool calls if any
      if (hasToolCalls && toolCalls.length > 0) {
        // Create assistant message with tool calls
        const assistantMessage = vscode.LanguageModelChatMessage.Assistant(
          toolCalls.map(tc => tc.part)
        );
        messages.push(assistantMessage);

        // Invoke each tool and collect results
        const toolResults: vscode.LanguageModelToolResultPart[] = [];

        for (const { part: toolCall } of toolCalls) {
          try {
            // Invoke the tool with the provided input
            const toolResult = await vscode.lm.invokeTool(
              toolCall.name,
              {
                input: toolCall.input,
                toolInvocationToken: request.toolInvocationToken
              },
              token
            );

            // Create result part (input can be string or any)
            const resultPart = new vscode.LanguageModelToolResultPart(
              toolCall.name,
              [String(toolResult)]
            );
            toolResults.push(resultPart);
          } catch (err) {
            // Handle individual tool invocation errors gracefully
            const errorMessage = err instanceof Error ? err.message : String(err);
            const resultPart = new vscode.LanguageModelToolResultPart(
              toolCall.name,
              [`Error invoking ${toolCall.name}: ${errorMessage}`]
            );
            toolResults.push(resultPart);
          }
        }

        // Add user message with tool results
        const userMessage = vscode.LanguageModelChatMessage.User(toolResults);
        messages.push(userMessage);

        // Recursively continue the conversation to process tool results
        return await runToolCallingLoop();
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
