// tokenCounterService.test.js
// Unit tests for token counting and budget management

const TokenCounterService = require('../dist/src/tokenCounterService').default;

describe('TokenCounterService', () => {
  let service;

  beforeEach(() => {
    service = TokenCounterService;
    service.clearCache();
  });

  describe('countTokens', () => {
    it('should handle simple messages', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello, how are you?' }]
      };

      const result = await service.countTokens(request);

      expect(result).toHaveProperty('inputTokens');
      expect(result).toHaveProperty('cached', false);
      expect(result).toHaveProperty('estimatedOnly');
      expect(result.inputTokens).toBeGreaterThan(0);
    });

    it('should include system prompt in token count', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const result = await service.countTokens(request);

      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toEqual(result.inputTokens);
    });

    it('should count multiple messages', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Follow up' }
        ]
      };

      const result = await service.countTokens(request);

      expect(result.inputTokens).toBeGreaterThan(0);
    });
  });

  describe('caching', () => {
    it('should cache identical requests', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Test message' }]
      };

      const result1 = await service.countTokens(request);
      const result2 = await service.countTokens(request);

      expect(result2.cached).toBe(true);
      expect(result1.inputTokens).toBe(result2.inputTokens);
    });

    it('should respect cache TTL', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Cached test' }]
      };

      const result1 = await service.countTokens(request);
      expect(result1.cached).toBe(false);

      // Should still be cached immediately
      const result2 = await service.countTokens(request);
      expect(result2.cached).toBe(true);
    });

    it('should clear cache', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Clear test' }]
      };

      await service.countTokens(request);
      service.clearCache();

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should report cache statistics', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Stats test' }]
      };

      await service.countTokens(request);

      const stats = service.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('ttlMs');
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBeGreaterThan(0);
    });
  });

  describe('offline fallback', () => {
    it('should estimate tokens using js-tiktoken', async () => {
      // All requests fall back to js-tiktoken since ANTHROPIC_API_KEY is not set in tests
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Offline test message' }]
      };

      const result = await service.countTokens(request);

      expect(result.inputTokens).toBeGreaterThan(0);
      // Should be marked as estimated when no API key
      expect(result.estimatedOnly).toBe(true);
    });

    it('should handle different model types', async () => {
      const models = [
        'claude-3-5-sonnet-20241022',
        'gpt-4',
        'gpt-3.5-turbo',
        'unknown-model'
      ];

      for (const model of models) {
        const request = {
          model,
          messages: [{ role: 'user', content: 'Test' }]
        };

        const result = await service.countTokens(request);
        expect(result.inputTokens).toBeGreaterThan(0);
      }
    });

    it('should handle fallback when encoding fails', async () => {
      const request = {
        model: 'unknown-model-xyz',
        messages: [{ role: 'user', content: 'This is a test message for fallback' }]
      };

      const result = await service.countTokens(request);

      // Should have some estimate even if encoding unknown
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.estimatedOnly).toBe(true);
    });
  });

  describe('context budget', () => {
    it('should calculate healthy budget', () => {
      const budget = service.getContextBudget(50000); // 50K used out of 160K available

      expect(budget.total).toBe(160000); // 200K - 40K (20% output)
      expect(budget.used).toBe(50000);
      expect(budget.remaining).toBe(110000);
      expect(budget.percentUsed).toBeLessThan(100);
      expect(budget.status).toBe('healthy');
      expect(budget.recommendations).toEqual(['Continue adding context as needed']);
    });

    it('should calculate warning budget', () => {
      const budget = service.getContextBudget(130000); // 130K used out of 160K available

      expect(budget.status).toBe('warning');
      expect(budget.remaining).toBeLessThan(50000);
      expect(budget.remaining).toBeGreaterThan(10000);
      expect(budget.recommendations.length).toBeGreaterThan(0);
    });

    it('should calculate critical budget', () => {
      const budget = service.getContextBudget(155000); // 155K used out of 160K available

      expect(budget.status).toBe('critical');
      expect(budget.remaining).toBeLessThan(10000);
      expect(budget.recommendations.length).toBeGreaterThan(0);
      expect(budget.recommendations[1]).toContain('new chat');
    });

    it('should handle zero tokens', () => {
      const budget = service.getContextBudget(0);

      expect(budget.used).toBe(0);
      expect(budget.remaining).toBe(160000);
      expect(budget.status).toBe('healthy');
    });

    it('should cap percentage at 100%', () => {
      const budget = service.getContextBudget(200000); // More than available

      expect(budget.percentUsed).toBeLessThanOrEqual(100);
      expect(budget.remaining).toBe(0);
    });

    it('should support custom context window', () => {
      const budget = service.getContextBudget(50000, 100000); // 100K window

      const outputBuffer = 100000 * 0.20;
      const availableInput = 100000 - outputBuffer;
      
      expect(budget.total).toBe(availableInput);
      expect(budget.used).toBe(50000);
    });
  });

  describe('metrics', () => {
    it('should accumulate metrics', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Metrics test 1' }]
      };

      await service.countTokens(request);

      const metrics = service.getMetrics();
      expect(metrics).toHaveProperty('buffered');
      expect(metrics).toHaveProperty('maxBufferSize');
      expect(metrics.buffered).toBeGreaterThan(0);
    });

    it('should provide last metrics', async () => {
      service.clearCache(); // Clear to reset metrics if needed
      
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Last metrics test' }]
      };

      await service.countTokens(request);

      const metrics = service.getMetrics();
      expect(metrics.lastMetrics).toBeDefined();
      expect(Array.isArray(metrics.lastMetrics)).toBe(true);
    });
  });

  describe('token count accuracy', () => {
    it('should estimate reasonable token counts', async () => {
      const request = {
        model: 'gpt-4',
        systemPrompt: 'You are a helpful assistant.',
        messages: [
          { role: 'user', content: 'The quick brown fox jumps over the lazy dog.' },
          { role: 'assistant', content: 'This is a response.' }
        ]
      };

      const result = await service.countTokens(request);

      // Token estimates should be roughly 1 token per 4 characters as a rough guideline
      // This is a very loose check
      const totalChars = (request.systemPrompt?.length ?? 0) + 
        request.messages.reduce((sum, m) => sum + m.content.length, 0);
      const estimatedTokens = Math.ceil(totalChars / 4);
      
      // Should be within a reasonable range (offline estimation varies)
      expect(result.inputTokens).toBeGreaterThan(estimatedTokens * 0.5);
      expect(result.inputTokens).toBeLessThan(estimatedTokens * 2);
    });
  });
});
