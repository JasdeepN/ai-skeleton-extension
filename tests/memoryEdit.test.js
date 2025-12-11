const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock MemoryStore for testing (simulates the actual implementation)
class MockMemoryStore {
  constructor() {
    this.entries = [];
    this.nextId = 1;
    this.isInitialized = false;
  }

  async init() {
    this.isInitialized = true;
    return true;
  }

  async appendEntry(entry) {
    if (!this.isInitialized) return null;
    const id = this.nextId++;
    this.entries.push({ ...entry, id });
    return id;
  }

  async updateEntry(id, updates) {
    if (!this.isInitialized) return false;
    const entry = this.entries.find(e => e.id === id);
    if (!entry) return false;

    const hasUpdates = Object.keys(updates).some(key => updates[key] !== undefined);
    if (!hasUpdates) return false;

    Object.assign(entry, updates);
    return true;
  }

  async queryByType(fileType, limit = 50) {
    const filtered = this.entries
      .filter(e => e.file_type === fileType)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
    
    return { entries: filtered, count: filtered.length };
  }
}

// Mock MemoryBankService for testing
class MockMemoryBankService {
  constructor(store) {
    this._store = store;
    this._state = { active: false };
  }

  async detectMemoryBank() {
    this._state.active = true;
  }

  async editEntry(id, updates) {
    if (!this._state.active) {
      console.error('[MemoryService] Cannot edit entry: memory bank not active');
      return false;
    }

    try {
      const success = await this._store.updateEntry(id, updates);
      if (success) {
        console.log(`[MemoryService] Edited entry ${id}`);
      }
      return success;
    } catch (err) {
      console.error('[MemoryService] Edit entry failed:', err);
      return false;
    }
  }

  async appendToEntry(id, additionalContent) {
    if (!this._state.active) {
      console.error('[MemoryService] Cannot append to entry: memory bank not active');
      return false;
    }

    try {
      // Find the entry by searching all types
      const types = ['DECISION', 'CONTEXT', 'PROGRESS', 'PATTERN', 'BRIEF'];
      let entry = null;
      
      for (const type of types) {
        const result = await this._store.queryByType(type, 1000);
        entry = result.entries.find(e => e.id === id);
        if (entry) break;
      }

      if (!entry) {
        console.error(`[MemoryService] Entry ${id} not found`);
        return false;
      }

      // Append new content with timestamp marker
      const timestamp = new Date().toISOString().split('T')[0];
      const updatedContent = `${entry.content}\n\n---\n\n**[Updated ${timestamp}]** ${additionalContent}`;
      
      return this.editEntry(id, { content: updatedContent });
    } catch (err) {
      console.error('[MemoryService] Append to entry failed:', err);
      return false;
    }
  }
}

