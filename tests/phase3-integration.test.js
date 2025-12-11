// phase3-integration.test.js
// Integration tests for Phase 3: Smart Context Management

const RelevanceScorer = require('../dist/src/relevanceScorer').default;
const TokenCounterService = require('../dist/src/tokenCounterService').default;
const ContextFormatter = require('../dist/src/contextFormatter').default;

describe('Phase 3: Smart Context Management Integration', () => {
  let scorer;
  let mockEntries;

  beforeEach(() => {
    scorer = RelevanceScorer;
    
    // Mock memory entries with test data
    mockEntries = [
      {
        file_type: 'CONTEXT',
        timestamp: new Date().toISOString(),
        tag: '[CONTEXT:2025-12-06]',
        content: 'Recent context about token implementation and budget tracking'
      },
      {
        file_type: 'DECISION',
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        tag: '[DECISION:2025-12-01]',
        content: 'Decision to use Anthropic API for token counting'
      },
      {
        file_type: 'PATTERN',
        timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        tag: '[PATTERN:2025-11-26]',
        content: 'Pattern for context selection using greedy algorithm'
      },
      {
        file_type: 'BRIEF',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        tag: '[BRIEF:2025-12-05]',
        content: 'Project brief: context window optimization for token efficiency'
      },
      {
        file_type: 'PROGRESS',
        timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        tag: '[PROGRESS:2025-11-16]',
        content: 'Phase 3 implementation: relevance scoring complete'
      }
    ];
  });

  describe('scoring and ranking consistency', () => {
    it('should score same entry consistently', () => {
      const entry = mockEntries[0];
      const score1 = scorer.scoreEntry(entry, 'token');
      const score2 = scorer.scoreEntry(entry, 'token');

      expect(score1.finalScore).toBe(score2.finalScore);
    });

    it('should rank all entries without errors', () => {
      const scored = scorer.scoreEntries(mockEntries, 'context implementation');
      const ranked = scorer.rankEntries(scored);

      expect(ranked.length).toBe(scored.length);
      expect(ranked[0].finalScore).toBeGreaterThanOrEqual(ranked[ranked.length - 1].finalScore);
    });

    it('should filter entries above threshold', () => {
      const scored = scorer.scoreEntries(mockEntries, 'token');
      const filtered = scorer.filterByThreshold(scored, 0.2);

      // All filtered entries should meet threshold
      filtered.forEach(entry => {
        expect(entry.finalScore).toBeGreaterThanOrEqual(0.2);
      });
    });

    it('should extract top N entries correctly', () => {
      const scored = scorer.scoreEntries(mockEntries, 'implementation');
      const top2 = scorer.getTopEntries(scored, 2);

      expect(top2.length).toBeLessThanOrEqual(2);
      if (top2.length >= 2) {
        expect(top2[0].finalScore).toBeGreaterThanOrEqual(top2[1].finalScore);
      }
    });
  });

  describe('performance and scalability', () => {
    it('should handle large entry sets efficiently', () => {
      // Create 500 test entries
      const largeSet = [];
      for (let i = 0; i < 500; i++) {
        largeSet.push({
          file_type: ['CONTEXT', 'DECISION', 'PATTERN', 'BRIEF', 'PROGRESS'][i % 5],
          timestamp: new Date(Date.now() - i * 6 * 60 * 60 * 1000).toISOString(),
          tag: `[TAG:2025-${String(i).padStart(3, '0')}-01]`,
          content: `Entry ${i}: Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua`
        });
      }

      const startTime = Date.now();
      const scored = scorer.scoreEntries(largeSet, 'consectetur adipiscing');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // < 1 second for 500 entries
      expect(scored.length).toBe(500);
    });

    it('should rank large sets efficiently', () => {
      const largeSet = [];
      for (let i = 0; i < 100; i++) {
        largeSet.push({
          file_type: 'CONTEXT',
          timestamp: new Date(Date.now() - i * 12 * 60 * 60 * 1000).toISOString(),
          tag: `[CONTEXT:2025-${String(i).padStart(2, '0')}-01]`,
          content: `Content ${i}`
        });
      }

      const scored = scorer.scoreEntries(largeSet, 'content');
      const startTime = Date.now();
      const ranked = scorer.rankEntries(scored);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500); // < 500ms for ranking
      expect(ranked.length).toBe(100);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty entry list', () => {
      const scored = scorer.scoreEntries([], 'test');
      expect(scored.length).toBe(0);

      const ranked = scorer.rankEntries(scored);
      expect(ranked.length).toBe(0);
    });

    it('should handle entries with missing fields', () => {
      const incomplete = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        // Missing content field
      };

      const result = scorer.scoreEntry(incomplete, 'test');
      expect(isNaN(result.finalScore)).toBe(false);
    });

    it('should handle very old timestamps', () => {
      const veryOld = {
        file_type: 'CONTEXT',
        timestamp: '2020-01-01T00:00:00Z', // 5+ years ago
        tag: '[CONTEXT:2020-01-01]',
        content: 'Very old content'
      };

      const result = scorer.scoreEntry(veryOld, 'content', {
        includeRecency: true,
        includePriority: false
      });

      expect(result.recencyScore).toBeLessThan(0.5);
      expect(result.finalScore).toBeGreaterThan(0); // Should still be valid
    });

    it('should handle future timestamps', () => {
      const future = {
        file_type: 'CONTEXT',
        timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        tag: '[CONTEXT:2025-12-07]',
        content: 'Future content'
      };

      const result = scorer.scoreEntry(future, 'content', {
        includeRecency: true,
        includePriority: false
      });

      expect(isNaN(result.finalScore)).toBe(false);
    });
  });
});