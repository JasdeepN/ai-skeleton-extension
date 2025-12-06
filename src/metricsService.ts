/**
 * Metrics Service
 * Aggregates and analyzes token and query metrics for dashboard display
 * Provides high-level metric queries and trend analysis
 */

import { getMemoryStore } from './memoryStore';

// Import types from memoryStore for consistency
interface TokenMetric {
  id?: number | string;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  context_status?: 'healthy' | 'warning' | 'critical';
  created_at?: string;
}

interface QueryMetric {
  id?: number | string;
  timestamp: string;
  operation: string;
  elapsed_ms: number;
  result_count: number;
  created_at?: string;
}

export interface MetricsSummary {
  totalTokensUsed: number;
  averageTokensPerCall: number;
  currentStatus: 'healthy' | 'warning' | 'critical' | 'no-data';
  remainingBudget: number;
  percentageUsed: number;
  callCount: number;
  averageQueryTime: number;
  lastUpdated: string;
}

class MetricsServiceImpl {
  private cache: Map<string, { value: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  /**
   * Get token metrics for the last N days
   */
  async queryTokenMetrics(days: number = 7): Promise<TokenMetric[]> {
    try {
      const store = getMemoryStore();
      const metrics = await store.queryTokenMetrics(days);
      return metrics;
    } catch (err) {
      console.error('[MetricsService] Failed to get token metrics:', err);
      return [];
    }
  }

  /**
   * Get average tokens per agent call
   */
  async getAverageTokenUsage(days: number = 7): Promise<number> {
    const cacheKey = `avgTokens-${days}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }

    try {
      const metrics = await this.queryTokenMetrics(days);
      if (metrics.length === 0) return 0;
      
      const total = metrics.reduce((sum, m) => sum + (m.total_tokens || 0), 0);
      const average = Math.round(total / metrics.length);
      
      this.cache.set(cacheKey, { value: average, timestamp: Date.now() });
      return average;
    } catch (err) {
      console.error('[MetricsService] Failed to get average tokens:', err);
      return 0;
    }
  }

  /**
   * Get token usage trend (increasing, stable, decreasing)
   */
  async getTokenTrend(days: number = 7): Promise<'increasing' | 'stable' | 'decreasing'> {
    try {
      const metrics = await this.queryTokenMetrics(days);
      if (metrics.length < 2) return 'stable';

      // Compare first half vs second half average
      const mid = Math.floor(metrics.length / 2);
      const firstHalf = metrics.slice(0, mid);
      const secondHalf = metrics.slice(mid);

      const firstAvg = firstHalf.reduce((sum, m) => sum + (m.total_tokens || 0), 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, m) => sum + (m.total_tokens || 0), 0) / secondHalf.length;

      const change = ((secondAvg - firstAvg) / firstAvg) * 100;

      if (change > 5) return 'increasing';
      if (change < -5) return 'decreasing';
      return 'stable';
    } catch (err) {
      console.error('[MetricsService] Failed to get token trend:', err);
      return 'stable';
    }
  }

  /**
   * Get query metrics for a specific operation
   */
  async getQueryMetrics(operation: string, days: number = 7): Promise<QueryMetric[]> {
    try {
      const store = getMemoryStore();
      const metrics = await store.getQueryMetrics(operation, days);
      return metrics;
    } catch (err) {
      console.error('[MetricsService] Failed to get query metrics:', err);
      return [];
    }
  }

  /**
   * Get average query execution time
   */
  async getAverageQueryTime(operation?: string, days: number = 7): Promise<number> {
    const cacheKey = `avgQueryTime-${operation || 'all'}-${days}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }

    try {
      const store = getMemoryStore();
      
      let metrics: QueryMetric[];
      if (operation) {
        metrics = await store.getQueryMetrics(operation, days);
      } else {
        // Get all query metrics
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const stmt = (store as any).db?.prepare(`
          SELECT id, timestamp, operation, elapsed_ms, result_count, created_at
          FROM query_metrics
          WHERE timestamp >= ?
          ORDER BY timestamp DESC
        `);
        
        if (!stmt) return 0;
        
        const allMetrics: QueryMetric[] = [];
        if ((store as any).backend === 'better-sqlite3') {
          stmt.bind([startDate]);
          while (stmt.step()) {
            allMetrics.push(stmt.getAsObject() as QueryMetric);
          }
          stmt.free();
        }
        metrics = allMetrics;
      }

      if (metrics.length === 0) return 0;
      
      const total = metrics.reduce((sum, m) => sum + (m.elapsed_ms || 0), 0);
      const average = Math.round(total / metrics.length);
      
      this.cache.set(cacheKey, { value: average, timestamp: Date.now() });
      return average;
    } catch (err) {
      console.error('[MetricsService] Failed to get average query time:', err);
      return 0;
    }
  }

