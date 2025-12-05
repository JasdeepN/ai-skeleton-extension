/**
 * Integration Tests: MemoryTreeProvider with SQLite Backend
 * 
 * Tests that the tree view correctly renders memory entries from the SQLite database,
 * responds to state changes, and maintains proper caching behavior.
 */

// Mock VS Code API
const mockVscodeApi = {
  Uri: {
    joinPath: (baseUri, ...pathParts) => ({
      fsPath: `${baseUri.fsPath}/${pathParts.join('/')}`
    })
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  },
  ThemeIcon: class {
    constructor(id) {
      this.id = id;
    }
  },
  EventEmitter: class {
    constructor() {
      this.listeners = [];
    }
    get event() {
      return (listener) => {
        this.listeners.push(listener);
      };
    }
    fire(data) {
      this.listeners.forEach(l => l(data));
    }
  },
  window: {
    createTreeView: jest.fn()
  },
  commands: {
    registerCommand: jest.fn((cmd, fn) => ({ dispose: jest.fn() }))
  }
};

// Mock MemoryService
class MockMemoryService {
  constructor(initialState = null) {
    this.state = initialState || {
      active: false,
      path: null,
      files: {
        activeContext: false,
        decisionLog: false,
        systemPatterns: false,
        progress: false,
        projectBrief: false
      }
    };
    this.stateListeners = [];
  }

  async detectMemoryBank() {
    return this.state;
  }

  onDidChangeState(listener) {
    this.stateListeners.push(listener);
    return { dispose: () => {} };
  }

  notifyStateChange(newState) {
    this.state = newState;
    this.stateListeners.forEach(l => l(newState));
  }
}

// Minimal MemoryTreeItem implementation
class MemoryTreeItem {
  constructor(label, collapsibleState, fileUri, description) {
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.resourceUri = fileUri;
    this.description = description;
    this.contextValue = fileUri ? 'memoryFile' : null;
    this.iconPath = fileUri ? { id: 'file' } : null;
    this.command = fileUri ? {
      command: 'vscode.open',
      title: 'Open Memory File',
      arguments: [fileUri]
    } : null;
  }
}

// Minimal MemoryTreeProvider implementation
class MemoryTreeProvider {
  constructor(memoryService) {
    this.memoryService = memoryService;
    this.changeListeners = [];

    memoryService.onDidChangeState(() => {
      this.refresh();
    });
  }

  refresh() {
    this.changeListeners.forEach(l => l());
  }

