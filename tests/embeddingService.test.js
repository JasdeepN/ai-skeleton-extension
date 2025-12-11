describe('embeddingService', () => {
  let embeddingModule;

  beforeEach(() => {
    jest.resetModules();
    embeddingModule = require('../dist/src/embeddingService');
  });

  it('returns zero vector for empty text without initializing model', async () => {
    const service = embeddingModule.getEmbeddingService();
    const result = await service.embed('');

    expect(result.inputTokens).toBe(0);
    expect(result.embedding).toBeInstanceOf(Float32Array);
    expect(result.embedding.length).toBe(384);
    expect(Array.from(result.embedding).every((v) => v === 0)).toBe(true);
  });

  it('embeds batch of blank strings using zero vectors', async () => {
    const service = embeddingModule.getEmbeddingService({ batchSize: 2 });
    const results = await service.embedBatch(['', '   ']);

    expect(results).toHaveLength(2);
    results.forEach((res) => {
      expect(res.embedding.length).toBe(384);
      expect(Array.from(res.embedding).every((v) => v === 0)).toBe(true);
      expect(res.inputTokens).toBe(0);
    });
  });

  it('uses mock transformers fallback when module unavailable', async () => {
    const service = embeddingModule.getEmbeddingService();
    const result = await service.embed('text for embedding');

    expect(result.embedding.length).toBe(384);
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(typeof result.generatedAt).toBe('string');
  });
});
