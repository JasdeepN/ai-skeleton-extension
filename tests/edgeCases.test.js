/**
 * Edge Case Handling Tests
 * Tests validation, concurrent operations, recovery, encoding, and format safety
 */

const {
  MemoryValidator,
  TransactionManager,
  DatabaseRecovery,
  TimestampHandler,
  BatchProcessor,
  DataSanitizer,
  DEFAULT_VALIDATION_RULES
} = require('../dist/src/edgeCaseHandler');

describe('Edge Case Handling', () => {
  // =========================================================================
  // Test Suite 1: Entry Validation
  // =========================================================================

  describe('MemoryValidator - Entry Validation', () => {
    let validator;

    beforeEach(() => {
      validator = new MemoryValidator();
    });

    test('should accept valid entry', () => {
      const entry = {
        file_type: 'activeContext',
        timestamp: '2025-12-04T10:00:00Z',
        tag: '[CONTEXT:2025-12-04]',
        content: 'Valid context entry'
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject entry with missing file_type', () => {
      const entry = {
        timestamp: '2025-12-04T10:00:00Z',
        tag: '[CONTEXT:2025-12-04]',
        content: 'Missing file type'
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Entry missing file_type');
    });

    test('should reject entry with invalid file_type', () => {
      const entry = {
        file_type: 'invalidType',
        timestamp: '2025-12-04T10:00:00Z',
        content: 'Invalid type'
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid file_type'))).toBe(true);
    });

    test('should reject entry with missing timestamp', () => {
      const entry = {
        file_type: 'activeContext',
        content: 'Missing timestamp'
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Entry missing timestamp');
    });

    test('should reject entry with invalid ISO 8601 timestamp', () => {
      const entry = {
        file_type: 'activeContext',
        timestamp: 'not-a-date',
        content: 'Invalid date'
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid timestamp format'))).toBe(true);
    });

    test('should reject entry with missing content', () => {
      const entry = {
        file_type: 'activeContext',
        timestamp: '2025-12-04T10:00:00Z'
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('content must be'))).toBe(true);
    });

    test('should reject entry with content exceeding max length', () => {
      const entry = {
        file_type: 'activeContext',
        timestamp: '2025-12-04T10:00:00Z',
        content: 'x'.repeat(1000001) // 1 byte over limit
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds max length'))).toBe(true);
    });

    test('should accept content at max length boundary', () => {
      const entry = {
        file_type: 'activeContext',
        timestamp: '2025-12-04T10:00:00Z',
        content: 'x'.repeat(1000000) // Exactly at limit
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(true);
    });

    test('should reject null entry', () => {
      const result = validator.validateEntry(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Entry is null or undefined');
    });

    test('should reject undefined entry', () => {
      const result = validator.validateEntry(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Entry is null or undefined');
    });
  });

  // =========================================================================
  // Test Suite 2: Tag Format Validation
  // =========================================================================

  describe('MemoryValidator - Tag Format', () => {
    let validator;

    beforeEach(() => {
      validator = new MemoryValidator();
    });

    test('should validate correct tag format [TYPE:YYYY-MM-DD]', () => {
      expect(validator.validateTagFormat('[DECISION:2025-12-04]')).toBe(true);
      expect(validator.validateTagFormat('[CONTEXT:2025-12-04]')).toBe(true);
      expect(validator.validateTagFormat('[PROGRESS:2025-12-04]')).toBe(true);
    });

    test('should reject tag without brackets', () => {
      expect(validator.validateTagFormat('DECISION:2025-12-04')).toBe(false);
    });

    test('should reject tag with incorrect date format', () => {
      expect(validator.validateTagFormat('[DECISION:12/04/2025]')).toBe(false);
      expect(validator.validateTagFormat('[DECISION:2025-12-4]')).toBe(false);
    });

    test('should reject tag with invalid month', () => {
      expect(validator.validateTagFormat('[DECISION:2025-13-04]')).toBe(false);
      expect(validator.validateTagFormat('[DECISION:2025-00-04]')).toBe(false);
    });

    test('should reject tag with invalid day', () => {
      expect(validator.validateTagFormat('[DECISION:2025-12-32]')).toBe(false);
      expect(validator.validateTagFormat('[DECISION:2025-12-00]')).toBe(false);
    });

    test('should reject tag with lowercase type', () => {
      expect(validator.validateTagFormat('[decision:2025-12-04]')).toBe(false);
    });

    test('should reject invalid entry type', () => {
      expect(validator.validateTagFormat('[INVALID:2025-12-04]')).toBe(false);
    });

    test('should extract date from valid tag', () => {
      const date = validator.extractDateFromTag('[DECISION:2025-12-04]');
      expect(date).toBe('2025-12-04');
    });

    test('should return null for invalid tag format', () => {
      const date = validator.extractDateFromTag('invalid-tag');
      expect(date).toBeNull();
    });
  });

  // =========================================================================
  // Test Suite 3: Character Encoding
  // =========================================================================

  describe('MemoryValidator - Character Encoding', () => {
    let validator;

    beforeEach(() => {
      validator = new MemoryValidator();
    });

    test('should accept UTF-8 multi-byte characters', () => {
      const entry = {
        file_type: 'activeContext',
        timestamp: '2025-12-04T10:00:00Z',
        content: 'Unicode: 你好 مرحبا Привет 🚀🎉'
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(true);
    });

    test('should handle emoji correctly', () => {
      const entry = {
        file_type: 'activeContext',
        timestamp: '2025-12-04T10:00:00Z',
        content: 'Task done ✅ Bug fixed 🐛 Great work 💯'
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(true);
    });

    test('should accept special characters', () => {
      const entry = {
        file_type: 'activeContext',
        timestamp: '2025-12-04T10:00:00Z',
        content: 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?'
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(true);
    });

    test('should handle newlines and tabs', () => {
      const entry = {
        file_type: 'activeContext',
        timestamp: '2025-12-04T10:00:00Z',
        content: 'Line 1\nLine 2\nLine 3\nTabbed:\tvalue'
      };

      const result = validator.validateEntry(entry);
      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // Test Suite 4: Concurrent Write Handling
  // =========================================================================

  describe('TransactionManager - Concurrent Operations', () => {
    let manager;

    beforeEach(() => {
      manager = new TransactionManager();
    });

    test('should begin and commit transaction', async () => {
      const txId = 'tx-1';
      await manager.beginTransaction(txId);
      expect(manager.getActiveTransactionCount()).toBe(1);

      await manager.commitTransaction(txId);
      expect(manager.getActiveTransactionCount()).toBe(0);
    });

    test('should prevent duplicate transaction IDs', async () => {
      const txId = 'tx-1';
      await manager.beginTransaction(txId);

      try {
        await manager.beginTransaction(txId);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.message).toContain('already active');
      }
    });

    test('should handle multiple concurrent transactions', async () => {
      await manager.beginTransaction('tx-1');
      await manager.beginTransaction('tx-2');
      await manager.beginTransaction('tx-3');

      expect(manager.getActiveTransactionCount()).toBe(3);

      await manager.commitTransaction('tx-2');
      expect(manager.getActiveTransactionCount()).toBe(2);

      await manager.commitTransaction('tx-1');
      await manager.commitTransaction('tx-3');
      expect(manager.getActiveTransactionCount()).toBe(0);
    });

    test('should rollback transaction', async () => {
      const txId = 'tx-1';
      await manager.beginTransaction(txId);
      expect(manager.getActiveTransactionCount()).toBe(1);

      await manager.rollbackTransaction(txId);
      expect(manager.getActiveTransactionCount()).toBe(0);
    });

    test('should queue operations for sequential execution', async () => {
      let executionOrder = [];

      await manager.queueOperation(async () => {
        executionOrder.push('op1');
      });

      await manager.queueOperation(async () => {
        executionOrder.push('op2');
      });

      await manager.queueOperation(async () => {
        executionOrder.push('op3');
      });

      expect(executionOrder).toEqual(['op1', 'op2', 'op3']);
      expect(manager.getQueueLength()).toBe(0);
    });

    test('should process queue sequentially despite async operations', async () => {
      let executionOrder = [];

      await manager.queueOperation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        executionOrder.push('op1');
      });

      await manager.queueOperation(async () => {
        executionOrder.push('op2');
      });

      expect(executionOrder).toEqual(['op1', 'op2']);
    });

    test('should clear pending operations', async () => {
      // Add operations without waiting for processing
      const manager2 = new TransactionManager();
      manager2.transactionQueue = [async () => { throw new Error('Should not execute'); }];
      
      manager2.clear();
      expect(manager2.getQueueLength()).toBe(0);
    });
  });

  // =========================================================================
  // Test Suite 5: Database Recovery
  // =========================================================================

  describe('DatabaseRecovery - Corruption Detection', () => {
    test('should detect database corruption errors', () => {
      const error = new Error('database disk image is malformed');
      const result = DatabaseRecovery.detectCorruption(error);

      expect(result.corrupted).toBe(true);
      expect(result.recoverable).toBe(true);
    });

    test('should detect database locked errors', () => {
      const error = new Error('database is locked');
      const result = DatabaseRecovery.detectCorruption(error);

      expect(result.corrupted).toBe(true);
    });

    test('should mark disk I/O errors as non-recoverable', () => {
      const error = new Error('disk I/O error');
      const result = DatabaseRecovery.detectCorruption(error);

      expect(result.corrupted).toBe(true);
      expect(result.recoverable).toBe(false);
    });

    test('should handle null/undefined errors gracefully', () => {
      const result = DatabaseRecovery.detectCorruption(null);
      expect(result.corrupted).toBe(false);
      expect(result.reason).toBe('');
    });

    test('should attempt recovery with backup', async () => {
      const result = await DatabaseRecovery.attemptRecovery('/db/memory.db', '/backup/memory.db');
      expect(typeof result).toBe('boolean');
    });

    test('should fail recovery without backup path', async () => {
      const result = await DatabaseRecovery.attemptRecovery('/db/memory.db', '');
      expect(result).toBe(false);
    });

    test('should verify database integrity', async () => {
      const result = await DatabaseRecovery.verifyIntegrity('/db/memory.db');
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('issues');
      expect(Array.isArray(result.issues)).toBe(true);
    });

    test('should detect missing database path', async () => {
      const result = await DatabaseRecovery.verifyIntegrity('');
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Test Suite 6: Timezone-Aware Timestamps
  // =========================================================================

  describe('TimestampHandler - Timezone Handling', () => {
    test('should get current timestamp in ISO 8601 UTC', () => {
      const ts = TimestampHandler.getCurrentTimestamp();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    test('should normalize timestamp to ISO 8601', () => {
      const input = '2025-12-04';
      const normalized = TimestampHandler.normalizeTimestamp(input);
      expect(normalized).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    test('should reject invalid timestamps', () => {
      expect(() => {
        TimestampHandler.normalizeTimestamp('not-a-date');
      }).toThrow();
    });

    test('should extract date component from timestamp', () => {
      const ts = '2025-12-04T10:30:45.123Z';
      const date = TimestampHandler.getDateComponent(ts);
      expect(date).toBe('2025-12-04');
    });

    test('should create tag with current date', () => {
      const tag = TimestampHandler.createTag('DECISION');
      expect(tag).toMatch(/^\[DECISION:\d{4}-\d{2}-\d{2}\]$/);
    });

    test('should create tag with specific timestamp', () => {
      const ts = '2025-12-04T10:00:00Z';
      const tag = TimestampHandler.createTag('CONTEXT', ts);
      expect(tag).toBe('[CONTEXT:2025-12-04]');
    });

    test('should check if timestamp is in date range', () => {
      const ts = '2025-12-04T10:00:00Z';
      const inRange = TimestampHandler.isInDateRange(
        ts,
        '2025-12-01T00:00:00Z',
        '2025-12-05T00:00:00Z'
      );
      expect(inRange).toBe(true);
    });

    test('should detect timestamp outside date range', () => {
      const ts = '2025-12-10T10:00:00Z';
      const inRange = TimestampHandler.isInDateRange(
        ts,
        '2025-12-01T00:00:00Z',
        '2025-12-05T00:00:00Z'
      );
      expect(inRange).toBe(false);
    });
  });

  // =========================================================================
  // Test Suite 7: Batch Processing
  // =========================================================================

  describe('BatchProcessor - Bulk Operations', () => {
    let processor;

    beforeEach(() => {
      processor = new BatchProcessor(10); // Small batch size for testing
    });

    test('should process valid entries in batches', async () => {
      const entries = Array.from({ length: 25 }, (_, i) => ({
        file_type: 'activeContext',
        timestamp: '2025-12-04T10:00:00Z',
        content: `Entry ${i}`
      }));

      const result = await processor.processBatch(entries);
      expect(result.valid).toHaveLength(25);
      expect(result.invalid).toHaveLength(0);
    });

    test('should separate valid from invalid entries', async () => {
      const entries = [
        {
          file_type: 'activeContext',
          timestamp: '2025-12-04T10:00:00Z',
          content: 'Valid'
        },
        {
          file_type: 'invalid',
          timestamp: '2025-12-04T10:00:00Z',
          content: 'Invalid type'
        },
        {
          file_type: 'activeContext',
          timestamp: '2025-12-04T10:00:00Z',
          content: 'Valid again'
        }
      ];

      const result = await processor.processBatch(entries);
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].errors.length).toBeGreaterThan(0);
    });

    test('should split entries into batches', () => {
      const entries = Array.from({ length: 35 }, (_, i) => ({ id: i }));
      const batches = processor.splitIntoBatches(entries);

      expect(batches).toHaveLength(4); // 10+10+10+5
      expect(batches[0]).toHaveLength(10);
      expect(batches[3]).toHaveLength(5);
    });

    test('should handle empty batch list', async () => {
      const result = await processor.processBatch([]);
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
    });

    test('should not block main thread during batch processing', async () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        file_type: 'activeContext',
        timestamp: '2025-12-04T10:00:00Z',
        content: `Entry ${i}`
      }));

      const startTime = performance.now();
      await processor.processBatch(entries);
      const duration = performance.now() - startTime;

      // Should complete reasonably fast (< 500ms for 100 entries)
      expect(duration).toBeLessThan(500);
    });
  });

  // =========================================================================
  // Test Suite 8: Data Sanitization
  // =========================================================================

  describe('DataSanitizer - Content Safety', () => {
    test('should remove null bytes from content', () => {
      const content = 'Safe content \x00with null bytes';
      const sanitized = DataSanitizer.sanitizeContent(content);
      expect(sanitized).not.toContain('\x00');
      expect(sanitized).toBe('Safe content with null bytes');
    });

    test('should normalize line endings to LF', () => {
      const content = 'Line1\r\nLine2\rLine3';
      const sanitized = DataSanitizer.sanitizeContent(content);
      expect(sanitized).toBe('Line1\nLine2\nLine3');
    });

    test('should limit consecutive newlines to 2', () => {
      const content = 'Line1\n\n\n\n\nLine2';
      const sanitized = DataSanitizer.sanitizeContent(content);
      expect(sanitized).toBe('Line1\n\nLine2');
    });

    test('should trim whitespace from content', () => {
      const content = '  \n  Content  \n  ';
      const sanitized = DataSanitizer.sanitizeContent(content);
      expect(sanitized).toBe('Content');
    });

    test('should sanitize tag format', () => {
      let tag = DataSanitizer.sanitizeTag('DECISION:2025-12-04');
      expect(tag).toBe('[DECISION:2025-12-04]');

      tag = DataSanitizer.sanitizeTag('  CONTEXT:2025-12-04  ');
      expect(tag).toBe('[CONTEXT:2025-12-04]');
    });

    test('should remove path traversal attempts', () => {
      let path = DataSanitizer.sanitizePath('../../etc/passwd');
      expect(path).not.toContain('../');

      path = DataSanitizer.sanitizePath('files/../../../secret');
      expect(path).not.toContain('../');
    });

    test('should escape SQL single quotes', () => {
      const input = "O'Reilly's book";
      const escaped = DataSanitizer.escapeSQLString(input);
      expect(escaped).toBe("O''Reilly''s book");
    });

    test('should handle empty content', () => {
      expect(DataSanitizer.sanitizeContent('')).toBe('');
      expect(DataSanitizer.sanitizeContent(null)).toBe('');
    });
  });
});
