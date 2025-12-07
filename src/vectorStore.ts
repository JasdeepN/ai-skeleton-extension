/**
 * Vector Store: Manage semantic vectors for entries
 * 
 * PHASE 6: Vector Storage Layer
 * 
 * Primary: In-memory vector index (works with sql.js backend)
 * Optional: sqlite-vec extension (requires better-sqlite3)
 * 
 * Supports:
 * - Similarity search via cosine distance
 * - Binary quantization for 96% storage reduction
 * - Deduplication (similarity > 0.95 threshold)
 * - Clustering for context compression
 */

import { cosineSimilarity, quantizeEmbedding, dequantizeEmbedding } from './embeddingService';

export interface VectorEntry {
  id: number;
  embedding: Float32Array; // Full precision for in-memory search
  quantized?: Uint8Array; // Quantized (48 bytes) for disk storage
  text?: string; // Optional: snippet for display
}

export interface SearchResult {
  id: number;
  similarity: number; // -1 to 1, higher = more similar
  text?: string;
}

export interface ClusterResult {
  id: number;
  cluster: number; // Cluster ID
  similarity: number; // Similarity to cluster centroid
}

/**
 * In-memory vector index with similarity search
 * Works with both sql.js and better-sqlite3 backends
 */
export class VectorStore {
  private vectors: Map<number, VectorEntry> = new Map();
  private isDirty: boolean = false;

  /**
   * Add vector to index
   */
  addVector(id: number, embedding: Float32Array, text?: string): void {
    const entry: VectorEntry = {
      id,
      embedding,
      quantized: quantizeEmbedding(embedding),
      text,
    };
    this.vectors.set(id, entry);
    this.isDirty = true;
  }

  /**
   * Batch add vectors
   */
  addVectors(vectors: Array<{ id: number; embedding: Float32Array; text?: string }>): void {
    for (const vec of vectors) {
      this.addVector(vec.id, vec.embedding, vec.text);
    }
  }

  /**
   * Get vector by ID
   */
  getVector(id: number): VectorEntry | undefined {
    return this.vectors.get(id);
  }

  /**
   * Similarity search: find most similar entries to query vector
   */
  search(queryEmbedding: Float32Array, limit: number = 10, minSimilarity: number = 0.5): SearchResult[] {
    const results: SearchResult[] = [];

    for (const entry of this.vectors.values()) {
      const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
      
      // Skip low-similarity results
      if (similarity < minSimilarity) {
        continue;
      }

      results.push({
        id: entry.id,
        similarity,
        text: entry.text,
      });
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    // Return top-k
    return results.slice(0, limit);
  }

  /**
   * Deduplicate: find similar entries (similarity > threshold)
   * Returns groups of similar entry IDs
   */
  deduplicate(threshold: number = 0.95): Array<number[]> {
    const groups: Map<number, Set<number>> = new Map();
    const processed = new Set<number>();

    for (const [id, entry] of this.vectors.entries()) {
      if (processed.has(id)) continue;

      const group = new Set<number>([id]);
      processed.add(id);

      // Find all entries similar to this one
      for (const [otherId, otherEntry] of this.vectors.entries()) {
        if (processed.has(otherId)) continue;

        const similarity = cosineSimilarity(entry.embedding, otherEntry.embedding);
        if (similarity > threshold) {
          group.add(otherId);
          processed.add(otherId);
        }
      }

      if (group.size > 1) {
        groups.set(id, group);
      }
    }

    return Array.from(groups.values()).map(set => Array.from(set));
  }

  /**
   * K-means clustering for context compression
   * Groups similar entries together
   */
  cluster(k: number = 5, maxIterations: number = 10): ClusterResult[] {
    const n = this.vectors.size;
    if (n === 0) return [];
    if (k >= n) {
      // Can't cluster if k >= n; return individual clusters
      const results: ClusterResult[] = [];
      let clusterId = 0;
      for (const entry of this.vectors.values()) {
        results.push({
          id: entry.id,
          cluster: clusterId++,
          similarity: 1.0,
        });
      }
      return results;
    }

    const entries = Array.from(this.vectors.values());
    const assignments = new Array<number>(n).fill(0);
    const centroids: Float32Array[] = [];

    // Initialize centroids: pick k random entries
    const indices = new Set<number>();
    while (indices.size < k) {
      indices.add(Math.floor(Math.random() * n));
    }
    for (const idx of indices) {
      centroids.push(new Float32Array(entries[idx]!.embedding));
    }

    // K-means iterations
    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign each entry to nearest centroid
      for (let i = 0; i < n; i++) {
        let bestCluster = 0;
        let bestSimilarity = -1;

        for (let c = 0; c < k; c++) {
          const similarity = cosineSimilarity(entries[i]!.embedding, centroids[c]!);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestCluster = c;
          }
        }

        assignments[i] = bestCluster;
      }

      // Recompute centroids
      const newCentroids: Float32Array[] = [];
      for (let c = 0; c < k; c++) {
        const clusterEntries = entries.filter((_, i) => assignments[i] === c);
        if (clusterEntries.length === 0) {
          // Keep old centroid if empty cluster
          newCentroids.push(new Float32Array(centroids[c]!));
        } else {
          // Average of cluster entries
          const centroid = new Float32Array(384);
          for (const entry of clusterEntries) {
            for (let dim = 0; dim < 384; dim++) {
              centroid[dim]! += entry.embedding[dim]!;
            }
          }
          for (let dim = 0; dim < 384; dim++) {
            centroid[dim] = centroid[dim]! / clusterEntries.length;
          }
          // Normalize
          let norm = 0;
          for (let dim = 0; dim < 384; dim++) {
            norm += centroid[dim]! * centroid[dim]!;
          }
          norm = Math.sqrt(norm);
          for (let dim = 0; dim < 384; dim++) {
            centroid[dim] = centroid[dim]! / norm;
          }
          newCentroids.push(centroid);
        }
      }
      centroids.length = 0;
      centroids.push(...newCentroids);
    }

