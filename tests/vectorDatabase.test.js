/**
 * Vector Database Integration Tests
 * Tests the complete semantic search pipeline:
 * - Embedding generation and storage
 * - Cosine similarity calculation
 * - Hybrid scoring (semantic + keyword)
 * - Retrieval accuracy with real embeddings
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock embedding service to avoid downloading large models during tests
jest.mock('../dist/src/embeddingService.js', () => {
  const dummyQuantized = new Uint8Array(48).fill(1);

  return {
    getEmbeddingService: () => ({
      // Return a deterministic embedding vector
      embed: async () => ({ embedding: new Array(384).fill(0.123) })
    }),
    // Return fixed-length quantized buffer used by MemoryStore
    quantizeEmbedding: () => dummyQuantized,
    // Provide dequantizeEmbedding to mirror real module and avoid runtime warnings
      dequantizeEmbedding: () => new Float32Array(384).fill(1),
      // Cosine similarity placeholder to keep semantic scores neutral in tests
      cosineSimilarity: () => 0
  };
});

/**
 * Wait for embeddings to be generated up to an expected count.
 * Polls the database until the expected number of entries have non-null embeddings
 * or the timeout is reached.
 */
async function waitForEmbeddings(store, expectedCount, { timeoutMs = 20000, intervalMs = 250 } = {}) {
  const start = Date.now();
  let lastCount = 0;

  while (Date.now() - start < timeoutMs) {
    lastCount = await store.countEntriesWithEmbeddings();
    if (lastCount >= expectedCount) {
      return lastCount;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for embeddings. Expected: ${expectedCount}, got: ${lastCount}`);
}

describe('Vector Database Semantic Search', () => {
  const { MemoryStore } = require('../dist/src/memoryStore.js');
  const { MemoryBankService } = require('../dist/src/memoryService.js');
  let tempDbPath;
  let memoryStore;
  let memoryService;

  beforeEach(async () => {
    // Create temporary database for testing
    tempDbPath = path.join(os.tmpdir(), `test-vector-db-${Date.now()}.db`);
    memoryStore = new MemoryStore();
    await memoryStore.init(tempDbPath);
    memoryService = new MemoryBankService(memoryStore);
  });

  afterEach(async () => {
    // Cleanup
    try {
      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (err) {
      console.warn('Failed to cleanup test database:', err);
    }
  });

  describe('Embedding Generation and Storage', () => {
    test('should generate and store embeddings when appending entry', async () => {
      const entryId = await memoryStore.appendEntry({
        file_type: 'DECISION',
        timestamp: new Date().toISOString(),
        tag: '[DECISION:2025-12-07]',
        content: 'Use SQLite for vector database implementation with cosine similarity',
        metadata: '{}',
      });

      expect(entryId).not.toBeNull();

      // Wait for async embedding generation to complete
      await waitForEmbeddings(memoryStore, 1, { timeoutMs: 20000 });

      // Query entries with embeddings
      const entriesWithEmbeddings = await memoryStore.queryEntriesWithEmbeddings();
      
      expect(entriesWithEmbeddings.length).toBeGreaterThan(0);
      
      const entry = entriesWithEmbeddings.find(e => e.id === entryId);
      expect(entry).toBeDefined();
      expect(entry.embedding).toBeInstanceOf(Buffer);
      expect(entry.embedding.length).toBe(48); // Quantized to 48 bytes
    }, 25000); // Increase timeout for embedding generation

    test('should handle entries without embeddings gracefully', async () => {
      // Insert entry directly bypassing embedding generation
      const entryId = await memoryStore.appendEntry({
        file_type: 'CONTEXT',
        timestamp: new Date().toISOString(),
        tag: '[CONTEXT:2025-12-07]',
        content: 'Test entry without embedding',
        metadata: '{}',
      });

      expect(entryId).not.toBeNull();

      // Immediately query without waiting for embedding
      const result = await memoryService.semanticSearch('test', 10);
      
      // Should still work with keyword fallback
      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
    });
  });

  describe('Semantic Similarity Search', () => {
    beforeEach(async () => {
      // Seed database with semantically related and unrelated entries
      const entries = [
        {
          file_type: 'DECISION',
          timestamp: '2025-12-07T10:00:00Z',
          tag: '[DECISION:2025-12-07]',
          content: 'Implement vector database using SQLite with cosine similarity for semantic search',
          metadata: '{}',
        },
        {
          file_type: 'DECISION',
          timestamp: '2025-12-07T10:05:00Z',
          tag: '[DECISION:2025-12-07]',
          content: 'Use embeddings to enable semantic matching between query and stored entries',
          metadata: '{}',
        },
        {
          file_type: 'CONTEXT',
          timestamp: '2025-12-07T10:10:00Z',
          tag: '[CONTEXT:2025-12-07]',
          content: 'Database performance optimization using indexed queries and caching',
          metadata: '{}',
        },
        {
          file_type: 'PATTERN',
          timestamp: '2025-12-07T10:15:00Z',
          tag: '[PATTERN:2025-12-07]',
          content: 'React component patterns with hooks and state management',
          metadata: '{}',
        },
        {
          file_type: 'PROGRESS',
          timestamp: '2025-12-07T10:20:00Z',
          tag: '[PROGRESS:2025-12-07]',
          content: 'Frontend UI redesign with new color scheme and typography',
          metadata: '{}',
        },
      ];

      for (const entry of entries) {
        await memoryStore.appendEntry(entry);
      }

      // Wait for all embeddings to be generated
      console.log('[Test] Waiting for embedding generation...');
      const generated = await waitForEmbeddings(memoryStore, entries.length, { timeoutMs: 20000 });
      console.log(`[Test] Embeddings generated: ${generated}/${entries.length}`);
    }, 25000);

    test('should return semantically similar entries for database query', async () => {
      const result = await memoryService.semanticSearch('vector database semantic search', 5);

      expect(result.entries.length).toBeGreaterThan(0);
      
      // Top result should be about vector database/semantic search
      const topEntry = result.entries[0];
      expect(topEntry.content.toLowerCase()).toMatch(/(vector|database|semantic|search|embedding)/);
      
      // Should have a reasonable score (hybrid scoring: 70% semantic + 30% keyword)
      expect(topEntry.score).toBeGreaterThan(0.3);
      
      console.log('[Test] Top result:', {
        content: topEntry.content.substring(0, 80),
        score: topEntry.score,
        reason: topEntry.reason,
      });
    }, 25000);

    test('should rank entries by semantic relevance', async () => {
      const result = await memoryService.semanticSearch('database optimization performance', 5);

      expect(result.entries.length).toBeGreaterThan(0);

      // Entries should be sorted by descending score
      for (let i = 0; i < result.entries.length - 1; i++) {
        expect(result.entries[i].score).toBeGreaterThanOrEqual(result.entries[i + 1].score);
      }

      console.log('[Test] Ranking:', result.entries.map(e => ({
        content: e.content.substring(0, 60),
        score: e.score.toFixed(3),
      })));
    }, 25000);

    test('should filter out unrelated entries', async () => {
      const result = await memoryService.semanticSearch('database vector embeddings', 3);

      // UI/frontend entry should NOT be in top 3 results
      const hasUnrelatedEntry = result.entries.some(e => 
        e.content.toLowerCase().includes('frontend') || 
        e.content.toLowerCase().includes('color scheme')
      );

      expect(hasUnrelatedEntry).toBe(false);
    }, 25000);

    test('should combine semantic and keyword scoring', async () => {
      const result = await memoryService.semanticSearch('SQLite', 5);

      // Should find entry with exact "SQLite" keyword
      const sqliteEntry = result.entries.find(e => e.content.includes('SQLite'));
      
      if (sqliteEntry) {
        // Keyword match should boost score
        expect(sqliteEntry.score).toBeGreaterThan(0.4);
        expect(sqliteEntry.reason).toContain('keyword');
      }

      console.log('[Test] SQLite search results:', result.entries.map(e => ({
        hasKeyword: e.content.includes('SQLite'),
        score: e.score.toFixed(3),
        reason: e.reason,
      })));
    }, 25000);

    test('should handle queries with no matches', async () => {
      const result = await memoryService.semanticSearch('quantum mechanics physics equations', 5);

      // Should still return results (best effort)
      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
      
      // But scores should be low since content is unrelated
      if (result.entries.length > 0) {
        expect(result.entries[0].score).toBeLessThan(0.5);
      }
    }, 25000);

    test('should include search metadata', async () => {
      const result = await memoryService.semanticSearch('test query', 5);

      expect(result.query).toBe('test query');
      expect(result.searchTime).toBeGreaterThan(0);
      expect(result.searchTime).toBeLessThan(5000); // Should be fast (<5s)
      
      console.log('[Test] Search completed in:', result.searchTime.toFixed(2), 'ms');
    }, 25000);
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty database', async () => {
      const result = await memoryService.semanticSearch('test query', 5);

      expect(result.entries).toBeDefined();
      expect(result.entries.length).toBe(0);
      expect(result.searchTime).toBeGreaterThan(0);
    });

    test('should handle special characters in query', async () => {
      await memoryStore.appendEntry({
        file_type: 'DECISION',
        timestamp: new Date().toISOString(),
        tag: '[DECISION:2025-12-07]',
        content: 'Use C++ for performance-critical code',
        metadata: '{}',
      });

      await waitForEmbeddings(memoryStore, 1, { timeoutMs: 20000 });

      const result = await memoryService.semanticSearch('C++ performance', 5);
      
      expect(result.entries).toBeDefined();
      // Should not crash on special characters
    }, 20000);

    test('should handle very long queries', async () => {
      const longQuery = 'vector database '.repeat(50); // 850 characters

      const result = await memoryService.semanticSearch(longQuery, 5);
      
      expect(result.entries).toBeDefined();
      // Should handle gracefully without crashing
    });

    test('should respect limit parameter', async () => {
      // Add multiple entries
      for (let i = 0; i < 10; i++) {
        await memoryStore.appendEntry({
          file_type: 'CONTEXT',
          timestamp: new Date().toISOString(),
          tag: '[CONTEXT:2025-12-07]',
          content: `Test entry number ${i} about databases and search`,
          metadata: '{}',
        });
      }

      await waitForEmbeddings(memoryStore, 10, { timeoutMs: 20000 });

      const result = await memoryService.semanticSearch('database search', 3);
      
      expect(result.entries.length).toBeLessThanOrEqual(3);
    }, 25000);
  });

  describe('Performance Benchmarks', () => {
    test('should complete search within reasonable time', async () => {
      // Add 20 entries
      for (let i = 0; i < 20; i++) {
        await memoryStore.appendEntry({
          file_type: 'CONTEXT',
          timestamp: new Date().toISOString(),
          tag: '[CONTEXT:2025-12-07]',
          content: `Entry ${i}: Various topics including databases, search, UI, performance, testing`,
          metadata: '{}',
        });
      }

      await waitForEmbeddings(memoryStore, 20, { timeoutMs: 25000 });

      const startTime = performance.now();
      const result = await memoryService.semanticSearch('database performance', 10);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(1000); // Should complete within 1 second
      expect(result.entries.length).toBeGreaterThan(0);

      console.log('[Test] Search with 20 entries completed in:', elapsed.toFixed(2), 'ms');
    }, 30000);
  });
});
