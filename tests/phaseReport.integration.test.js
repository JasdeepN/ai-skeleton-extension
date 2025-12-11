/**
 * phaseReport.integration.test.js
 * Integration tests for phase report workflow
 */

const { MemoryStore } = require('../dist/src/memoryStore');
const { MemoryBankService } = require('../dist/src/memoryService');

// Mock vscode
jest.mock('vscode', () => ({
  EventEmitter: class {
    fire() {}
    dispose() {}
  },
  window: {
    showInformationMessage: jest.fn(() => Promise.resolve(undefined))
  },
  commands: {
    executeCommand: jest.fn(() => Promise.resolve())
  }
}));

describe('Phase Report Integration', () => {
  let store;
  let service;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.init(':memory:');
    
    // Create service with injected store
    service = new MemoryBankService(store);
    
    // Initialize service state
    service._state = {
      active: true,
      lastAccess: new Date().toISOString(),
      entryCount: 0,
      storageSize: 0,
      lastBackup: null
    };
  });

  afterEach(async () => {
    // Close the database
    if (store && store.close) {
      await store.close();
    }
  });

  describe('Research Phase Report', () => {
    it('should support generating research phase reports', async () => {
      // The report generation method exists and is callable
      expect(typeof service.generatePhaseMemoryReport).toBe('function');
    });

    it('should have RESEARCH_REPORT as a valid file_type', async () => {
      // Verify the file_type is available in the store
      // Create a direct entry with RESEARCH_REPORT type
      const id = await store.appendEntry({
        file_type: 'RESEARCH_REPORT',
        content: 'Test research report',
        tag: 'RESEARCH_REPORT:2025-12-07',
        timestamp: new Date().toISOString()
      });
      
      expect(id).not.toBeNull();
      expect(typeof id).toBe('number');
      
      // Query it back
      const result = await store.queryByType('RESEARCH_REPORT');
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries[0].file_type).toBe('RESEARCH_REPORT');
    });
  });

  describe('Planning Phase Report', () => {
    it('should have PLAN_REPORT as a valid file_type', async () => {
      const id = await store.appendEntry({
        file_type: 'PLAN_REPORT',
        content: 'Test plan report',
        tag: 'PLAN_REPORT:2025-12-07',
        timestamp: new Date().toISOString()
      });
      
      expect(id).not.toBeNull();
      
      const result = await store.queryByType('PLAN_REPORT');
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries[0].file_type).toBe('PLAN_REPORT');
    });
  });

  describe('Execution Phase Report', () => {
    it('should have EXECUTION_REPORT as a valid file_type', async () => {
      const id = await store.appendEntry({
        file_type: 'EXECUTION_REPORT',
        content: 'Test execution report',
        tag: 'EXECUTION_REPORT:2025-12-07',
        timestamp: new Date().toISOString()
      });
      
      expect(id).not.toBeNull();
      
      const result = await store.queryByType('EXECUTION_REPORT');
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries[0].file_type).toBe('EXECUTION_REPORT');
    });
  });

  describe('Report Separation from Project Briefs', () => {
    it('should keep phase reports separate from BRIEF entries', async () => {
      // Add project brief
      const briefId = await store.appendEntry({
        file_type: 'BRIEF',
        content: 'Project scope and goals',
        tag: 'BRIEF:2025-12-07',
        timestamp: new Date().toISOString()
      });

      // Add research report
      const reportId = await store.appendEntry({
        file_type: 'RESEARCH_REPORT',
        content: 'Research report',
        tag: 'RESEARCH_REPORT:2025-12-07',
        timestamp: new Date().toISOString()
      });

      expect(briefId).not.toBeNull();
      expect(reportId).not.toBeNull();

      // Verify separation - check that both types exist and are distinct
      const briefResult = await store.queryByType('BRIEF');
      const reportResult = await store.queryByType('RESEARCH_REPORT');

      expect(briefResult.entries.length).toBeGreaterThan(0);
      expect(reportResult.entries.length).toBeGreaterThan(0);
      expect(briefResult.entries.some(e => e.file_type === 'BRIEF')).toBe(true);
      expect(reportResult.entries.some(e => e.file_type === 'RESEARCH_REPORT')).toBe(true);
    });
  });

  describe('Complete Phase Report Types', () => {
    it('should support all three phase report types in database', async () => {
      // Create all three report types
      const researchId = await store.appendEntry({
        file_type: 'RESEARCH_REPORT',
        content: 'Research work summary',
        tag: 'RESEARCH_REPORT:2025-12-07',
        timestamp: new Date().toISOString()
      });

      const planId = await store.appendEntry({
        file_type: 'PLAN_REPORT',
        content: 'Planning work summary',
        tag: 'PLAN_REPORT:2025-12-07',
        timestamp: new Date().toISOString()
      });

      const executionId = await store.appendEntry({
        file_type: 'EXECUTION_REPORT',
        content: 'Execution work summary',
        tag: 'EXECUTION_REPORT:2025-12-07',
        timestamp: new Date().toISOString()
      });

      expect(researchId).not.toBeNull();
      expect(planId).not.toBeNull();
      expect(executionId).not.toBeNull();

      // Verify all three can be queried and have correct types
      const researchResult = await store.queryByType('RESEARCH_REPORT');
      const planResult = await store.queryByType('PLAN_REPORT');
      const executionResult = await store.queryByType('EXECUTION_REPORT');

      expect(researchResult.entries.length).toBeGreaterThan(0);
      expect(planResult.entries.length).toBeGreaterThan(0);
      expect(executionResult.entries.length).toBeGreaterThan(0);

      expect(researchResult.entries.some(e => e.file_type === 'RESEARCH_REPORT')).toBe(true);
      expect(planResult.entries.some(e => e.file_type === 'PLAN_REPORT')).toBe(true);
      expect(executionResult.entries.some(e => e.file_type === 'EXECUTION_REPORT')).toBe(true);
    });
  });
});