    // Generate results
    const results: ClusterResult[] = [];
    for (let i = 0; i < n; i++) {
      const cluster = assignments[i]!;
      const similarity = cosineSimilarity(entries[i]!.embedding, centroids[cluster]!);
      results.push({
        id: entries[i]!.id,
        cluster,
        similarity,
      });
    }

    return results;
  }

  /**
   * Get all vectors
   */
  getAllVectors(): VectorEntry[] {
    return Array.from(this.vectors.values());
  }

  /**
   * Clear index
   */
  clear(): void {
    this.vectors.clear();
    this.isDirty = false;
  }

  /**
   * Get index size
   */
  size(): number {
    return this.vectors.size;
  }

  /**
   * Check if index is dirty (needs persistence)
   */
  isDirtyState(): boolean {
    return this.isDirty;
  }

  /**
   * Mark as clean (after persistence)
   */
  markClean(): void {
    this.isDirty = false;
  }

  /**
   * Export for persistence
   */
  export(): Array<{ id: number; quantized: Uint8Array; text?: string }> {
    const exported = [];
    for (const entry of this.vectors.values()) {
      exported.push({
        id: entry.id,
        quantized: entry.quantized || quantizeEmbedding(entry.embedding),
        text: entry.text,
      });
    }
    return exported;
  }

  /**
   * Import from persistence
   */
  import(data: Array<{ id: number; quantized: Uint8Array; text?: string }>): void {
    this.clear();
    for (const item of data) {
      const embedding = dequantizeEmbedding(item.quantized);
      this.addVector(item.id, embedding, item.text);
    }
    this.markClean();
  }
}

/**
 * Hybrid scoring: combine semantic and keyword relevance
 */
export function hybridScore(
  semanticScore: number,
  keywordScore: number,
  semanticWeight: number = 0.7,
  keywordWeight: number = 0.3
): number {
  // Normalize both scores to [0, 1]
  const normalizedSemantic = (semanticScore + 1) / 2; // -1..1 → 0..1
  const normalizedKeyword = Math.min(keywordScore, 1);

  return semanticWeight * normalizedSemantic + keywordWeight * normalizedKeyword;
}

/**
 * Semantic deduplication: find duplicate clusters (similarity > threshold)
 */
export function findDuplicateClusters(
  store: VectorStore,
  threshold: number = 0.95
): Array<{ primary: number; duplicates: number[] }> {
  const results: Array<{ primary: number; duplicates: number[] }> = [];
  const processed = new Set<number>();

  const entries = store.getAllVectors();

  for (const entry of entries) {
    if (processed.has(entry.id)) continue;

    const duplicates: number[] = [];
    processed.add(entry.id);

    for (const other of entries) {
      if (processed.has(other.id) || other.id === entry.id) continue;

      const similarity = cosineSimilarity(entry.embedding, other.embedding);
      if (similarity > threshold) {
        duplicates.push(other.id);
        processed.add(other.id);
      }
    }

    if (duplicates.length > 0) {
      results.push({
        primary: entry.id,
        duplicates,
      });
    }
  }

  return results;
}
