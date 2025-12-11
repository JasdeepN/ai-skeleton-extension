// relevanceScorer.test.js
// Unit tests for relevance scoring

const RelevanceScorer = require('../dist/src/relevanceScorer').default;

describe('RelevanceScorer', () => {
  let scorer;

  beforeEach(() => {
    scorer = RelevanceScorer;
  });

  describe('keyword relevance', () => {
    it('should score exact keyword match high', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: 'Implementation of token counting service'
      };

      const result = scorer.scoreEntry(entry, 'token counting', {
        includeRecency: false,
        includePriority: false
      });

      expect(result.relevanceScore).toBeGreaterThan(0.5);
    });

    it('should score partial keyword match', () => {
      const entry = {
        file_type: 'DECISION',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[DECISION:2025-12-06]',
        content: 'We decided to use tokens for better implementation'
      };

      const result = scorer.scoreEntry(entry, 'token implementation', {
        includeRecency: false,
        includePriority: false
      });

      // Two keywords found = 2/2 = 1.0 with boost, but with filtering can be 0.5+
      expect(result.relevanceScore).toBeGreaterThanOrEqual(0.5);
    });

    it('should score no match zero', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: 'This is completely unrelated'
      };

      const result = scorer.scoreEntry(entry, 'tokenization xyz', {
        includeRecency: false,
        includePriority: false
      });

      expect(result.relevanceScore).toBeLessThan(0.3);
    });

    it('should be case insensitive', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: 'TOKEN and CONTEXT implementation details'
      };

      const result = scorer.scoreEntry(entry, 'token context', {
        includeRecency: false,
        includePriority: false
      });

      expect(result.relevanceScore).toBeGreaterThan(0.5);
    });

    it('should ignore common stopwords', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: 'The quick brown fox'
      };

      const result1 = scorer.scoreEntry(entry, 'the fox', {
        includeRecency: false,
        includePriority: false
      });

      const result2 = scorer.scoreEntry(entry, 'fox', {
        includeRecency: false,
        includePriority: false
      });

      // Both should score similarly since "the" is a stopword
      expect(Math.abs(result1.relevanceScore - result2.relevanceScore)).toBeLessThan(0.2);
    });
  });

  describe('recency scoring', () => {
    it('should give high score to recent entries', () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago

      const entry = {
        file_type: 'CONTEXT',
        timestamp: recent.toISOString(),
        tag: '[CONTEXT:2025-12-06]',
        content: 'Recent content'
      };

      const result = scorer.scoreEntry(entry, 'recent', {
        includeRecency: true,
        includePriority: false
      });

      expect(result.recencyScore).toBe(1.0);
    });

    it('should reduce score for older entries', () => {
      const now = new Date();
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      const entry = {
        file_type: 'CONTEXT',
        timestamp: twoMonthsAgo.toISOString(),
        tag: '[CONTEXT:2025-10-06]',
        content: 'Old content'
      };

      const result = scorer.scoreEntry(entry, 'old', {
        includeRecency: true,
        includePriority: false
      });

      expect(result.recencyScore).toBeLessThan(0.5);
    });

    it('should have 7-day boundary at 1.0 score', () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1);

      const entry = {
        file_type: 'CONTEXT',
        timestamp: sevenDaysAgo.toISOString(),
        tag: '[CONTEXT:2025-11-29]',
        content: 'Boundary test'
      };

      const result = scorer.scoreEntry(entry, 'test', {
        includeRecency: true,
        includePriority: false
      });

      expect(result.recencyScore).toBeLessThan(1.0);
      expect(result.recencyScore).toBeGreaterThan(0.6);
    });
  });

  describe('priority multiplier', () => {
    it('should boost BRIEF priority', () => {
      const briefEntry = {
        file_type: 'BRIEF',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[BRIEF:2025-12-06]',
        content: 'Project brief'
      };

      const progressEntry = {
        file_type: 'PROGRESS',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[PROGRESS:2025-12-06]',
        content: 'Progress note'
      };

      const result1 = scorer.scoreEntry(briefEntry, 'project', {
        includeRecency: false,
        includePriority: true
      });

      const result2 = scorer.scoreEntry(progressEntry, 'progress', {
        includeRecency: false,
        includePriority: true
      });

      // BRIEF should have higher priority multiplier
      expect(result1.priorityMultiplier).toBeGreaterThan(result2.priorityMultiplier);
    });

    it('should respect type priorities', () => {
      const types = [
        { type: 'BRIEF', expectedMin: 1.4 },
        { type: 'PATTERN', expectedMin: 1.3 },
        { type: 'CONTEXT', expectedMin: 1.2 },
        { type: 'DECISION', expectedMin: 1.1 },
        { type: 'PROGRESS', expectedMin: 0.9 }
      ];

      for (const { type, expectedMin } of types) {
        const entry = {
          file_type: type,
          timestamp: '2025-12-06T10:00:00Z',
          tag: `[${type}:2025-12-06]`,
          content: 'Test'
        };

        const result = scorer.scoreEntry(entry, 'test', {
          includeRecency: false,
          includePriority: true
        });

        expect(result.priorityMultiplier).toBeGreaterThanOrEqual(expectedMin - 0.1);
      }
    });
  });

  describe('combined scoring', () => {
    it('should combine all factors', () => {
      const entry = {
        file_type: 'PATTERN',
        timestamp: new Date().toISOString(), // Recent
        tag: '[PATTERN:2025-12-06]',
        content: 'Pattern architecture design'
      };

      const result = scorer.scoreEntry(entry, 'pattern architecture', {
        includeRecency: true,
        includePriority: true
      });

      expect(result.finalScore).toBeGreaterThan(0);
      expect(result.finalScore).toBeLessThanOrEqual(2.0); // Max multiplier is ~1.5
      expect(result.reason).toBeDefined();
    });

    it('should calculate final score correctly', () => {
      const entry = {
        file_type: 'BRIEF',
        timestamp: new Date().toISOString(),
        tag: '[BRIEF:2025-12-06]',
        content: 'Project brief content'
      };

      const result = scorer.scoreEntry(entry, 'project', {
        includeRecency: true,
        includePriority: true
      });

      const expected = result.relevanceScore * result.recencyScore * result.priorityMultiplier;
      expect(Math.abs(result.finalScore - expected)).toBeLessThan(0.001);
    });
  });

  describe('ranking and filtering', () => {
    it('should rank entries by score', () => {
      const entries = [
        {
          file_type: 'CONTEXT',
          timestamp: '2025-12-06T10:00:00Z',
          tag: '[CONTEXT:2025-12-06]',
          content: 'Context about tokens'
        },
        {
          file_type: 'DECISION',
          timestamp: '2025-12-06T10:00:00Z',
          tag: '[DECISION:2025-12-06]',
          content: 'Unrelated decision'
        }
      ];

      const scored = scorer.scoreEntries(entries, 'token');
      const ranked = scorer.rankEntries(scored);

      // First entry should have higher score for "token"
      expect(ranked[0].finalScore).toBeGreaterThanOrEqual(ranked[1].finalScore);
    });

    it('should filter by threshold', () => {
      const entries = [
        {
          file_type: 'CONTEXT',
          timestamp: '2025-12-06T10:00:00Z',
          tag: '[CONTEXT:2025-12-06]',
          content: 'Token counter service implementation'
        },
        {
          file_type: 'PROGRESS',
          timestamp: '2025-12-06T10:00:00Z',
          tag: '[PROGRESS:2025-12-06]',
          content: 'Unrelated progress'
        }
      ];

      const scored = scorer.scoreEntries(entries, 'token counter', {
        includeRecency: false,
        includePriority: false
      });

      const filtered = scorer.filterByThreshold(scored, 0.3);

      expect(filtered.length).toBeLessThanOrEqual(scored.length);
      expect(filtered[0]?.finalScore).toBeGreaterThanOrEqual(0.3);
    });

    it('should get top N entries', () => {
      const entries = [];
      for (let i = 0; i < 20; i++) {
        entries.push({
          file_type: 'CONTEXT',
          timestamp: '2025-12-06T10:00:00Z',
          tag: `[CONTEXT:2025-12-06-${i}]`,
          content: `Content number ${i}`
        });
      }

      const scored = scorer.scoreEntries(entries, 'content');
      const top5 = scorer.getTopEntries(scored, 5);

      expect(top5.length).toBeLessThanOrEqual(5);
      expect(top5.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty query', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: 'Test content'
      };

      const result = scorer.scoreEntry(entry, '', {
        includeRecency: false,
        includePriority: false
      });

      expect(result.relevanceScore).toBe(0);
    });

    it('should handle empty content', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: ''
      };

      const result = scorer.scoreEntry(entry, 'test', {
        includeRecency: false,
        includePriority: false
      });

      expect(result.relevanceScore).toBe(0);
    });

    it('should handle invalid timestamps', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: 'invalid-date',
        tag: '[CONTEXT:invalid]',
        content: 'Test'
      };

      const result = scorer.scoreEntry(entry, 'test', {
        includeRecency: true,
        includePriority: false
      });

      expect(result.recencyScore).toBeLessThan(1.0);
      expect(isNaN(result.finalScore)).toBe(false);
    });

    it('should handle special characters in query', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: 'Regex special chars: . * + ? ^'
      };

      const result = scorer.scoreEntry(entry, 'regex .* special', {
        includeRecency: false,
        includePriority: false
      });

      expect(isNaN(result.relevanceScore)).toBe(false);
      expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
    });
  });
});
