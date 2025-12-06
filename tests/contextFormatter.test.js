// contextFormatter.test.js
// Unit tests for context formatting

const ContextFormatter = require('../dist/src/contextFormatter').default;
const { MemoryStore } = require('../dist/src/memoryStore');

describe('ContextFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = ContextFormatter;
  });

  describe('formatEntry', () => {
    it('should format a basic entry', () => {
      const entry = {
        id: 1,
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: 'This is a test context entry.'
      };

      const formatted = formatter.formatEntry(entry);

      expect(formatted).toHaveProperty('tag', '[CONTEXT:2025-12-06]');
      expect(formatted).toHaveProperty('type', 'CONTEXT');
      expect(formatted).toHaveProperty('content', entry.content);
      expect(formatted).toHaveProperty('formatted');
      expect(formatted.formatted).toContain('[CONTEXT:2025-12-06]');
      expect(formatted.formatted).toContain('This is a test context entry');
      expect(formatted.formatted).toContain('---');
    });

    it('should preserve multi-line content', () => {
      const entry = {
        file_type: 'DECISION',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[DECISION:2025-12-06]',
        content: 'Line 1\nLine 2\nLine 3'
      };

      const formatted = formatter.formatEntry(entry);

      expect(formatted.formatted).toContain('Line 1');
      expect(formatted.formatted).toContain('Line 2');
      expect(formatted.formatted).toContain('Line 3');
    });

    it('should include metadata when requested', () => {
      const entry = {
        file_type: 'PATTERN',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[PATTERN:2025-12-06]',
        content: 'Test pattern'
      };

      const formatted = formatter.formatEntry(entry, true);

      expect(formatted.metadata).toBeDefined();
      expect(formatted.metadata).toHaveProperty('type', 'PATTERN');
      expect(formatted.metadata).toHaveProperty('timestamp');
      expect(formatted.metadata).toHaveProperty('contentLength');
    });

    it('should exclude metadata when not requested', () => {
      const entry = {
        file_type: 'BRIEF',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[BRIEF:2025-12-06]',
        content: 'Brief content'
      };

      const formatted = formatter.formatEntry(entry, false);

      expect(formatted.metadata).toBeUndefined();
    });
  });

  describe('stripWhitespace', () => {
    it('should remove leading/trailing whitespace from lines', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: '   spaced content   \n   more content   '
      };

      const formatted = formatter.formatEntry(entry);

      expect(formatted.formatted).toContain('spaced content');
      expect(formatted.formatted).not.toContain('   spaced content   ');
    });

    it('should remove consecutive blank lines', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: 'Line 1\n\n\n\nLine 2'
      };

      const formatted = formatter.formatEntry(entry);

      // Should have reduced blank lines
      const blankCount = (formatted.formatted.match(/\n\n\n/g) || []).length;
      expect(blankCount).toBe(0); // No 3+ consecutive newlines
    });

    it('should preserve code block indentation', () => {
      const entry = {
        file_type: 'BRIEF',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[BRIEF:2025-12-06]',
        content: 'Text\n  - List item\n    - Nested item\n  - Another'
      };

      const formatted = formatter.formatEntry(entry);

      expect(formatted.formatted).toContain('- List item');
      expect(formatted.formatted).toContain('- Nested item');
    });
  });

  describe('formatEntries', () => {
    it('should format multiple entries', () => {
      const entries = [
        {
          file_type: 'CONTEXT',
          timestamp: '2025-12-06T10:00:00Z',
          tag: '[CONTEXT:2025-12-06]',
          content: 'Context 1'
        },
        {
          file_type: 'DECISION',
          timestamp: '2025-12-06T09:00:00Z',
          tag: '[DECISION:2025-12-06]',
          content: 'Decision 1'
        }
      ];

      const formatted = formatter.formatEntries(entries);

      expect(formatted).toHaveLength(2);
      expect(formatted[0].type).toBe('CONTEXT');
      expect(formatted[1].type).toBe('DECISION');
    });
  });

  describe('YAML serialization', () => {
    it('should serialize metadata as YAML', () => {
      const entry = {
        file_type: 'PATTERN',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[PATTERN:2025-12-06]',
        content: 'Pattern content'
      };

      const formatted = formatter.formatEntry(entry, true);
      const yaml = formatter.serializeAsYAML(formatted);

      expect(yaml).toContain('---');
      expect(yaml).toContain('type: "PATTERN"');
      expect(yaml).toContain('timestamp:');
    });

    it('should parse YAML back to object', () => {
      const yaml = `---
type: "CONTEXT"
timestamp: "2025-12-06T10:00:00Z"
contentLength: 42
---`;

      const parsed = formatter.parseYAML(yaml);

      expect(parsed.type).toBe('CONTEXT');
      expect(parsed.timestamp).toBe('2025-12-06T10:00:00Z');
      expect(parsed.contentLength).toBe(42);
    });

    it('should handle YAML arrays', () => {
      const yaml = `---
tags:
  - tag1
  - tag2
  - tag3
---`;

      const parsed = formatter.parseYAML(yaml);

      expect(Array.isArray(parsed.tags)).toBe(true);
      expect(parsed.tags).toHaveLength(3);
      expect(parsed.tags[0]).toBe('tag1');
    });
  });

  describe('formatAsDocument', () => {
    it('should format multiple entries as a document', () => {
      const entries = [
        {
          file_type: 'BRIEF',
          timestamp: '2025-12-06T10:00:00Z',
          tag: '[BRIEF:2025-12-06]',
          content: 'Project overview'
        },
        {
          file_type: 'CONTEXT',
          timestamp: '2025-12-06T09:00:00Z',
          tag: '[CONTEXT:2025-12-06]',
          content: 'Current context'
        }
      ];

      const doc = formatter.formatAsDocument(entries);

      expect(doc).toContain('[BRIEF:2025-12-06]');
      expect(doc).toContain('[CONTEXT:2025-12-06]');
      expect(doc).toContain('Project overview');
      expect(doc).toContain('Current context');
    });

    it('should sort entries by type when requested', () => {
      const entries = [
        {
          file_type: 'DECISION',
          timestamp: '2025-12-06T10:00:00Z',
          tag: '[DECISION:2025-12-06]',
          content: 'A decision'
        },
        {
          file_type: 'BRIEF',
          timestamp: '2025-12-06T10:00:00Z',
          tag: '[BRIEF:2025-12-06]',
          content: 'The brief'
        },
        {
          file_type: 'CONTEXT',
          timestamp: '2025-12-06T10:00:00Z',
          tag: '[CONTEXT:2025-12-06]',
          content: 'Some context'
        }
      ];

      const doc = formatter.formatAsDocument(entries, true);

      // BRIEF should come before CONTEXT which should come before DECISION
      const briefPos = doc.indexOf('[BRIEF:');
      const contextPos = doc.indexOf('[CONTEXT:');
      const decisionPos = doc.indexOf('[DECISION:');

      expect(briefPos).toBeLessThan(contextPos);
      expect(contextPos).toBeLessThan(decisionPos);
    });
  });

  describe('token reduction estimation', () => {
    it('should estimate reduction from formatting', () => {
      const original = JSON.stringify({
        type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        content: 'This is some context content'
      });

      const formatted = '[CONTEXT:2025-12-06] Context\n\nThis is some context content\n\n---';

      const reduction = formatter.estimateTokenReduction(original, formatted);

      expect(reduction).toHaveProperty('originalLength');
      expect(reduction).toHaveProperty('formattedLength');
      expect(reduction).toHaveProperty('reduction');
      expect(reduction).toHaveProperty('reductionPercent');
      expect(reduction.originalLength).toBeGreaterThan(0);
    });

    it('should calculate percentage correctly', () => {
      const original = 'ABCDEFGHIJ'; // 10 chars
      const formatted = 'ABC'; // 3 chars

      const reduction = formatter.estimateTokenReduction(original, formatted);

      expect(reduction.reduction).toBe(7);
      expect(reduction.reductionPercent).toBe(70);
    });

    it('should handle empty input', () => {
      const reduction = formatter.estimateTokenReduction('', '');

      expect(reduction.originalLength).toBe(0);
      expect(reduction.reductionPercent).toBe(0);
    });
  });

  describe('backward compatibility', () => {
    it('should preserve all entry data during formatting', () => {
      const entry = {
        id: 999,
        file_type: 'PATTERN',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[PATTERN:2025-12-06]',
        content: 'Original content'
      };

      const formatted = formatter.formatEntry(entry, true);

      expect(formatted.content).toBe(entry.content);
      expect(formatted.tag).toBe(entry.tag);
      expect(formatted.type).toBe(entry.file_type);
    });

    it('should handle entries with special characters', () => {
      const entry = {
        file_type: 'CONTEXT',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[CONTEXT:2025-12-06]',
        content: 'Content with <special> "characters" & symbols: !@#$%'
      };

      const formatted = formatter.formatEntry(entry);

      expect(formatted.formatted).toContain('<special>');
      expect(formatted.formatted).toContain('"characters"');
      expect(formatted.formatted).toContain('!@#$%');
    });

    it('should maintain content integrity through format round-trip', () => {
      const original = 'Test content\nwith multiple\nlines and structure';
      const entry = {
        file_type: 'DECISION',
        timestamp: '2025-12-06T10:00:00Z',
        tag: '[DECISION:2025-12-06]',
        content: original
      };

      const formatted = formatter.formatEntry(entry);

      // Content property should remain unchanged
      expect(formatted.content).toBe(original);
    });
  });
});
