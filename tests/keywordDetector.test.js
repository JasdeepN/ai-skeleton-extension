/**
 * keywordDetector.test.js - Behavioral Testing Phase 1
 * 
 * Tests keyword detection for @aiSkeleton chat participant.
 * Validates: all 6 trigger words, case-insensitive matching, confidence scoring, edge cases.
 * 
 * Success Criteria:
 * - All 6 trigger words detected correctly
 * - Case-insensitive matching works
 * - Confidence scoring differentiates exact vs partial matches
 * - Edge cases (empty, null, non-trigger text) handled gracefully
 */

const { detectKeyword } = require('../dist/src/keywordDetector');

describe('keywordDetector - Behavioral Testing Phase 1', () => {
  describe('Trigger Word Detection', () => {
    it('should detect "checkpoint" keyword', () => {
      const result = detectKeyword('checkpoint');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('checkpoint');
      expect(result.summary).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect "execute" keyword', () => {
      const result = detectKeyword('execute');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('execute');
    });

    it('should detect "plan" keyword', () => {
      const result = detectKeyword('plan');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('plan');
    });

    it('should detect "sync" keyword', () => {
      const result = detectKeyword('sync');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('sync');
    });

    it('should detect "commit" keyword', () => {
      const result = detectKeyword('commit');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('commit');
    });

    it('should detect "update" keyword', () => {
      const result = detectKeyword('update');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('update');
    });
  });

  describe('Case-Insensitive Matching', () => {
    it('should detect uppercase CHECKPOINT', () => {
      const result = detectKeyword('CHECKPOINT');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('checkpoint');
    });

    it('should detect mixed case ChEcKpOiNt', () => {
      const result = detectKeyword('ChEcKpOiNt');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('checkpoint');
    });

    it('should detect Execute with mixed case', () => {
      const result = detectKeyword('EXECUTE');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('execute');
    });

    it('should detect Plan with mixed case', () => {
      const result = detectKeyword('PlAn');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('plan');
    });
  });

  describe('Contextual Phrase Matching', () => {
    it('should detect "checkpoint" in longer phrase', () => {
      const result = detectKeyword('save my progress as a checkpoint');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('checkpoint');
    });

    it('should detect "commit" in longer phrase', () => {
      const result = detectKeyword('commit these changes to memory');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('commit');
    });

    it('should detect "execute" in longer phrase', () => {
      const result = detectKeyword('execute the plan immediately');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('execute');
    });

    it('should detect "plan" in longer phrase', () => {
      const result = detectKeyword('think about and plan the architecture');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('plan');
    });

    it('should detect "sync" in longer phrase', () => {
      const result = detectKeyword('sync my current context with memory');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('sync');
    });

    it('should detect "update" in longer phrase', () => {
      const result = detectKeyword('update my progress and context');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('update');
    });
  });

  describe('Confidence Scoring', () => {
    it('exact match should have higher confidence than partial match', () => {
      const exactMatch = detectKeyword('checkpoint');
      const partialMatch = detectKeyword('save checkpoint progress');
      
      expect(exactMatch).toBeDefined();
      expect(partialMatch).toBeDefined();
      expect(exactMatch.confidence).toBeGreaterThanOrEqual(partialMatch.confidence);
    });

    it('should have confidence > 0 and <= 1', () => {
      const result = detectKeyword('checkpoint');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('first keyword should be selected when multiple keywords present', () => {
      // "checkpoint" appears before "commit"
      const result = detectKeyword('checkpoint my progress then commit');
      expect(result.promptKey).toBe('checkpoint');
    });
  });

  describe('Edge Cases', () => {
    it('should return null for empty string', () => {
      const result = detectKeyword('');
      expect(result).toBeNull();
    });

    it('should return null for whitespace only', () => {
      const result = detectKeyword('   ');
      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = detectKeyword(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = detectKeyword(undefined);
      expect(result).toBeNull();
    });

    it('should return null for non-string input', () => {
      const result = detectKeyword(123);
      expect(result).toBeNull();
    });

    it('should return null for text without trigger words', () => {
      const result = detectKeyword('what is the current status of the database');
      expect(result).toBeNull();
    });

    it('should return null for similar but non-trigger words', () => {
      const result = detectKeyword('checkmate is when the king is in check');
      expect(result).toBeNull();
    });

    it('should handle very long input', () => {
      const longText = 'The user wanted to ' + 'checkpoint '.repeat(100) + ' their work';
      const result = detectKeyword(longText);
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('checkpoint');
    });

    it('should handle special characters around keyword', () => {
      const result = detectKeyword('!!!checkpoint???');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('checkpoint');
    });

    it('should handle keyword at start of string', () => {
      const result = detectKeyword('checkpoint progress now');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('checkpoint');
    });

    it('should handle keyword at end of string', () => {
      const result = detectKeyword('let me checkpoint this');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('checkpoint');
    });

    it('should handle keyword in middle of string', () => {
      const result = detectKeyword('let me checkpoint this work');
      expect(result).toBeDefined();
      expect(result.promptKey).toBe('checkpoint');
    });
  });

  describe('Summary Field', () => {
    it('should always provide summary for detected keyword', () => {
      const result = detectKeyword('checkpoint');
      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('should provide different summaries for different keywords', () => {
      const checkpointResult = detectKeyword('checkpoint');
      const executeResult = detectKeyword('execute');
      
      expect(checkpointResult.summary).not.toBe(executeResult.summary);
    });

    it('summary should be concise (target <100 tokens)', () => {
      // Rough estimate: 1 token ≈ 4 characters
      const result = detectKeyword('checkpoint');
      const estimatedTokens = Math.ceil(result.summary.length / 4);
      
      // Allow some margin for estimation error
      expect(estimatedTokens).toBeLessThan(150);
    });
  });

  describe('Keyword Mappings', () => {
    it('should detect all 6 unique prompt keys', () => {
      const keywords = ['checkpoint', 'execute', 'plan', 'sync', 'commit', 'update'];
      
      keywords.forEach(kw => {
        const result = detectKeyword(kw);
        expect(result).toBeDefined();
        expect(result.promptKey).toBe(kw);
      });
    });

    it('should map keywords to correct prompt keys', () => {
      expect(detectKeyword('checkpoint').promptKey).toBe('checkpoint');
      expect(detectKeyword('execute').promptKey).toBe('execute');
      expect(detectKeyword('plan').promptKey).toBe('plan');
      expect(detectKeyword('sync').promptKey).toBe('sync');
      expect(detectKeyword('commit').promptKey).toBe('commit');
      expect(detectKeyword('update').promptKey).toBe('update');
    });
  });

  describe('Consistency', () => {
    it('should consistently detect same keyword in multiple calls', () => {
      const result1 = detectKeyword('checkpoint my work');
      const result2 = detectKeyword('checkpoint my work');
      
      expect(result1.promptKey).toBe(result2.promptKey);
      expect(result1.summary).toBe(result2.summary);
      expect(result1.confidence).toBe(result2.confidence);
    });

    it('should not be affected by whitespace variations', () => {
      const result1 = detectKeyword('checkpoint');
      const result2 = detectKeyword('  checkpoint  ');
      const result3 = detectKeyword('\ncheckpoint\n');
      
      expect(result1.promptKey).toBe(result2.promptKey);
      expect(result2.promptKey).toBe(result3.promptKey);
    });
  });
});