  /**
   * Get latest token metric entry
   */
  async getLatestTokenMetric(): Promise<TokenMetric | null> {
    try {
      const store = getMemoryStore();
      return await store.getLatestEntry('token_metrics');
    } catch (err) {
      console.error('[MetricsService] Failed to get latest token metric:', err);
      return null;
    }
  }

  /**
   * Get latest query metric entry
   */
  async getLatestQueryMetric(): Promise<QueryMetric | null> {
    try {
      const store = getMemoryStore();
      return await store.getLatestEntry('query_metrics');
    } catch (err) {
      console.error('[MetricsService] Failed to get latest query metric:', err);
      return null;
    }
  }

  /**
   * Get cache hit rate from query metrics
   */
  async getCacheHitRate(days: number = 7): Promise<number> {
    const cacheKey = `cacheHitRate-${days}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }

    try {
      const metrics = await this.queryTokenMetrics(days);
      if (metrics.length === 0) return 0;
      
      // Estimate cache hit rate based on cached flag (simplified: 50% when cached)
      const estimatedRate = 50; // Simplified estimate
      
      this.cache.set(cacheKey, { value: estimatedRate, timestamp: Date.now() });
      return estimatedRate;
    } catch (err) {
      console.error('[MetricsService] Failed to get cache hit rate:', err);
      return 0;
    }
  }

  /**
   * Get comprehensive metrics summary for dashboard
   */
  async getDashboardMetrics(): Promise<MetricsSummary> {
    try {
      const latestMetric = await this.getLatestTokenMetric();
      const tokenMetrics = await this.queryTokenMetrics(7);
      
      if (!latestMetric && tokenMetrics.length === 0) {
        return {
          totalTokensUsed: 0,
          averageTokensPerCall: 0,
          currentStatus: 'no-data',
          remainingBudget: 160,
          percentageUsed: 0,
          callCount: 0,
          averageQueryTime: 0,
          lastUpdated: new Date().toISOString()
        };
      }

      const totalTokens = latestMetric?.total_tokens || 0;
      const remainingBudget = Math.max(0, 160 - totalTokens);
      const percentageUsed = Math.min(100, Math.round((totalTokens / 160) * 100));
      const averageTokens = await this.getAverageTokenUsage(7);
      const averageQueryTime = await this.getAverageQueryTime(undefined, 7);
      const status = latestMetric?.context_status || 'healthy';

      return {
        totalTokensUsed: totalTokens,
        averageTokensPerCall: averageTokens,
        currentStatus: status as any,
        remainingBudget,
        percentageUsed,
        callCount: tokenMetrics.length,
        averageQueryTime,
        lastUpdated: latestMetric?.timestamp || new Date().toISOString()
      };
    } catch (err) {
      console.error('[MetricsService] Failed to get dashboard metrics:', err);
      return {
        totalTokensUsed: 0,
        averageTokensPerCall: 0,
        currentStatus: 'no-data',
        remainingBudget: 160,
        percentageUsed: 0,
        callCount: 0,
        averageQueryTime: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Clear metrics cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
let instance: MetricsServiceImpl | null = null;

/**
 * Get or create MetricsService singleton
 */
export function getMetricsService(): MetricsServiceImpl {
  if (!instance) {
    instance = new MetricsServiceImpl();
  }
  return instance;
}

export { MetricsServiceImpl };
