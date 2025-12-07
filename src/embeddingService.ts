import * as fs from 'fs';
import * as path from 'path';

/**
 * Embedding Service: Singleton for generating and managing vector embeddings
 * Uses Transformers.js for local embedding generation (all-MiniLM-L6-v2)
 * No API dependencies, offline-capable
 */

export interface EmbeddingResult {
  embedding: Float32Array; // 384-dimensional vector from all-MiniLM-L6-v2
  inputTokens: number; // Approximate token count of input
  generatedAt: string; // ISO timestamp
}

export interface EmbeddingConfig {
  modelName: string; // Default: 'all-MiniLM-L6-v2'
  dimensions: number; // Default: 384
  batchSize: number; // Default: 10 (number of entries to embed in parallel)
  cachePath?: string; // Optional local cache directory for model
}

class EmbeddingService {
  private static instance: EmbeddingService;
  private modelLoaded: boolean = false;
  private config: EmbeddingConfig;
  private transformersModule: any = null;
  private model: any = null;
  private sessionCount: number = 0;

  private constructor(config?: Partial<EmbeddingConfig>) {
    this.config = {
      modelName: config?.modelName || 'all-MiniLM-L6-v2',
      dimensions: config?.dimensions || 384,
      batchSize: config?.batchSize || 10,
      cachePath: config?.cachePath,
    };
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(config?: Partial<EmbeddingConfig>): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService(config);
    }
    return EmbeddingService.instance;
  }

  /**
   * Initialize the embedding model (lazy load)
   * Downloads model on first call (~100MB for all-MiniLM-L6-v2)
   * Subsequent calls return immediately if already loaded
   */
  async initialize(): Promise<void> {
    if (this.modelLoaded && this.model) {
      return;
    }

    try {
      // Lazy load Transformers.js on first use
      // Note: In production, this would be @xenova/transformers
      // For now, we provide a stub that can be replaced with actual implementation
      this.transformersModule = await this.loadTransformersModule();
      
      // Initialize model pipeline for feature extraction
      // This downloads the model on first use and caches it locally
      if (this.transformersModule && this.transformersModule.pipeline) {
        this.model = await this.transformersModule.pipeline(
          'feature-extraction',
          `Xenova/${this.config.modelName}`,
          {
            progress_callback: (data: any) => {
              console.log(`[EmbeddingService] Loading model... ${data.progress}%`);
            },
          }
        );
        this.modelLoaded = true;
        console.log(`[EmbeddingService] Model initialized: ${this.config.modelName}`);
      }
    } catch (err) {
      console.error(`[EmbeddingService] Failed to initialize model:`, err);
      throw new Error(`Embedding model initialization failed: ${err}`);
    }
  }

  /**
   * Load Transformers.js module with fallback
   * In production, would require('@xenova/transformers')
   * For testing, provides a mock implementation
   */
  private async loadTransformersModule(): Promise<any> {
    try {
      // Try to require the actual package
      // eslint-disable-next-line global-require
      const mod = require('@xenova/transformers');
      return mod;
    } catch (err) {
      // Fallback: return mock for testing
      console.warn('[EmbeddingService] Transformers.js not available; using mock embeddings');
      return {
        pipeline: async () => ({
          __call__: (text: string) => {
            // Mock embedding: deterministic hash-based for testing
            return this.generateMockEmbedding(text);
          },
        }),
      };
    }
  }

  /**
   * Generate embedding for a single text entry
   * @param text Content to embed
   * @param estimatedTokenCount Optional token count (for logging)
   * @returns EmbeddingResult with 384-dimensional vector
   */
  async embed(text: string, estimatedTokenCount: number = 0): Promise<EmbeddingResult> {
    if (!this.modelLoaded) {
      await this.initialize();
    }

    if (!this.model) {
      throw new Error('[EmbeddingService] Model not initialized after init attempt');
    }

    try {
      const startTime = performance.now();
      
      // Generate embedding via model
      const output = await this.model(text, { pooling: 'mean', normalize: true });
      
      const duration = performance.now() - startTime;
      console.log(`[EmbeddingService] Embedded text (${text.length} chars) in ${duration.toFixed(0)}ms`);

      return {
        embedding: new Float32Array(output.data || output),
        inputTokens: estimatedTokenCount || Math.ceil(text.length / 4), // Rough estimate: 1 token ≈ 4 chars
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error(`[EmbeddingService] Embedding generation failed:`, err);
      throw new Error(`Failed to generate embedding: ${err}`);
    }
  }

  /**
   * Batch embed multiple texts (more efficient than sequential)
   * @param texts Array of texts to embed
   * @param estimatedTokenCounts Optional array of token counts
   * @returns Array of EmbeddingResults
   */
  async embedBatch(
    texts: string[],
    estimatedTokenCounts?: number[]
  ): Promise<EmbeddingResult[]> {
    if (!this.modelLoaded) {
      await this.initialize();
    }

    if (!this.model) {
      throw new Error('[EmbeddingService] Model not initialized after init attempt');
    }

    const results: EmbeddingResult[] = [];
    const batchSize = this.config.batchSize;

    console.log(`[EmbeddingService] Batch embedding ${texts.length} texts (batch size: ${batchSize})`);

    // Process in batches to manage memory
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, Math.min(i + batchSize, texts.length));
      const tokenBatch = estimatedTokenCounts?.slice(i, Math.min(i + batchSize, texts.length));

      try {
        const startTime = performance.now();
        
        // Embed batch
        const outputs = await Promise.all(
          batch.map((text, idx) =>
            this.model(text, { pooling: 'mean', normalize: true })
          )
        );

        const duration = performance.now() - startTime;
        console.log(`[EmbeddingService] Batch ${Math.floor(i / batchSize) + 1} embedded ${batch.length} texts in ${duration.toFixed(0)}ms`);

        outputs.forEach((output, idx) => {
          results.push({
            embedding: new Float32Array(output.data || output),
            inputTokens: tokenBatch?.[idx] || Math.ceil(batch[idx]!.length / 4),
            generatedAt: new Date().toISOString(),
          });
        });
      } catch (err) {
        console.error(`[EmbeddingService] Batch embedding failed for batch ${Math.floor(i / batchSize) + 1}:`, err);
        throw new Error(`Batch embedding failed: ${err}`);
      }
    }

    return results;
  }

  /**
   * Generate mock embedding for testing (deterministic hash-based)
   * Creates consistent 384-dimensional vector from text hash
   */
  private generateMockEmbedding(text: string): Float32Array {
    const embedding = new Float32Array(384);
    
    // Simple deterministic hash for reproducibility
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Fill vector with pseudo-random values based on hash
    for (let i = 0; i < 384; i++) {
      // Use hash to seed a simple PRNG for each dimension
      const seed = (hash * (i + 1)) & 0xffff;
      embedding[i] = (Math.sin(seed / 100) + 1) / 2; // Normalize to [0, 1]
    }

    // Normalize to unit length
    let norm = 0;
    for (let i = 0; i < 384; i++) {
      norm += embedding[i]! * embedding[i]!;
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < 384; i++) {
      embedding[i] = embedding[i]! / norm;
    }

    return embedding;
  }

  /**
   * Check if model is ready
   */
  isReady(): boolean {
    return this.modelLoaded && this.model !== null;
  }

  /**
   * Get model configuration
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * Get model info for diagnostics
   */
  getModelInfo(): {
    modelName: string;
    dimensions: number;
    isReady: boolean;
    sessionCount: number;
  } {
    return {
      modelName: this.config.modelName,
      dimensions: this.config.dimensions,
      isReady: this.isReady(),
      sessionCount: this.sessionCount,
    };
  }

  /**
   * Unload model to free memory (optional)
   */
  async unload(): Promise<void> {
    if (this.model) {
      try {
        // Try to unload if method exists
        if (typeof (this.model as any).dispose === 'function') {
          (this.model as any).dispose();
        }
      } catch (err) {
        console.warn('[EmbeddingService] Error unloading model:', err);
      }
    }
    this.model = null;
    this.modelLoaded = false;
  }
}

