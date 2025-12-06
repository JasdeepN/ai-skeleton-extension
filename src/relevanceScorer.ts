// Relevance Scorer
// Scores memory entries for relevance to a given task/query
// Uses keyword matching (fast path) with optional embedding-based scoring (slow path)

import { MemoryEntry as StoreMemoryEntry } from './memoryStore';

export interface ScoredEntry {
  entry: StoreMemoryEntry;
  relevanceScore: number; // 0-1, how relevant to query
  recencyScore: number; // 0-1, based on time decay
  priorityMultiplier: number; // 1.0-2.0x
  finalScore: number; // Combined score
  reason?: string; // Explanation of score
}

/**
 * Relevance Scorer Service
 * Determines which memory entries are relevant to a task
 * 
 * Scoring factors:
 * 1. Keyword relevance (fast path): TF-IDF or keyword overlap
 * 2. Recency weighting: Recent entries (< 7 days) score higher
 * 3. Priority multiplier: High-priority entries (pinned, system) score higher
 * 4. (Optional) Embedding-based relevance: Cosine similarity
 */
export class RelevanceScorer {
  private static instance: RelevanceScorer;

  private constructor() {}

  static getInstance(): RelevanceScorer {
    if (!RelevanceScorer.instance) {
      RelevanceScorer.instance = new RelevanceScorer();
    }
    return RelevanceScorer.instance;
  }

  /**
   * Score a single entry for relevance to a query
   */
  scoreEntry(entry: StoreMemoryEntry, query: string, options?: {
    includeRecency?: boolean;
    includePriority?: boolean;
  }): ScoredEntry {
    const opts = {
      includeRecency: true,
      includePriority: true,
      ...options
    };

    // Fast path: keyword matching
    const relevanceScore = this.calculateKeywordRelevance(entry.content, query);

    // Recency weighting
    const recencyScore = opts.includeRecency ? this.calculateRecencyScore(entry.timestamp) : 1.0;

    // Priority multiplier
    const priorityMultiplier = opts.includePriority ? this.calculatePriorityMultiplier(entry.file_type) : 1.0;

    // Final score: relevance * recency * priority
    const finalScore = relevanceScore * recencyScore * priorityMultiplier;

    return {
      entry,
      relevanceScore,
      recencyScore,
      priorityMultiplier,
      finalScore,
      reason: this.generateScoreReason(relevanceScore, recencyScore, priorityMultiplier)
    };
  }

  /**
   * Score multiple entries
   */
  scoreEntries(entries: StoreMemoryEntry[], query: string, options?: {
    includeRecency?: boolean;
    includePriority?: boolean;
  }): ScoredEntry[] {
    return entries.map(entry => this.scoreEntry(entry, query, options));
  }

  /**
   * Calculate keyword-based relevance score (0-1)
   * Uses simple keyword overlap as fast path
   */
  private calculateKeywordRelevance(content: string, query: string): number {
    if (!content || !query) {
      return 0;
    }

    // Extract keywords from query (simple approach: split on whitespace, remove stopwords)
    const keywords = this.extractKeywords(query);
    if (keywords.length === 0) {
      return 0;
    }

    // Normalize content to lowercase
    const normalizedContent = content.toLowerCase();

    // Count keyword matches
    let matches = 0;
    for (const keyword of keywords) {
      // Simple word boundary matching
      if (new RegExp(`\\b${this.escapeRegex(keyword)}\\b`).test(normalizedContent)) {
        matches++;
      }
    }

    // Relevance score: fraction of keywords found (capped at 1.0)
    const relevance = Math.min(1.0, matches / keywords.length);

    // Boost if multiple keywords found in close proximity
    if (matches > 1) {
      const boost = Math.min(0.5, 0.1 * (matches - 1));
      return Math.min(1.0, relevance + boost);
    }

    return relevance;
  }

  /**
   * Extract keywords from query
   * Removes common stopwords and normalizes
   */
  private extractKeywords(query: string): string[] {
    const stopwords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
      'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you',
      'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where',
      'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
      'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'same', 'so',
      'than', 'too', 'very'
    ]);

    return query
      .toLowerCase()
      .split(/[\s\-_\.]+/)
      .filter(word => word.length > 2 && !stopwords.has(word));
  }

  /**
   * Calculate recency score (0-1)
   * Recent entries (< 7 days) score higher
   */
  private calculateRecencyScore(timestamp: string): number {
    try {
      const entryDate = new Date(timestamp);
      const now = new Date();
      const ageMs = now.getTime() - entryDate.getTime();
      const agesDays = ageMs / (1000 * 60 * 60 * 24);

      if (agesDays < 7) {
        return 1.0; // Last 7 days: full score
      } else if (agesDays < 30) {
        return 0.7; // 7-30 days: 70% score
      } else if (agesDays < 90) {
        return 0.3; // 30-90 days: 30% score
      } else {
        return 0.1; // Over 90 days: 10% score
      }
    } catch {
      return 0.5; // Default if timestamp parsing fails
    }
  }

  /**
   * Calculate priority multiplier (1.0-2.0x)
   * System/important entries get higher priority
   */
  private calculatePriorityMultiplier(fileType: StoreMemoryEntry['file_type']): number {
    switch (fileType) {
      case 'BRIEF':
        return 1.5; // Project brief is always relevant
      case 'PATTERN':
        return 1.5; // System patterns are important
      case 'CONTEXT':
        return 1.3; // Active context is fairly important
      case 'DECISION':
        return 1.2; // Decisions inform current work
      case 'PROGRESS':
        return 1.0; // Progress entries are neutral
      default:
        return 1.0;
    }
  }

  /**
   * Generate human-readable explanation of score
   */
  private generateScoreReason(relevance: number, recency: number, priority: number): string {
    const factors: string[] = [];

    if (relevance > 0.7) {
      factors.push('highly relevant keywords');
    } else if (relevance > 0.4) {
      factors.push('moderately relevant');
    } else if (relevance > 0) {
      factors.push('weakly relevant');
    }

    if (recency >= 1.0) {
      factors.push('recent (< 7 days)');
    } else if (recency >= 0.7) {
      factors.push('fairly recent');
    } else if (recency > 0) {
      factors.push('aging');
    }

    if (priority > 1.3) {
      factors.push('high priority');
    }

    return factors.join('; ');
  }

  /**
   * Escape special regex characters in string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Rank entries by score, highest first
   */
  rankEntries(scoredEntries: ScoredEntry[]): ScoredEntry[] {
    return [...scoredEntries].sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Filter entries by minimum score threshold
   */
  filterByThreshold(scoredEntries: ScoredEntry[], threshold: number = 0.1): ScoredEntry[] {
    return scoredEntries.filter(entry => entry.finalScore >= threshold);
  }

  /**
   * Get top N most relevant entries
   */
  getTopEntries(scoredEntries: ScoredEntry[], topN: number = 10): ScoredEntry[] {
    return this.rankEntries(scoredEntries).slice(0, topN);
  }
}

export default RelevanceScorer.getInstance();
