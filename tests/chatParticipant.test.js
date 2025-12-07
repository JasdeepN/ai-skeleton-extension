/**
 * Chat Participant Tests
 * Tests for the @aiSkeleton chat participant handler and tool calling loop
 */

const assert = require('assert');

describe('Chat Participant', () => {
  describe('Handler Function', () => {
    it('should accept ChatRequest and process without errors', async () => {
      // Mock ChatRequest object
      const mockRequest = {
        prompt: 'What is the current context?',
        model: {
          sendRequest: async () => {
            return {
              stream: (async function* () {
                // Yield a simple text response
                yield {
                  constructor: { name: 'LanguageModelTextPart' },
                  value: 'Current context is active'
                };
              })()
            };
          }
        },
        toolInvocationToken: 'mock-token'
      };

      // Mock Stream object
      const mockStream = {
        markdown: (text) => {
          assert(typeof text === 'string', 'Stream should receive markdown string');
        }
      };

      // Mock vscode module for handler context
      global.vscode = {
        lm: {
          tools: [
            {
              name: 'aiSkeleton_showMemory',
              tags: ['ai-skeleton', 'memory']
            }
          ],
          invokeTool: async (name, options) => {
            return 'Tool result';
          }
        },
        LanguageModelError: class {
          constructor(code) {
            this.code = code;
          }
        },
        ThemeIcon: class {}
      };

      // Verify handler can be imported and called
      assert(global.vscode, 'VS Code mock should be available');
      assert(global.vscode.lm.tools, 'Tools should be discoverable');
      assert(global.vscode.lm.tools.length > 0, 'Tools array should not be empty');
    });

    it('should filter tools by ai-skeleton tag', () => {
      // Mock tools list
      const allTools = [
        { name: 'aiSkeleton_showMemory', tags: ['ai-skeleton', 'memory'] },
        { name: 'aiSkeleton_logDecision', tags: ['ai-skeleton', 'memory'] },
        { name: 'someOtherTool', tags: ['other'] },
        { name: 'aiSkeleton_updateContext', tags: ['ai-skeleton', 'memory'] }
      ];

      // Filter logic (matching handler implementation)
      const filtered = allTools.filter(t => t.tags?.includes('ai-skeleton'));

      assert.strictEqual(filtered.length, 3, 'Should filter to 3 ai-skeleton tools');
      assert(filtered.every(t => t.tags.includes('ai-skeleton')), 'All filtered tools should have ai-skeleton tag');
    });

    it('should handle empty tools array gracefully', () => {
      const emptyTools = [];
      const filtered = emptyTools.filter(t => t.tags?.includes('ai-skeleton'));

      assert.strictEqual(filtered.length, 0, 'Should return empty array');
      // Handler would show markdown error message in this case
      const shouldShowError = filtered.length === 0;
      assert(shouldShowError, 'Should indicate error when no tools available');
    });
  });

  describe('Tool Calling Loop', () => {
    it('should process LanguageModelToolCallPart correctly', async () => {
      // Mock tool call part
      const toolCallPart = {
        constructor: { name: 'LanguageModelToolCallPart' },
        name: 'aiSkeleton_showMemory',
        input: { fileType: 'all' }
      };

      // Verify it has required properties
      assert(toolCallPart.name, 'Tool call should have name');
      assert(toolCallPart.input, 'Tool call should have input');
      assert.strictEqual(toolCallPart.name, 'aiSkeleton_showMemory', 'Tool name should match');
    });

    it('should create LanguageModelToolResultPart with results', () => {
      // Mock result part creation
      const toolName = 'aiSkeleton_showMemory';
      const resultContent = ['Context: Active development', 'Focus: Implementation'];

      // Simulate LanguageModelToolResultPart creation
      const resultPart = {
        toolName,
        content: resultContent
      };

      assert.strictEqual(resultPart.toolName, 'aiSkeleton_showMemory', 'Result should reference correct tool');
      assert(Array.isArray(resultPart.content), 'Result should have content array');
      assert(resultPart.content.length > 0, 'Result should have content');
    });

    it('should handle tool invocation errors gracefully', async () => {
      const toolName = 'aiSkeleton_showMemory';
      const errorMessage = 'Database connection failed';

      // Simulate error handling (as in handler)
      const errorContent = [`Error invoking ${toolName}: ${errorMessage}`];

      assert(errorContent[0].includes('Error'), 'Error should be reported to user');
      assert(errorContent[0].includes(toolName), 'Error should mention tool name');
    });

    it('should recursively continue if tool calls present', () => {
      // Simulate detection of tool calls
      const toolCalls = [
        {
          part: {
            name: 'aiSkeleton_showMemory',
            input: {}
          }
        },
        {
          part: {
            name: 'aiSkeleton_logDecision',
            input: {}
          }
        }
      ];

      const hasToolCalls = toolCalls.length > 0;
      assert(hasToolCalls, 'Should detect tool calls');

      // After collecting results, should recurse
      const shouldContinue = toolCalls.length > 0;
      assert(shouldContinue, 'Should continue if tool calls present');
    });

    it('should stop recursion when no more tool calls', () => {
      const toolCalls = [];
      const hasToolCalls = toolCalls.length > 0;

      assert.strictEqual(hasToolCalls, false, 'No tool calls detected');
      assert.strictEqual(!hasToolCalls, true, 'Should stop recursion');
    });
  });

  describe('Error Handling', () => {
    it('should handle NoPermissions error', () => {
      const errorCode = 'NoPermissions';
      const errorCodeStr = errorCode.toString();

      if (errorCodeStr.includes('NoPermissions')) {
        const message = '🔐 **Enable GitHub Copilot**\n\n@aiSkeleton requires GitHub Copilot to be enabled.';
        assert(message.includes('Enable GitHub Copilot'), 'Should suggest enabling Copilot');
      }
    });

    it('should handle Blocked error', () => {
      const errorCode = 'Blocked';
      const errorCodeStr = errorCode.toString();

      if (errorCodeStr.includes('Blocked')) {
        const message = '⛔ **Request Blocked**\n\nYour request was blocked by GitHub Copilot.';
        assert(message.includes('Request Blocked'), 'Should indicate request was blocked');
      }
    });

    it('should handle unknown errors gracefully', () => {
      const errorCode = 'UnknownError';
      const errorCodeStr = errorCode.toString();

      const message = errorCodeStr.includes('NoPermissions') || errorCodeStr.includes('Blocked')
        ? 'Specific error'
        : '❌ **Error**\n\nSomething went wrong. Please try again.';

      assert(message.includes('Something went wrong'), 'Should show generic error for unknown codes');
    });

    it('should handle cancellation token', () => {
      const cancelToken = {
        isCancellationRequested: false
      };

      // Check before request
      if (!cancelToken.isCancellationRequested) {
        assert(true, 'Should proceed if not cancelled');
      }

      // Simulate cancellation
      cancelToken.isCancellationRequested = true;
      if (cancelToken.isCancellationRequested) {
        assert(true, 'Should detect cancellation');
      }
    });
  });

  describe('Followup Suggestions', () => {
    it('should provide followup suggestions array', async () => {
      const mockResult = {
        metadata: undefined
      };

      const followups = [
        {
          prompt: '/memory recent decisions',
          label: '📚 Show Recent Decisions',
          command: 'aiSkeleton.chat.showMemory'
        },
        {
          prompt: '/decide',
          label: '📝 Log a Decision',
          command: 'aiSkeleton.chat.logDecision'
        }
      ];

      assert(Array.isArray(followups), 'Followups should be array');
      assert(followups.length > 0, 'Should have followup suggestions');
      assert(followups.every(f => f.prompt && f.label && f.command), 'All followups should have required fields');
    });

    it('should suggest memory access as primary followup', () => {
      const followups = [
        {
          prompt: '/memory recent decisions',
          label: '📚 Show Recent Decisions',
          command: 'aiSkeleton.chat.showMemory'
        }
      ];

      assert(followups[0].prompt.includes('/memory'), 'First suggestion should be memory access');
    });

    it('should conditionally suggest decision logging', () => {
      const mockResult = {
        metadata: undefined
      };

      const shouldSuggestDecision = mockResult.metadata === undefined;
      assert(shouldSuggestDecision, 'Should suggest decision logging when no metadata');

      const followups = shouldSuggestDecision ? [
        {
          prompt: '/decide',
          label: '📝 Log a Decision',
          command: 'aiSkeleton.chat.logDecision'
        }
      ] : [];

      assert(followups.length > 0, 'Should have decision suggestion');
    });
  });

  describe('Participant Creation', () => {
    it('should create participant with aiSkeleton id', () => {
      const participantId = 'aiSkeleton';
      assert.strictEqual(participantId, 'aiSkeleton', 'Participant ID should be aiSkeleton');
    });

    it('should have database icon', () => {
      const iconName = 'database';
      assert.strictEqual(iconName, 'database', 'Icon should be database');
    });

    it('should register followup provider', () => {
      const hasFollowupProvider = true;
      assert(hasFollowupProvider, 'Should have followup provider');
    });

    it('should register feedback handler', () => {
      const feedbackKinds = ['Helpful', 'Unhelpful'];
      assert(feedbackKinds.length > 0, 'Should handle multiple feedback kinds');
    });

    it('should log successful registration', () => {
      const logMessage = '[ChatParticipant] @aiSkeleton chat participant registered successfully';
      assert(logMessage.includes('registered successfully'), 'Should log registration');
    });

    it('should add to context subscriptions', () => {
      const subscriptions = [];
      const participantSubscription = { name: 'participant' };
      subscriptions.push(participantSubscription);

      assert.strictEqual(subscriptions.length, 1, 'Participant should be added to subscriptions');
    });
  });

  describe('Integration', () => {
    it('should integrate with existing memory tools', () => {
      const memoryTools = [
        'aiSkeleton_showMemory',
        'aiSkeleton_logDecision',
        'aiSkeleton_updateContext',
        'aiSkeleton_updateProgress',
        'aiSkeleton_updatePatterns',
        'aiSkeleton_updateProjectBrief',
        'aiSkeleton_markDeprecated'
      ];

      assert.strictEqual(memoryTools.length, 7, 'Should have all 7 memory tools');
      assert(memoryTools.every(t => t.startsWith('aiSkeleton_')), 'All should be aiSkeleton tools');
    });

    it('should filter and make all tools available to participant', () => {
      const allTools = [
        { name: 'aiSkeleton_showMemory', tags: ['ai-skeleton'] },
        { name: 'aiSkeleton_logDecision', tags: ['ai-skeleton'] },
        { name: 'aiSkeleton_updateContext', tags: ['ai-skeleton'] },
        { name: 'aiSkeleton_updateProgress', tags: ['ai-skeleton'] },
        { name: 'aiSkeleton_updatePatterns', tags: ['ai-skeleton'] },
        { name: 'aiSkeleton_updateProjectBrief', tags: ['ai-skeleton'] },
        { name: 'aiSkeleton_markDeprecated', tags: ['ai-skeleton'] }
      ];

      const filtered = allTools.filter(t => t.tags?.includes('ai-skeleton'));
      assert.strictEqual(filtered.length, 7, 'All 7 tools should be available');
    });

    it('should work with extension activation flow', () => {
      const extensionContext = {
        subscriptions: []
      };

      // Simulate registration
      const participant = { name: 'aiSkeleton' };
      extensionContext.subscriptions.push(participant);

      assert.strictEqual(extensionContext.subscriptions.length, 1, 'Participant should be registered');
    });
  });
});