describe('Memory Entry Editing', () => {
  let store;
  let service;
  let tempDir;
  let tempDbPath;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-edit-test-'));
    tempDbPath = path.join(tempDir, 'test-edit.db');
  });

  afterAll(() => {
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  beforeEach(async () => {
    // Fresh mock store for each test
    store = new MockMemoryStore();
    await store.init();
    service = new MockMemoryBankService(store);
    await service.detectMemoryBank();
  });

  describe('MemoryStore.updateEntry', () => {
    test('should update entry content', async () => {
      // Append initial entry
      const entryId = await store.appendEntry({
        file_type: 'DECISION',
        tag: '[DECISION:2025-12-07]',
        content: 'Original decision text',
        timestamp: new Date().toISOString(),
        phase: 'research'
      });

      expect(entryId).not.toBeNull();

      // Update the content
      const updated = await store.updateEntry(entryId, {
        content: 'Updated decision text'
      });

      expect(updated).toBe(true);

      // Verify the update
      const result = await store.queryByType('DECISION', 10);
      const entry = result.entries.find(e => e.id === entryId);
      expect(entry.content).toBe('Updated decision text');
    });

    test('should update entry tag', async () => {
      const entryId = await store.appendEntry({
        file_type: 'CONTEXT',
        tag: '[CONTEXT:OLD]',
        content: 'Some context',
        timestamp: new Date().toISOString()
      });

      const updated = await store.updateEntry(entryId, {
        tag: '[CONTEXT:NEW]'
      });

      expect(updated).toBe(true);

      const result = await store.queryByType('CONTEXT', 10);
      const entry = result.entries.find(e => e.id === entryId);
      expect(entry.tag).toBe('[CONTEXT:NEW]');
    });

    test('should update entry phase', async () => {
      const entryId = await store.appendEntry({
        file_type: 'PROGRESS',
        tag: '[PROGRESS:2025-12-07]',
        content: 'Progress update',
        timestamp: new Date().toISOString(),
        phase: 'research'
      });

      const updated = await store.updateEntry(entryId, {
        phase: 'planning'
      });

      expect(updated).toBe(true);

      const result = await store.queryByType('PROGRESS', 10);
      const entry = result.entries.find(e => e.id === entryId);
      expect(entry.phase).toBe('planning');
    });

    test('should update entry progress status', async () => {
      const entryId = await store.appendEntry({
        file_type: 'BRIEF',
        tag: '[BRIEF:2025-12-07]',
        content: 'Brief content',
        timestamp: new Date().toISOString(),
        progress_status: 'draft'
      });

      const updated = await store.updateEntry(entryId, {
        progress_status: 'done'
      });

      expect(updated).toBe(true);

      const result = await store.queryByType('BRIEF', 10);
      const entry = result.entries.find(e => e.id === entryId);
      expect(entry.progress_status).toBe('done');
    });

    test('should update multiple fields at once', async () => {
      const entryId = await store.appendEntry({
        file_type: 'PATTERN',
        tag: '[PATTERN:OLD]',
        content: 'Old pattern',
        timestamp: new Date().toISOString(),
        phase: 'research',
        progress_status: 'draft'
      });

      const updated = await store.updateEntry(entryId, {
        content: 'New pattern',
        tag: '[PATTERN:NEW]',
        phase: 'planning',
        progress_status: 'done'
      });

      expect(updated).toBe(true);

      const result = await store.queryByType('PATTERN', 10);
      const entry = result.entries.find(e => e.id === entryId);
      expect(entry.content).toBe('New pattern');
      expect(entry.tag).toBe('[PATTERN:NEW]');
      expect(entry.phase).toBe('planning');
      expect(entry.progress_status).toBe('done');
    });

    test('should return false if entry does not exist', async () => {
      const updated = await store.updateEntry(99999, {
        content: 'This should fail'
      });

      expect(updated).toBe(false);
    });

    test('should return false if nothing to update', async () => {
      const entryId = await store.appendEntry({
        file_type: 'DECISION',
        tag: '[DECISION:2025-12-07]',
        content: 'Decision',
        timestamp: new Date().toISOString()
      });

      const updated = await store.updateEntry(entryId, {});
      expect(updated).toBe(false);
    });

    test('should handle null/undefined updates gracefully', async () => {
      const entryId = await store.appendEntry({
        file_type: 'CONTEXT',
        tag: '[CONTEXT:2025-12-07]',
        content: 'Original',
        timestamp: new Date().toISOString()
      });

      // Try to update with undefined - should not crash
      const updated = await store.updateEntry(entryId, {
        content: undefined
      });

      // Should be false since content is undefined (not a valid update)
      expect(updated).toBe(false);
    });
  });

  describe('MemoryBankService.editEntry', () => {
    test('should edit entry via service', async () => {
      const entryId = await store.appendEntry({
        file_type: 'DECISION',
        tag: '[DECISION:2025-12-07]',
        content: 'Original',
        timestamp: new Date().toISOString()
      });

      const success = await service.editEntry(entryId, {
        content: 'Updated via service'
      });

      expect(success).toBe(true);

      const result = await store.queryByType('DECISION', 10);
      const entry = result.entries.find(e => e.id === entryId);
      expect(entry.content).toBe('Updated via service');
    });

    test('should fail if memory bank not active', async () => {
      const inactiveService = new MockMemoryBankService(store);
      const success = await inactiveService.editEntry(1, {
        content: 'Should fail'
      });

      expect(success).toBe(false);
    });
  });

  describe('MemoryBankService.appendToEntry', () => {
    test('should append content to existing entry', async () => {
      const entryId = await store.appendEntry({
        file_type: 'CONTEXT',
        tag: '[CONTEXT:2025-12-07]',
        content: 'Original findings',
        timestamp: new Date().toISOString(),
        phase: 'research'
      });

      const today = new Date().toISOString().split('T')[0];
      const success = await service.appendToEntry(
        entryId,
        'Additional findings discovered during execution'
      );

      expect(success).toBe(true);

      const result = await store.queryByType('CONTEXT', 10);
      const entry = result.entries.find(e => e.id === entryId);
      
      // Should contain both original and appended content
      expect(entry.content).toContain('Original findings');
      expect(entry.content).toContain('Additional findings discovered during execution');
      expect(entry.content).toContain(`[Updated ${today}]`);
      expect(entry.content).toContain('---'); // Separator marker
    });

    test('should preserve entry phase when appending', async () => {
      const entryId = await store.appendEntry({
        file_type: 'DECISION',
        tag: '[DECISION:2025-12-07]',
        content: 'Original decision',
        timestamp: new Date().toISOString(),
        phase: 'research'
      });

      await service.appendToEntry(entryId, 'Additional notes');

      const result = await store.queryByType('DECISION', 10);
      const entry = result.entries.find(e => e.id === entryId);
      expect(entry.phase).toBe('research');
    });

    test('should fail if entry not found', async () => {
      const success = await service.appendToEntry(99999, 'This should fail');
      expect(success).toBe(false);
    });

    test('should fail if memory bank not active', async () => {
      const inactiveService = new MockMemoryBankService(store);
      const success = await inactiveService.appendToEntry(1, 'Should fail');
      expect(success).toBe(false);
    });

    test('should append to any entry type', async () => {
      // Test with different entry types
      const types = ['DECISION', 'CONTEXT', 'PROGRESS', 'PATTERN'];

      for (const type of types) {
        const entryId = await store.appendEntry({
          file_type: type,
          tag: `[${type}:2025-12-07]`,
          content: `Original ${type}`,
          timestamp: new Date().toISOString()
        });

        const success = await service.appendToEntry(entryId, `Appended to ${type}`);
        expect(success).toBe(true);

        const result = await store.queryByType(type, 10);
        const entry = result.entries.find(e => e.id === entryId);
        expect(entry.content).toContain(`Appended to ${type}`);
      }
    });
  });

  describe('Edit workflow scenarios', () => {
    test('should support research correction during planning', async () => {
      // Append research entry
      const researchId = await store.appendEntry({
        file_type: 'DECISION',
        tag: '[DECISION:2025-12-07]',
        content: 'Use approach A',
        timestamp: new Date().toISOString(),
        phase: 'research'
      });

      // Later during planning, discover approach B is better
      const today = new Date().toISOString().split('T')[0];
      const success = await service.appendToEntry(
        researchId,
        'Revised during planning: Approach B is more efficient'
      );

      expect(success).toBe(true);

      const result = await store.queryByType('DECISION', 10);
      const entry = result.entries.find(e => e.id === researchId);
      expect(entry.content).toContain('Use approach A');
      expect(entry.content).toContain('Approach B is more efficient');
      expect(entry.content).toContain(`[Updated ${today}]`);
    });

    test('should support full content replacement for corrections', async () => {
      const entryId = await store.appendEntry({
        file_type: 'CONTEXT',
        tag: '[CONTEXT:2025-12-07]',
        content: 'Wrong assumption here',
        timestamp: new Date().toISOString()
      });

      // Use editEntry for full replacement (not append)
      const success = await service.editEntry(entryId, {
        content: 'Correct understanding here'
      });

      expect(success).toBe(true);

      const result = await store.queryByType('CONTEXT', 10);
      const entry = result.entries.find(e => e.id === entryId);
      expect(entry.content).toBe('Correct understanding here');
      expect(entry.content).not.toContain('Wrong assumption');
    });

    test('should support phase migration for entries', async () => {
      const entryId = await store.appendEntry({
        file_type: 'PROGRESS',
        tag: '[PROGRESS:2025-12-07]',
        content: 'Task found during execution',
        timestamp: new Date().toISOString(),
        phase: 'execution'
      });

      // Move to research phase for further analysis
      const success = await service.editEntry(entryId, {
        phase: 'research'
      });

      expect(success).toBe(true);

      const result = await store.queryByType('PROGRESS', 10);
      const entry = result.entries.find(e => e.id === entryId);
      expect(entry.phase).toBe('research');
    });
  });
});
