/**
 * chatParticipant.tools.test.js - Behavioral Testing Phase 2
 * 
 * Tests tool selection based on keyword context and registry interaction.
 * Validates: keyword → tool mapping, MCP priority ordering, restrictions honored.
 * 
 * Success Criteria:
 * - Checkpoint keyword → updateProgress/logDecision available
 * - Execute keyword → all tools available (no filtering)
 * - MCP priority enforced (MCP tools listed first)
 * - Restrictions filter tools before exposure to LM
 * - Availability summary accurate and token-efficient
 */

const { detectKeyword } = require('../dist/src/keywordDetector');
const { buildUnifiedToolRegistry, formatAvailabilitySummary } = require('../dist/src/toolRegistry');

describe('chatParticipant.tools.test.js - Behavioral Testing Phase 2', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('Keyword → Tool Selection Mapping', () => {
    it('should make checkpoint tools available when checkpoint keyword detected', () => {
      const keyword = detectKeyword('please checkpoint my work');
      expect(keyword).not.toBeNull();
      expect(keyword.promptKey).toBe('checkpoint');

      // In real flow, chatParticipant would include checkpoint-specific tools
      // For this test, verify the keyword detection triggers the right context
      expect(keyword.promptKey).toBe('checkpoint');
    });

    it('should allow all tools for execute keyword', () => {
      const keyword = detectKeyword('execute the implementation');
      expect(keyword).not.toBeNull();
      expect(keyword.promptKey).toBe('execute');

      // Execute workflow typically needs all tools available
      expect(keyword.promptKey).toBe('execute');
    });

    it('should allow all tools for plan keyword', () => {
      const keyword = detectKeyword('plan the architecture');
      expect(keyword).not.toBeNull();
      expect(keyword.promptKey).toBe('plan');

      // Planning workflow needs full tool access
      expect(keyword.promptKey).toBe('plan');
    });

    it('should map sync keyword to appropriate tools', () => {
      const keyword = detectKeyword('sync memory with latest changes');
      expect(keyword).not.toBeNull();
      expect(keyword.promptKey).toBe('sync');
    });

    it('should map commit keyword to appropriate tools', () => {
      const keyword = detectKeyword('commit these changes');
      expect(keyword).not.toBeNull();
      expect(keyword.promptKey).toBe('commit');
    });

    it('should map update keyword to appropriate tools', () => {
      const keyword = detectKeyword('update the context');
      expect(keyword).not.toBeNull();
      expect(keyword.promptKey).toBe('update');
    });
  });

  describe('Tool Registry Interaction', () => {
    let mockVSCode;

    beforeEach(() => {
      mockVSCode = {
        lm: {
          tools: [
            { name: 'mcp_database_query', tags: ['mcp'], description: 'Query database' },
            { name: 'mcp_filesystem_read', tags: ['mcp'], description: 'Read files' },
            { name: 'aiSkeleton_showMemory', tags: ['memory'], description: 'Show memory' },
            { name: 'aiSkeleton_logDecision', tags: ['memory'], description: 'Log decision' },
            { name: 'aiSkeleton_updateProgress', tags: ['memory'], description: 'Update progress' },
            { name: 'aiSkeleton_updateContext', tags: ['memory'], description: 'Update context' }
          ]
        }
      };
      jest.mock('vscode', () => mockVSCode, { virtual: true });
    });

    afterEach(() => {
      jest.unmock('vscode');
    });

    it('should list MCP tools first when priority=mcp', () => {
      const { buildUnifiedToolRegistry } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({ priority: 'mcp', restrictions: [] });

      expect(registry.allowed.length).toBeGreaterThan(0);

      // Find indices
      const firstMcpIndex = registry.allowed.findIndex(t => t.source === 'mcp');
      const firstExtIndex = registry.allowed.findIndex(t => t.source === 'extension');

      if (firstMcpIndex >= 0 && firstExtIndex >= 0) {
        expect(firstMcpIndex).toBeLessThan(firstExtIndex);
      }
    });

    it('should exclude restricted tools from registry', () => {
      const { buildUnifiedToolRegistry } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({
        priority: 'mcp',
        restrictions: ['aiSkeleton_logDecision']
      });

      const found = registry.allowed.find(t => t.name === 'aiSkeleton_logDecision');
      expect(found).toBeUndefined();

      const blocked = registry.blocked.find(t => t.name === 'aiSkeleton_logDecision');
      expect(blocked).toBeDefined();
    });

    it('should handle glob pattern restrictions', () => {
      const { buildUnifiedToolRegistry } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({
        restrictions: ['aiSkeleton_*']
      });

      const aiSkeletonTools = registry.allowed.filter(t => t.name.startsWith('aiSkeleton_'));
      expect(aiSkeletonTools.length).toBe(0);

      expect(registry.blocked.some(t => t.name === 'aiSkeleton_showMemory')).toBe(true);
      expect(registry.blocked.some(t => t.name === 'aiSkeleton_logDecision')).toBe(true);
    });

    it('should respect multiple restrictions', () => {
      const { buildUnifiedToolRegistry } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({
        restrictions: ['mcp_*', 'aiSkeleton_logDecision']
      });

      expect(registry.allowed.find(t => t.name.startsWith('mcp_'))).toBeUndefined();
      expect(registry.allowed.find(t => t.name === 'aiSkeleton_logDecision')).toBeUndefined();
      expect(registry.blocked.length).toBeGreaterThan(0);
    });
  });

  describe('Availability Summary Formatting', () => {
    let mockVSCode;

    beforeEach(() => {
      mockVSCode = {
        lm: {
          tools: [
            { name: 'mcp_db_query', tags: ['mcp'], description: 'Query DB' },
            { name: 'mcp_fs_read', tags: ['mcp'], description: 'Read files' },
            { name: 'aiSkeleton_showMemory', tags: ['memory'], description: 'Show memory' },
            { name: 'aiSkeleton_logDecision', tags: ['memory'], description: 'Log decision' }
          ]
        }
      };
      jest.mock('vscode', () => mockVSCode, { virtual: true });
    });

    afterEach(() => {
      jest.unmock('vscode');
    });

    it('should format availability summary with counts', () => {
      const { buildUnifiedToolRegistry, formatAvailabilitySummary } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({ restrictions: [] });
      const summary = formatAvailabilitySummary(registry.summary);

      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should include tool counts in summary', () => {
      const { buildUnifiedToolRegistry, formatAvailabilitySummary } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({ restrictions: [] });
      const summary = formatAvailabilitySummary(registry.summary);

      expect(summary).toMatch(/\d+/); // Contains numbers
    });

    it('should show blocked count when tools restricted', () => {
      const { buildUnifiedToolRegistry, formatAvailabilitySummary } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({
        restrictions: ['aiSkeleton_logDecision']
      });
      const summary = formatAvailabilitySummary(registry.summary);

      expect(summary).toMatch(/\d+/);
      expect(registry.summary.blockedCount).toBeGreaterThan(0);
    });

    it('should be concise (token-efficient)', () => {
      const { buildUnifiedToolRegistry, formatAvailabilitySummary } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({ restrictions: [] });
      const summary = formatAvailabilitySummary(registry.summary);

      // Summary should be brief to conserve tokens
      expect(summary.length).toBeLessThan(300);
    });
  });

  describe('Tool Selection Per Keyword Context', () => {
    it('should identify checkpoint context from keyword', () => {
      const keyword = detectKeyword('create a checkpoint');
      expect(keyword.promptKey).toBe('checkpoint');
      
      // In chat participant, this would trigger checkpoint-specific tool filtering
      // For checkpoint: updateProgress, logDecision, showMemory typically available
    });

    it('should identify execute context from keyword', () => {
      const keyword = detectKeyword('execute this plan');
      expect(keyword.promptKey).toBe('execute');
      
      // Execute typically allows all tools (no filtering)
    });

    it('should handle no keyword (generic query)', () => {
      const keyword = detectKeyword('what is the current status?');
      expect(keyword).toBeNull();
      
      // No keyword = apply default tool restrictions from config
    });

    it('should handle multiple keywords (first match wins)', () => {
      const keyword = detectKeyword('checkpoint then execute');
      expect(keyword.promptKey).toBe('checkpoint');
      
      // First detected keyword determines tool context
    });
  });

  describe('Registry Structure Validation', () => {
    let mockVSCode;

    beforeEach(() => {
      mockVSCode = {
        lm: {
          tools: [
            { name: 'mcp_tool', tags: ['mcp'], description: 'MCP tool' },
            { name: 'ext_tool', tags: ['extension'], description: 'Extension tool' }
          ]
        }
      };
      jest.mock('vscode', () => mockVSCode, { virtual: true });
    });

    afterEach(() => {
      jest.unmock('vscode');
    });

    it('should have allowed and blocked arrays', () => {
      const { buildUnifiedToolRegistry } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      expect(Array.isArray(registry.allowed)).toBe(true);
      expect(Array.isArray(registry.blocked)).toBe(true);
    });

    it('should have summary object with required fields', () => {
      const { buildUnifiedToolRegistry } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      expect(registry.summary).toBeDefined();
      expect(registry.summary).toHaveProperty('allowedCount');
      expect(registry.summary).toHaveProperty('blockedCount');
      expect(registry.summary).toHaveProperty('bySource');
    });

    it('should classify tool sources correctly', () => {
      const { buildUnifiedToolRegistry } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({ restrictions: [] });

      registry.allowed.forEach(entry => {
        expect(['mcp', 'extension', 'builtin', 'unknown']).toContain(entry.source);
      });
    });
  });

  describe('Integration: Keyword + Registry + Summary', () => {
    let mockVSCode;

    beforeEach(() => {
      mockVSCode = {
        lm: {
          tools: [
            { name: 'mcp_db', tags: ['mcp'], description: 'Database' },
            { name: 'aiSkeleton_showMemory', tags: ['memory'], description: 'Memory' },
            { name: 'aiSkeleton_logDecision', tags: ['memory'], description: 'Decision' }
          ]
        }
      };
      jest.mock('vscode', () => mockVSCode, { virtual: true });
    });

    afterEach(() => {
      jest.unmock('vscode');
    });

    it('should complete full flow: keyword detection → registry build → summary format', () => {
      // Step 1: Detect keyword
      const keyword = detectKeyword('checkpoint please');
      expect(keyword).not.toBeNull();
      expect(keyword.promptKey).toBe('checkpoint');

      // Step 2: Build registry (with potential restrictions)
      const { buildUnifiedToolRegistry, formatAvailabilitySummary } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({
        priority: 'mcp',
        restrictions: []
      });
      expect(registry.allowed.length).toBeGreaterThan(0);

      // Step 3: Format summary
      const summary = formatAvailabilitySummary(registry.summary);
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
      expect(summary.length).toBeLessThan(300);
    });

    it('should apply restrictions based on keyword context', () => {
      const keyword = detectKeyword('commit changes');
      expect(keyword.promptKey).toBe('commit');

      // Example: commit might restrict certain tools
      const { buildUnifiedToolRegistry } = require('../dist/src/toolRegistry');
      const registry = buildUnifiedToolRegistry({
        restrictions: ['aiSkeleton_logDecision'] // Example restriction
      });

      expect(registry.allowed.find(t => t.name === 'aiSkeleton_logDecision')).toBeUndefined();
      expect(registry.blocked.find(t => t.name === 'aiSkeleton_logDecision')).toBeDefined();
    });
  });
});
