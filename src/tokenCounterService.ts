// Token Counter Service
// Provides token counting and budgeting for LLM agents
// Uses Anthropic SDK with js-tiktoken fallback for offline scenarios

import { encodingForModel } from 'js-tiktoken';
import { MemoryStore } from './memoryStore';

// Lazy import for Anthropic SDK (optional dependency, only loaded if API key present)
let Anthropic: any = null;

export interface TokenCountRequest {
  model: string;
  systemPrompt?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface TokenCountResult {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cached: boolean;
  estimatedOnly: boolean; // true if used offline estimation
}

export interface ContextBudget {
  total: number; // Total context window (e.g., 200000 for Claude)
  used: number; // Currently used tokens
  remaining: number; // Available tokens
  percentUsed: number; // Used as percentage
  status: 'healthy' | 'warning' | 'critical'; // Budget health status
  recommendations: string[]; // Suggestions for context management
}

/**
 * LRU Cache for token count results
 * Prevents excessive API calls for identical requests
 */
class TokenCountCache {
  private cache = new Map<string, { result: TokenCountResult; timestamp: number }>();
  private readonly maxSize = 100;
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes

  set(key: string, result: TokenCountResult): void {
    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  get(key: string): TokenCountResult | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    
    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.result;
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs
    };
  }
}

/**
 * Token Counter Service
 * Primary: Anthropic countTokens API (most accurate)
 * Fallback: js-tiktoken local estimation (for offline/deployment)
 */
export class TokenCounterService {
  private static instance: TokenCounterService;
  private anthropicClient: any | null = null;
  private cache = new TokenCountCache();
  private memoryStore: MemoryStore | null = null;
  private tokenMetricsBuffer: Array<{
    timestamp: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }> = [];
  private readonly maxMetricsBuffer = 100;

  private constructor() {
    // Initialize Anthropic client if API key is available
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        // Lazy import Anthropic SDK only when needed
        if (!Anthropic) {
          Anthropic = require('@anthropic-ai/sdk').Anthropic;
        }
        this.anthropicClient = new Anthropic({ apiKey });
      } catch (error) {
        console.warn('[TokenCounterService] Anthropic SDK not available, using offline estimation:', error);
        // Will fall back to offline token estimation
      }
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TokenCounterService {
    if (!TokenCounterService.instance) {
      TokenCounterService.instance = new TokenCounterService();
    }
    return TokenCounterService.instance;
  }

  /**
   * Set memory store for metrics persistence
   */
  setMemoryStore(store: MemoryStore): void {
    this.memoryStore = store;
  }

  /**
   * Count tokens in a message using Anthropic API or offline estimation
   */
  async countTokens(request: TokenCountRequest): Promise<TokenCountResult> {
    const cacheKey = this.generateCacheKey(request);
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    let result: TokenCountResult;

    // Try Anthropic API first
    if (this.anthropicClient) {
      try {
        const response = await (this.anthropicClient as any).messages.countTokens({
          model: request.model,
          system: request.systemPrompt,
          messages: request.messages
        } as any);

        result = {
          inputTokens: response.input_tokens,
          outputTokens: 0, // API doesn't provide this, we reserve 20% of budget
          totalTokens: response.input_tokens,
          cached: false,
          estimatedOnly: false
        };
      } catch (error) {
        console.warn('[TokenCounterService] Anthropic API failed:', error);
        // Fall through to offline estimation
        result = this.estimateTokensOffline(request);
      }
    } else {
      // No API available, use offline estimation
      result = this.estimateTokensOffline(request);
    }

    // Cache the result
    this.cache.set(cacheKey, result);

    // Log to metrics buffer
    this.logMetric(request.model, result);

    return result;
  }

