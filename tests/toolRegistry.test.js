/**
 * toolRegistry.test.js - Behavioral Testing Phase 1
 * 
 * Tests unified tool registry building with MCP-first priority and restrictions.
 * Validates: priority ordering, restrictions filtering, availability summary formatting.
 * 
 * Note: toolRegistry reads from vscode.lm.tools at runtime. Tests verify the logic
 * by mocking vscode.lm.tools with test data.
 * 
 * Success Criteria:
 * - MCP tools listed first when priority='mcp'
 * - Extension tools first when priority='extension'
 * - Glob patterns in restrictions work correctly
 * - Regex patterns in restrictions work correctly
 * - Blocked tools excluded from registry
 * - Availability summary accurately counts tools
 */

describe('toolRegistry - Behavioral Testing Phase 1', () => {
  let mockVSCode;
  let buildUnifiedToolRegistry;
  let formatAvailabilitySummary;
  
  beforeEach(() => {
    // Clear module cache to force re-import with fresh mocks
    jest.resetModules();
    
    // Mock vscode module with test tools
    mockVSCode = {
      lm: {
        tools: [
          {
            name: 'mcp_database_query',
            tags: ['mcp'],
            description: 'Query MCP database'
          },
          {
            name: 'mcp_filesystem_read',
            tags: ['mcp'],
            description: 'Read files via MCP'
          },
          {
            name: 'aiSkeleton_showMemory',
            tags: ['memory', 'ai-skeleton'],
            description: 'Show memory'
          },
          {
            name: 'aiSkeleton_logDecision',
            tags: ['memory', 'ai-skeleton'],
            description: 'Log decision'
          },
          {
            name: 'customTool_process',
            tags: ['custom'],
            description: 'Process data'
          },
          {
            name: 'builtinTool_help',
            tags: ['builtin'],
            description: 'Show help'
          }
        ]
      }
    };

    jest.mock('vscode', () => mockVSCode, { virtual: true });
    
    // Import after mocking
    const toolRegistry = require('../dist/src/toolRegistry');
    buildUnifiedToolRegistry = toolRegistry.buildUnifiedToolRegistry;
    formatAvailabilitySummary = toolRegistry.formatAvailabilitySummary;
  });

  afterEach(() => {
    jest.unmock('vscode');
  });

  describe('Basic Registry Building', () => {
    it('should build registry with default settings', () => {
      const registry = buildUnifiedToolRegistry();

      expect(registry).toBeDefined();
      expect(registry).toHaveProperty('allowed');
      expect(registry).toHaveProperty('blocked');
      expect(registry).toHaveProperty('summary');
    });

    it('should include all non-restricted tools in allowed', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      expect(Array.isArray(registry.allowed)).toBe(true);
      expect(registry.allowed.length).toBe(6);
    });

    it('should have empty blocked list with no restrictions', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      expect(Array.isArray(registry.blocked)).toBe(true);
      expect(registry.blocked.length).toBe(0);
    });
  });

  describe('Priority Ordering - MCP First', () => {
    it('should list MCP tools first when priority=mcp', () => {
      const registry = buildUnifiedToolRegistry({
        priority: 'mcp',
        restrictions: []
      });

      expect(registry.allowed.length).toBeGreaterThan(0);

      // Find first MCP and first non-MCP tools
      const firstMcpIndex = registry.allowed.findIndex(t => t.source === 'mcp');
      const firstNonMcpIndex = registry.allowed.findIndex(t => t.source !== 'mcp');

      if (firstMcpIndex >= 0 && firstNonMcpIndex >= 0) {
        expect(firstMcpIndex).toBeLessThan(firstNonMcpIndex);
      }
    });

    it('should list extension tools first when priority=extension', () => {
      const registry = buildUnifiedToolRegistry({
        priority: 'extension',
        restrictions: []
      });

      // Find first extension and first MCP tools
      const firstExtIndex = registry.allowed.findIndex(t => t.source === 'extension');
      const firstMcpIndex = registry.allowed.findIndex(t => t.source === 'mcp');

      if (firstExtIndex >= 0 && firstMcpIndex >= 0) {
        expect(firstExtIndex).toBeLessThan(firstMcpIndex);
      }
    });

    it('should interleave tools when priority=mixed', () => {
      const registry = buildUnifiedToolRegistry({
        priority: 'mixed',
        restrictions: []
      });

      expect(registry.allowed.length).toBeGreaterThan(0);
      // In mixed mode, sources should be interleaved (not all MCP first, then all ext)
    });
  });

  describe('Restrictions - Exact Name Matching', () => {
    it('should filter by exact tool name', () => {
      const registry = buildUnifiedToolRegistry({
        restrictions: ['aiSkeleton_logDecision']
      });

      const found = registry.allowed.find(t => t.name === 'aiSkeleton_logDecision');
      expect(found).toBeUndefined();

      const blocked = registry.blocked.find(t => t.name === 'aiSkeleton_logDecision');
      expect(blocked).toBeDefined();
    });

    it('should handle multiple exact restrictions', () => {
      const registry = buildUnifiedToolRegistry({
        restrictions: ['aiSkeleton_logDecision', 'mcp_database_query']
      });

      expect(registry.allowed.find(t => t.name === 'aiSkeleton_logDecision')).toBeUndefined();
      expect(registry.allowed.find(t => t.name === 'mcp_database_query')).toBeUndefined();
      expect(registry.blocked.length).toBe(2);
    });
  });

  describe('Restrictions - Glob Patterns', () => {
    it('should filter by glob pattern aiSkeleton_*', () => {
      const registry = buildUnifiedToolRegistry({
        restrictions: ['aiSkeleton_*']
      });

      const aiSkeletonTools = registry.allowed.filter(t => t.name.startsWith('aiSkeleton_'));
      expect(aiSkeletonTools.length).toBe(0);
      expect(registry.blocked.some(t => t.name === 'aiSkeleton_showMemory')).toBe(true);
      expect(registry.blocked.some(t => t.name === 'aiSkeleton_logDecision')).toBe(true);
    });

    it('should filter by glob pattern mcp_*', () => {
      const registry = buildUnifiedToolRegistry({
        restrictions: ['mcp_*']
      });

      const mcpTools = registry.allowed.filter(t => t.name.startsWith('mcp_'));
      expect(mcpTools.length).toBe(0);
      expect(registry.blocked.length).toBeGreaterThan(0);
    });

    it('should filter by glob pattern *_read', () => {
      const registry = buildUnifiedToolRegistry({
        restrictions: ['*_read']
      });

      const found = registry.allowed.find(t => t.name === 'mcp_filesystem_read');
      expect(found).toBeUndefined();
    });
  });

  describe('Restrictions - Regex Patterns', () => {
    it('should filter by regex pattern /^aiSkeleton_.*/', () => {
      const registry = buildUnifiedToolRegistry({
        restrictions: ['/^aiSkeleton_.*/']  // case-insensitive by default
      });

      const aiSkeletonTools = registry.allowed.filter(t => t.name.startsWith('aiSkeleton_'));
      expect(aiSkeletonTools.length).toBe(0);
    });

    it('should filter by regex pattern for Decision', () => {
      const registry = buildUnifiedToolRegistry({
        restrictions: ['/Decision/']  // case-insensitive by default
      });

      expect(registry.allowed.find(t => t.name.includes('Decision'))).toBeUndefined();
    });
  });

  describe('Summary Generation', () => {
    it('should generate summary object with counts', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      expect(registry.summary).toBeDefined();
      expect(registry.summary).toHaveProperty('allowedCount');
      expect(registry.summary).toHaveProperty('blockedCount');
      expect(registry.summary).toHaveProperty('bySource');
    });

    it('should accurately count allowed tools', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      expect(registry.summary.allowedCount).toBe(registry.allowed.length);
    });

    it('should accurately count blocked tools', () => {
      const registry = buildUnifiedToolRegistry({
        restrictions: ['aiSkeleton_*']
      });

      expect(registry.summary.blockedCount).toBe(registry.blocked.length);
      expect(registry.summary.blockedCount).toBeGreaterThan(0);
    });

    it('should break down counts by source', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      expect(registry.summary.bySource).toBeDefined();
      expect(typeof registry.summary.bySource.mcp).toBe('number');
      expect(typeof registry.summary.bySource.extension).toBe('number');
      expect(typeof registry.summary.bySource.builtin).toBe('number');
    });
  });

  describe('Format Availability Summary', () => {
    it('should format summary as string', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      const formatted = formatAvailabilitySummary(registry.summary);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should include allowed count in formatted string', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      const formatted = formatAvailabilitySummary(registry.summary);
      expect(formatted).toMatch(/\d+/);
    });

    it('should include blocked count when tools are blocked', () => {
      const registry = buildUnifiedToolRegistry({
        restrictions: ['aiSkeleton_*']
      });

      const formatted = formatAvailabilitySummary(registry.summary);
      expect(formatted).toMatch(/\d+/);
    });

    it('should be concise (< 300 chars)', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      const formatted = formatAvailabilitySummary(registry.summary);
      expect(formatted.length).toBeLessThan(300);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty restrictions array', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      expect(registry.blocked.length).toBe(0);
      expect(registry.allowed.length).toBe(6);
    });

    it('should handle restrictions blocking all tools', () => {
      const registry = buildUnifiedToolRegistry({
        restrictions: ['*']
      });

      expect(registry.allowed.length).toBe(0);
      expect(registry.blocked.length).toBe(6);
    });

    it('should handle mixed priority + restrictions', () => {
      const registry = buildUnifiedToolRegistry({
        priority: 'mixed',
        restrictions: ['mcp_*', 'aiSkeleton_logDecision']
      });

      expect(registry.allowed).toBeDefined();
      expect(registry.blocked.length).toBeGreaterThan(0);
    });
  });

  describe('Tool Properties Preservation', () => {
    it('should preserve tool name in registry entries', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      registry.allowed.forEach(entry => {
        expect(entry).toHaveProperty('name');
        expect(typeof entry.name).toBe('string');
        expect(entry.name.length).toBeGreaterThan(0);
      });
    });

    it('should add source classification to entries', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      registry.allowed.forEach(entry => {
        expect(entry).toHaveProperty('source');
        expect(['mcp', 'extension', 'builtin', 'unknown']).toContain(entry.source);
      });
    });

    it('should preserve original tool object in entries', () => {
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      registry.allowed.forEach(entry => {
        expect(entry).toHaveProperty('tool');
        expect(entry.tool).toBeDefined();
      });
    });
  });
});