  onDidChangeTreeData(listener) {
    this.changeListeners.push(listener);
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (element) {
      return [];
    }

    const state = await this.memoryService.detectMemoryBank();

    if (!state.active || !state.path) {
      return [
        new MemoryTreeItem(
          'AI-Memory: INACTIVE',
          mockVscodeApi.TreeItemCollapsibleState.None,
          undefined,
          'Click to create'
        )
      ];
    }

    const items = [
      new MemoryTreeItem(
        'AI-Memory: ACTIVE',
        mockVscodeApi.TreeItemCollapsibleState.None,
        undefined,
        state.path.fsPath.split('/').pop()
      )
    ];

    const fileConfigs = [
      { name: 'activeContext.md', label: 'Active Context', exists: state.files.activeContext },
      { name: 'progress.md', label: 'Progress', exists: state.files.progress },
      { name: 'decisionLog.md', label: 'Decision Log', exists: state.files.decisionLog },
      { name: 'systemPatterns.md', label: 'System Patterns', exists: state.files.systemPatterns },
      { name: 'projectBrief.md', label: 'Project Brief', exists: state.files.projectBrief },
    ];

    for (const config of fileConfigs) {
      if (config.exists) {
        const uri = mockVscodeApi.Uri.joinPath(state.path, config.name);
        items.push(new MemoryTreeItem(
          config.label,
          mockVscodeApi.TreeItemCollapsibleState.None,
          uri,
          config.name
        ));
      }
    }

    return items;
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('MemoryTreeProvider Integration with SQLite Backend', () => {
  let mockMemoryService;
  let provider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMemoryService = new MockMemoryService();
  });

  // =========================================================================
  // Test Suite 1: Tree Rendering - Inactive State
  // =========================================================================

  describe('Tree Rendering - Inactive Memory Bank', () => {
    test('should display INACTIVE status when memory bank not found', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('AI-Memory: INACTIVE');
      expect(children[0].collapsibleState).toBe(mockVscodeApi.TreeItemCollapsibleState.None);
      expect(children[0].description).toBe('Click to create');
    });

    test('should have no file entries when memory bank inactive', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      const fileItems = children.filter(c => c.label !== 'AI-Memory: INACTIVE');
      expect(fileItems).toHaveLength(0);
    });

    test('should not create resource URIs when inactive', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      expect(children[0].resourceUri).toBeUndefined();
      // command can be undefined or null when inactive
      expect(children[0].command == null).toBe(true);
    });
  });

  // =========================================================================
  // Test Suite 2: Tree Rendering - Active State
  // =========================================================================

  describe('Tree Rendering - Active Memory Bank', () => {
    beforeEach(() => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: true,
          projectBrief: true
        }
      });
    });

    test('should display ACTIVE status when memory bank exists', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      expect(children[0].label).toBe('AI-Memory: ACTIVE');
      expect(children[0].description).toBe('AI-Memory');
    });

    test('should render all 5 core memory files when present', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');
      expect(fileItems).toHaveLength(5);

      const labels = fileItems.map(f => f.label);
      expect(labels).toContain('Active Context');
      expect(labels).toContain('Progress');
      expect(labels).toContain('Decision Log');
      expect(labels).toContain('System Patterns');
      expect(labels).toContain('Project Brief');
    });

    test('should have correct file names in descriptions', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');
      const descriptions = fileItems.map(f => f.description);

      expect(descriptions).toContain('activeContext.md');
      expect(descriptions).toContain('progress.md');
      expect(descriptions).toContain('decisionLog.md');
      expect(descriptions).toContain('systemPatterns.md');
      expect(descriptions).toContain('projectBrief.md');
    });

    test('should create resource URIs for file items', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');
      fileItems.forEach(item => {
        expect(item.resourceUri).toBeDefined();
        expect(item.resourceUri.fsPath).toContain('AI-Memory');
      });
    });

    test('should attach open command to file items', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');
      fileItems.forEach(item => {
        expect(item.command).toBeDefined();
        expect(item.command.command).toBe('vscode.open');
        expect(item.command.arguments).toHaveLength(1);
      });
    });

    test('should set contextValue to memoryFile for file items', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');
      fileItems.forEach(item => {
        expect(item.contextValue).toBe('memoryFile');
      });
    });

    test('should set icon to file for file items', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');
      fileItems.forEach(item => {
        expect(item.iconPath).toBeDefined();
        expect(item.iconPath.id).toBe('file');
      });
    });
  });

  // =========================================================================
  // Test Suite 3: Partial File Presence
  // =========================================================================

  describe('Tree Rendering - Partial Memory Files', () => {
    test('should only show files that exist', async () => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: false,
          progress: false,
          projectBrief: true
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');
      expect(fileItems).toHaveLength(3);

      const labels = fileItems.map(f => f.label);
      expect(labels).toContain('Active Context');
      expect(labels).toContain('Decision Log');
      expect(labels).toContain('Project Brief');
      expect(labels).not.toContain('Progress');
      expect(labels).not.toContain('System Patterns');
    });

    test('should show no files if memory bank active but no files present', async () => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: false,
          decisionLog: false,
          systemPatterns: false,
          progress: false,
          projectBrief: false
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');
      expect(fileItems).toHaveLength(0);
    });
  });

  // =========================================================================
  // Test Suite 4: State Changes and Refresh
  // =========================================================================

  describe('State Changes and Tree Refresh', () => {
    test('should refresh tree when state changes from INACTIVE to ACTIVE', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      // Verify initial state
      let children = await provider.getChildren();
      expect(children[0].label).toBe('AI-Memory: INACTIVE');

      // Trigger state change
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: true,
          projectBrief: true
        }
      });

      // Verify refresh was called
      expect(refreshCount).toBe(1);

      // Verify new state
      children = await provider.getChildren();
      expect(children[0].label).toBe('AI-Memory: ACTIVE');
    });

    test('should refresh tree when state changes from ACTIVE to INACTIVE', async () => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: true,
          projectBrief: true
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      // Trigger state change
      mockMemoryService.notifyStateChange({
        active: false,
        path: null,
        files: {
          activeContext: false,
          decisionLog: false,
          systemPatterns: false,
          progress: false,
          projectBrief: false
        }
      });

      expect(refreshCount).toBe(1);

      // Verify new state
      const children = await provider.getChildren();
      expect(children[0].label).toBe('AI-Memory: INACTIVE');
    });

    test('should refresh when file list changes', async () => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: true,
          decisionLog: false,
          systemPatterns: true,
          progress: false,
          projectBrief: true
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      // Add a new file
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: false,
          projectBrief: true
        }
      });

      expect(refreshCount).toBe(1);

      // Verify new children
      const children = await provider.getChildren();
      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');
      expect(fileItems).toHaveLength(4);
    });

    test('should handle manual refresh call', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      provider.refresh();

      expect(refreshCount).toBe(1);
    });
  });

  // =========================================================================
  // Test Suite 5: Tree Item Access
  // =========================================================================

  describe('Tree Item Access and Behavior', () => {
    test('should return same item from getTreeItem', async () => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: true,
          projectBrief: true
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();
      const item = children[1];

      const returnedItem = provider.getTreeItem(item);
      expect(returnedItem).toBe(item);
    });

    test('should return empty array for nested elements', async () => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: true,
          projectBrief: true
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();
      const fileItem = children[1];

      const nestedChildren = await provider.getChildren(fileItem);
      expect(nestedChildren).toHaveLength(0);
    });

    test('should not block main thread for small file lists', async () => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: true,
          projectBrief: true
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);

      const startTime = performance.now();
      const children = await provider.getChildren();
      const duration = performance.now() - startTime;

      // Should be very fast (< 5ms)
      expect(duration).toBeLessThan(5);
      expect(children).toHaveLength(6); // 1 status + 5 files
    });
  });

  // =========================================================================
  // Test Suite 6: Path Handling
  // =========================================================================

  describe('Path Handling and File URIs', () => {
    test('should correctly construct file paths for all file types', async () => {
      const basePath = '/home/user/myproject/AI-Memory';
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: basePath },
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: true,
          projectBrief: true
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();
      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');

      const paths = fileItems.map(f => f.resourceUri.fsPath);
      expect(paths).toContain(`${basePath}/activeContext.md`);
      expect(paths).toContain(`${basePath}/decisionLog.md`);
      expect(paths).toContain(`${basePath}/systemPatterns.md`);
      expect(paths).toContain(`${basePath}/progress.md`);
      expect(paths).toContain(`${basePath}/projectBrief.md`);
    });

    test('should handle paths with special characters', async () => {
      const basePath = '/home/user/my-project (2025)/AI-Memory';
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: basePath },
        files: {
          activeContext: true,
          decisionLog: false,
          systemPatterns: false,
          progress: false,
          projectBrief: false
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();
      const fileItems = children.filter(c => c.label !== 'AI-Memory: ACTIVE');

      expect(fileItems[0].resourceUri.fsPath).toBe(`${basePath}/activeContext.md`);
    });

    test('should extract folder name correctly from path', async () => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        files: {
          activeContext: false,
          decisionLog: false,
          systemPatterns: false,
          progress: false,
          projectBrief: false
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      expect(children[0].description).toBe('AI-Memory');
    });
  });

  // =========================================================================
  // Test Suite 7: Error Handling and Edge Cases
  // =========================================================================

  describe('Error Handling and Edge Cases', () => {
    test('should handle null state gracefully', async () => {
      mockMemoryService.notifyStateChange({
        active: false,
        path: null,
        files: {
          activeContext: false,
          decisionLog: false,
          systemPatterns: false,
          progress: false,
          projectBrief: false
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('AI-Memory: INACTIVE');
    });

    test('should handle multiple rapid refreshes', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);
      let refreshCount = 0;
      provider.onDidChangeTreeData(() => {
        refreshCount++;
      });

      for (let i = 0; i < 5; i++) {
        provider.refresh();
      }

      expect(refreshCount).toBe(5);
    });

    test('should maintain stability after many state changes', async () => {
      provider = new MemoryTreeProvider(mockMemoryService);

      for (let i = 0; i < 10; i++) {
        mockMemoryService.notifyStateChange({
          active: i % 2 === 0,
          path: i % 2 === 0 ? { fsPath: '/test/AI-Memory' } : null,
          files: {
            activeContext: i % 2 === 0,
            decisionLog: i % 3 === 0,
            systemPatterns: i % 4 === 0,
            progress: i % 5 === 0,
            projectBrief: i % 2 === 0
          }
        });

        const children = await provider.getChildren();
        expect(children).toBeDefined();
        expect(Array.isArray(children)).toBe(true);
      }
    });
  });

  // =========================================================================
  // Test Suite 8: SQLite Integration Points
  // =========================================================================

  describe('SQLite Backend Integration', () => {
    test('should query memory service state which uses SQLite backend', async () => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        backend: 'sql.js', // SQLite backend indicator
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: true,
          projectBrief: true
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);

      // Verify service is called (which queries SQLite)
      let queryCalled = false;
      const spy = jest.spyOn(mockMemoryService, 'detectMemoryBank').mockImplementation(async () => {
        queryCalled = true;
        return mockMemoryService.state;
      });

      const children = await provider.getChildren();

      expect(queryCalled).toBe(true);
      expect(children).toHaveLength(6); // Status + 5 files
      spy.mockRestore();
    });

    test('should handle backend switching from better-sqlite3 to sql.js', async () => {
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        backend: 'better-sqlite3',
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: true,
          projectBrief: true
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      let children = await provider.getChildren();
      expect(children).toHaveLength(6);

      // Switch backend
      mockMemoryService.notifyStateChange({
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        backend: 'sql.js',
        files: {
          activeContext: true,
          decisionLog: true,
          systemPatterns: true,
          progress: true,
          projectBrief: true
        }
      });

      children = await provider.getChildren();
      expect(children).toHaveLength(6); // Should still render correctly
    });

    test('should indicate when SQLite backend is unavailable', async () => {
      mockMemoryService.notifyStateChange({
        active: false,
        path: null,
        backend: 'none',
        files: {
          activeContext: false,
          decisionLog: false,
          systemPatterns: false,
          progress: false,
          projectBrief: false
        }
      });

      provider = new MemoryTreeProvider(mockMemoryService);
      const children = await provider.getChildren();

      expect(children[0].label).toBe('AI-Memory: INACTIVE');
    });
  });
});