  /**
   * Estimate tokens using js-tiktoken (offline)
   */
  private estimateTokensOffline(request: TokenCountRequest): TokenCountResult {
    try {
      // Get encoding for model
      let encoding;
      if (request.model.includes('claude')) {
        // Claude uses same encoding as GPT-4
        encoding = encodingForModel('gpt-4');
      } else if (request.model.includes('gpt-4')) {
        encoding = encodingForModel('gpt-4');
      } else {
        // Default to cl100k_base (GPT-3.5 / GPT-4)
        encoding = encodingForModel('gpt-3.5-turbo');
      }

      let tokenCount = 0;

      // Count system prompt tokens
      if (request.systemPrompt) {
        tokenCount += encoding.encode(request.systemPrompt).length;
        tokenCount += 4; // System message overhead
      }

      // Count message tokens
      for (const msg of request.messages) {
        tokenCount += encoding.encode(msg.content).length;
        tokenCount += 4; // Message overhead
      }

      return {
        inputTokens: tokenCount,
        outputTokens: 0,
        totalTokens: tokenCount,
        cached: false,
        estimatedOnly: true
      };
    } catch (error) {
      console.warn('[TokenCounterService] Offline estimation failed:', error);
      // Conservative fallback: estimate 1 token per 4 characters
      let charCount = request.systemPrompt?.length ?? 0;
      for (const msg of request.messages) {
        charCount += msg.content.length;
      }
      const estimate = Math.ceil(charCount / 4);
      
      return {
        inputTokens: estimate,
        outputTokens: 0,
        totalTokens: estimate,
        cached: false,
        estimatedOnly: true
      };
    }
  }

  /**
   * Generate cache key for a request
   */
  private generateCacheKey(request: TokenCountRequest): string {
    // Create hash based on content - simple but effective
    const key = JSON.stringify({
      model: request.model,
      systemPrompt: request.systemPrompt?.substring(0, 100), // First 100 chars
      messageCount: request.messages.length,
      messageHashes: request.messages.map(m => this.simpleHash(m.content))
    });
    return key;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 100); i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * Log token count to metrics buffer (for persistence)
   */
  private logMetric(model: string, result: TokenCountResult): void {
    const metric = {
      timestamp: new Date().toISOString(),
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens
    };

    this.tokenMetricsBuffer.push(metric);

    // Flush to database if buffer is full
    if (this.tokenMetricsBuffer.length >= this.maxMetricsBuffer) {
      this.flushMetricsToDb();
    }
  }

  /**
   * Flush accumulated metrics to database
   */
  private async flushMetricsToDb(): Promise<void> {
    if (!this.memoryStore || this.tokenMetricsBuffer.length === 0) {
      return;
    }

    // Store metrics as memory entry (optional enhancement: could use separate table)
    // For now, we'll keep metrics in-memory and expose via API
    console.log('[TokenCounterService] Metrics buffer:', this.tokenMetricsBuffer.length);
  }

  /**
   * Get context budget for current usage
   */
  getContextBudget(usedTokens: number, contextWindow: number = 200000): ContextBudget {
    const outputBuffer = contextWindow * 0.20; // Reserve 20% for output
    const availableInput = contextWindow - outputBuffer;
    const remaining = availableInput - usedTokens;
    const percentUsed = (usedTokens / availableInput) * 100;

    let status: 'healthy' | 'warning' | 'critical';
    let recommendations: string[] = [];

    if (remaining > 50000) {
      status = 'healthy';
      recommendations = ['Continue adding context as needed'];
    } else if (remaining > 10000) {
      status = 'warning';
      recommendations = [
        'Context budget getting low (< 50K tokens)',
        'Consider summarizing long contexts',
        'May need new chat soon'
      ];
    } else {
      status = 'critical';
      recommendations = [
        'Critical: Context budget nearly exhausted (< 10K tokens)',
        'Start new chat recommended',
        'Compress or remove non-essential context'
      ];
    }

    return {
      total: availableInput,
      used: usedTokens,
      remaining: Math.max(0, remaining),
      percentUsed: Math.min(100, percentUsed),
      status,
      recommendations
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get accumulated metrics
   */
  getMetrics() {
    return {
      buffered: this.tokenMetricsBuffer.length,
      maxBufferSize: this.maxMetricsBuffer,
      lastMetrics: this.tokenMetricsBuffer.slice(-10) // Last 10 metrics
    };
  }

  /**
   * Flush remaining metrics
   */
  async flush(): Promise<void> {
    if (this.tokenMetricsBuffer.length > 0) {
      await this.flushMetricsToDb();
      this.tokenMetricsBuffer = [];
    }
  }
}

export default TokenCounterService.getInstance();