/**
 * Get the embedding service singleton
 */
export function getEmbeddingService(config?: Partial<EmbeddingConfig>): EmbeddingService {
  return EmbeddingService.getInstance(config);
}

/**
 * Cosin similarity function for comparing embeddings
 * Higher value = more similar (range: -1 to 1, typically 0 to 1)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    magnitudeA += a[i]! * a[i]!;
    magnitudeB += b[i]! * b[i]!;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0; // Avoid division by zero
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Binary quantization: Convert 384-dim float32 to 384 bits (48 bytes)
 * Uses threshold at 0 to convert each dimension to 0 or 1
 * Reduces storage by 96% (1536 bytes → 48 bytes per embedding)
 */
export function quantizeEmbedding(embedding: Float32Array): Uint8Array {
  if (embedding.length !== 384) {
    throw new Error('Expected 384-dimensional embedding');
  }

  // Convert to bit array (48 bytes = 384 bits)
  const quantized = new Uint8Array(48);

  for (let i = 0; i < 384; i++) {
    // Determine byte and bit position
    const byteIdx = Math.floor(i / 8);
    const bitIdx = i % 8;

    // Set bit if embedding[i] > 0
    if (embedding[i]! > 0) {
      quantized[byteIdx]! |= (1 << bitIdx);
    }
  }

  return quantized;
}

/**
 * Dequantize: Restore approximate embedding from quantized bits
 * Useful for distance calculations (not exact, but close)
 */
export function dequantizeEmbedding(quantized: Uint8Array): Float32Array {
  if (quantized.length !== 48) {
    throw new Error('Expected 48-byte quantized embedding');
  }

  const embedding = new Float32Array(384);

  for (let i = 0; i < 384; i++) {
    const byteIdx = Math.floor(i / 8);
    const bitIdx = i % 8;

    // Restore as 0.0 or 1.0
    embedding[i] = ((quantized[byteIdx]! >> bitIdx) & 1) === 1 ? 1.0 : -1.0;
  }

  return embedding;
}
