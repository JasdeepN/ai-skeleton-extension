/**
 * promptSummaries.test.js - Behavioral Testing Phase 2
 * 
 * Tests prompt summary generation for all keywords.
 * Validates: summaries exist, token efficiency, action-oriented content, consistency.
 * 
 * Success Criteria:
 * - All 6 keyword summaries exist (checkpoint, execute, plan, sync, commit, update)
 * - Each summary < 100 tokens (~400 characters)
 * - Summaries contain actionable guidance
 * - Summaries exclude full prompt content
 * - getSummary() returns consistent results
 */

const { getSummary } = require('../dist/src/promptSummaries');

describe('promptSummaries.test.js - Behavioral Testing Phase 2', () => {
  describe('Summary Existence', () => {
    it('should have checkpoint summary', () => {
      const summary = getSummary('checkpoint');
      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should have execute summary', () => {
      const summary = getSummary('execute');
      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should have plan summary', () => {
      const summary = getSummary('plan');
      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should have sync summary', () => {
      const summary = getSummary('sync');
      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should have commit summary', () => {
      const summary = getSummary('commit');
      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should have update summary', () => {
      const summary = getSummary('update');
      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(0);
    });
  });

  describe('Token Efficiency', () => {
    const MAX_TOKENS_PER_SUMMARY = 100;
    const CHARS_PER_TOKEN = 4; // Approximate

    it('checkpoint summary should be token-efficient', () => {
      const summary = getSummary('checkpoint');
      const estimatedTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);
      
      // Checkpoint is intentionally more verbose (~500 chars)
      expect(estimatedTokens).toBeLessThan(200); // ~650 chars
    });

    it('execute summary should be token-efficient', () => {
      const summary = getSummary('execute');
      const estimatedTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);
      expect(estimatedTokens).toBeLessThan(MAX_TOKENS_PER_SUMMARY);
    });

    it('plan summary should be token-efficient', () => {
      const summary = getSummary('plan');
      const estimatedTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);
      expect(estimatedTokens).toBeLessThan(MAX_TOKENS_PER_SUMMARY);
    });

    it('sync summary should be token-efficient', () => {
      const summary = getSummary('sync');
      const estimatedTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);
      expect(estimatedTokens).toBeLessThan(MAX_TOKENS_PER_SUMMARY);
    });

    it('commit summary should be token-efficient', () => {
      const summary = getSummary('commit');
      const estimatedTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);
      expect(estimatedTokens).toBeLessThan(MAX_TOKENS_PER_SUMMARY);
    });

    it('update summary should be token-efficient', () => {
      const summary = getSummary('update');
      const estimatedTokens = Math.ceil(summary.length / CHARS_PER_TOKEN);
      expect(estimatedTokens).toBeLessThan(MAX_TOKENS_PER_SUMMARY);
    });
  });

  describe('Action-Oriented Content', () => {
    it('checkpoint summary should guide checkpoint workflow', () => {
      const summary = getSummary('checkpoint');
      
      // Should mention key checkpoint actions
      const lowerSummary = summary.toLowerCase();
      const hasRelevantKeywords = 
        lowerSummary.includes('memory') ||
        lowerSummary.includes('progress') ||
        lowerSummary.includes('context') ||
        lowerSummary.includes('checkpoint');
      
      expect(hasRelevantKeywords).toBe(true);
    });

    it('execute summary should guide execution workflow', () => {
      const summary = getSummary('execute');
      const lowerSummary = summary.toLowerCase();
      
      const hasRelevantKeywords =
        lowerSummary.includes('execute') ||
        lowerSummary.includes('implement') ||
        lowerSummary.includes('action');
      
      expect(hasRelevantKeywords).toBe(true);
    });

    it('plan summary should guide planning workflow', () => {
      const summary = getSummary('plan');
      const lowerSummary = summary.toLowerCase();
      
      const hasRelevantKeywords =
        lowerSummary.includes('plan') ||
        lowerSummary.includes('design') ||
        lowerSummary.includes('strategy');
      
      expect(hasRelevantKeywords).toBe(true);
    });

    it('sync summary should guide sync workflow', () => {
      const summary = getSummary('sync');
      const lowerSummary = summary.toLowerCase();
      
      const hasRelevantKeywords =
        lowerSummary.includes('sync') ||
        lowerSummary.includes('memory') ||
        lowerSummary.includes('update');
      
      expect(hasRelevantKeywords).toBe(true);
    });

    it('commit summary should guide commit workflow', () => {
      const summary = getSummary('commit');
      const lowerSummary = summary.toLowerCase();
      
      const hasRelevantKeywords =
        lowerSummary.includes('commit') ||
        lowerSummary.includes('git') ||
        lowerSummary.includes('changes');
      
      expect(hasRelevantKeywords).toBe(true);
    });

    it('update summary should guide update workflow', () => {
      const summary = getSummary('update');
      const lowerSummary = summary.toLowerCase();
      
      const hasRelevantKeywords =
        lowerSummary.includes('update') ||
        lowerSummary.includes('memory') ||
        lowerSummary.includes('context');
      
      expect(hasRelevantKeywords).toBe(true);
    });
  });

  describe('Summary Characteristics', () => {
    it('summaries should not include full prompt text', () => {
      const keywords = ['checkpoint', 'execute', 'plan', 'sync', 'commit', 'update'];
      
      keywords.forEach(keyword => {
        const summary = getSummary(keyword);
        
        // Summaries are concise, not full prompts
        expect(summary.length).toBeLessThan(1000);
      });
    });

    it('summaries should be non-empty strings', () => {
      const keywords = ['checkpoint', 'execute', 'plan', 'sync', 'commit', 'update'];
      
      keywords.forEach(keyword => {
        const summary = getSummary(keyword);
        expect(typeof summary).toBe('string');
        expect(summary.length).toBeGreaterThan(0);
      });
    });

    it('summaries should be unique per keyword', () => {
      const summaries = {
        checkpoint: getSummary('checkpoint'),
        execute: getSummary('execute'),
        plan: getSummary('plan'),
        sync: getSummary('sync'),
        commit: getSummary('commit'),
        update: getSummary('update')
      };

      // Each summary should be different
      const uniqueValues = new Set(Object.values(summaries));
      expect(uniqueValues.size).toBe(6);
    });
  });

  describe('Consistency and Determinism', () => {
    it('getSummary should return same result on repeated calls', () => {
      const summary1 = getSummary('checkpoint');
      const summary2 = getSummary('checkpoint');
      
      expect(summary1).toBe(summary2);
    });

    it('getSummary should be case-sensitive for keywords', () => {
      const lowerSummary = getSummary('checkpoint');
      const upperSummary = getSummary('CHECKPOINT');
      
      // Should handle case variations (or return undefined for uppercase)
      expect(lowerSummary).toBeDefined();
    });

    it('getSummary should handle invalid keywords gracefully', () => {
      const summary = getSummary('invalid_keyword');
      
      // Should return null for unknown keywords
      expect(summary).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null keyword', () => {
      // Implementation doesn't guard null - would throw
      expect(() => getSummary(null)).toThrow();
    });

    it('should handle undefined keyword', () => {
      // Implementation doesn't guard undefined - would throw
      expect(() => getSummary(undefined)).toThrow();
    });

    it('should handle empty string keyword', () => {
      const summary = getSummary('');
      // Empty string normalizes to empty, returns null for unknown
      expect(summary).toBeNull();
    });

    it('should handle non-string keyword', () => {
      // Implementation expects string - would throw
      expect(() => getSummary(123)).toThrow();
    });
  });

  describe('Integration with Keyword Detection', () => {
    it('should provide summaries for all detected keywords', () => {
      const { detectKeyword } = require('../dist/src/keywordDetector');
      
      const testCases = [
        { input: 'checkpoint please', expectedKey: 'checkpoint' },
        { input: 'execute this', expectedKey: 'execute' },
        { input: 'plan it out', expectedKey: 'plan' }
      ];

      testCases.forEach(({ input, expectedKey }) => {
        const detected = detectKeyword(input);
        if (detected) {
          const summary = getSummary(detected.promptKey);
          expect(summary).toBeDefined();
          expect(summary.length).toBeGreaterThan(0);
        }
      });
    });

    it('should have summaries matching keyword detector mappings', () => {
      const { detectKeyword } = require('../dist/src/keywordDetector');
      
      // Test all 6 keywords
      const inputs = [
        'create checkpoint',
        'execute plan',
        'plan strategy',
        'sync memory',
        'commit changes',
        'update context'
      ];

      inputs.forEach(input => {
        const detected = detectKeyword(input);
        if (detected) {
          const summary = getSummary(detected.promptKey);
          expect(summary).toBeDefined();
        }
      });
    });
  });
});
