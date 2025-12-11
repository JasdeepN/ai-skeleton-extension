const { exportSQLiteToMarkdown, createBackupMarkdown } = require('../dist/src/memoryExport');
const vscode = require('vscode');

// Simple helper to build a mock MemoryStore-like object
function createMockStore(entriesByType = {}) {
  return {
    queryByType: jest.fn(async (type) => ({
      entries: entriesByType[type] || [],
    })),
  };
}

describe('memoryExport', () => {
  const memoryPath = vscode.Uri.file('/mock/memory');

  beforeEach(() => {
    // Reset fs mocks before each test
    vscode.workspace.fs.createDirectory = jest.fn(() => Promise.resolve());
    vscode.workspace.fs.writeFile = jest.fn(() => Promise.resolve());
  });

  it('should export entries to memory.md with consolidated sections', async () => {
    const entriesByType = {
      BRIEF: [
        { tag: 'BRIEF:1', content: 'Project overview', timestamp: '2025-12-10T00:00:00Z', file_type: 'BRIEF' },
      ],
      PATTERN: [],
      CONTEXT: [
        { tag: 'CONTEXT:1', content: 'Context A', timestamp: '2025-12-10T01:00:00Z', file_type: 'CONTEXT' },
        { tag: 'CONTEXT:2', content: 'Context B', timestamp: '2025-12-10T02:00:00Z', file_type: 'CONTEXT' },
      ],
      DECISION: [],
      PROGRESS: [
        { tag: 'PROGRESS:1', content: 'Did something', timestamp: '2025-12-10T03:00:00Z', file_type: 'PROGRESS' },
      ],
    };

    const store = createMockStore(entriesByType);

    const result = await exportSQLiteToMarkdown(memoryPath, store);

    expect(result.success).toBe(true);
    expect(result.entriesExported).toBe(4);
    expect(result.filesExported).toContain('memory.md');
    expect(store.queryByType).toHaveBeenCalledTimes(5);
    expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledWith(memoryPath);

    // Validate written markdown content
    expect(vscode.workspace.fs.writeFile).toHaveBeenCalledTimes(1);
    const writeArgs = vscode.workspace.fs.writeFile.mock.calls[0];
    const writtenBuffer = writeArgs[1];
    const content = writtenBuffer.toString();
    expect(content).toContain('# AI-Memory Export');
    expect(content).toContain('## Project Brief');
    expect(content).toContain('[BRIEF:1] Project overview');
    expect(content).toContain('## Active Context');
    expect(content).toContain('[CONTEXT:1] Context A');
    expect(content).toContain('[PROGRESS:1] Did something');
  });

  it('should surface errors when directory creation fails', async () => {
    const error = new Error('disk failure');
    vscode.workspace.fs.createDirectory = jest.fn(() => Promise.reject(error));

    const store = createMockStore();
    const result = await exportSQLiteToMarkdown(memoryPath, store);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Failed to create directory');
    expect(result.entriesExported).toBe(0);
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
  });

  it('should create backup markdown in .backup directory', async () => {
    const store = createMockStore({
      BRIEF: [
        { tag: 'BRIEF:1', content: 'Backup entry', timestamp: '2025-12-10T00:00:00Z', file_type: 'BRIEF' },
      ],
    });

    const success = await createBackupMarkdown(memoryPath, store);

    expect(success).toBe(true);
    // Should create base backup folder and timestamped subfolder
    expect(vscode.workspace.fs.createDirectory).toHaveBeenCalled();
    expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
  });
});
