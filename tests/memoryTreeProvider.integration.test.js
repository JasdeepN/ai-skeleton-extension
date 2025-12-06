/**
 * Integration Tests: MemoryTreeProvider (DB-only, SQLite only)
 *
 * These tests mirror the simplified MemoryTreeProvider behavior after
 * removing markdown files. The provider now surfaces status and entry
 * counts only; items are commands instead of file links.
 */

// Minimal VS Code API shim
const mockVscodeApi = {
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(id) { this.id = id; } },
  EventEmitter: class {
    constructor() { this.listeners = []; }
    get event() { return (listener) => { this.listeners.push(listener); return { dispose: () => {} }; }; }
    fire(data) { this.listeners.forEach(l => l(data)); }
  },
};

class MockMemoryService {
  constructor(metrics) {
    this.metrics = metrics || {
      state: {
        active: false,
        path: null,
        activity: 'idle',
        backend: 'none',
        files: {
          activeContext: false,
          decisionLog: false,
          systemPatterns: false,
          progress: false,
          projectBrief: false
        }
      },
      dbSizeBytes: null,
      avgQueryTimeMs: null,
      entryCounts: { CONTEXT: 0, DECISION: 0, PROGRESS: 0, PATTERN: 0, BRIEF: 0 },
      latest: { CONTEXT: [], DECISION: [], PROGRESS: [], PATTERN: [], BRIEF: [] },
      tasks: { next: [], doing: [], done: [], other: [] }
    };
    this.listeners = [];
  }

  async getDashboardMetrics() {
    return this.metrics;
  }

  onDidChangeState(listener) {
    this.listeners.push(listener);
    return { dispose: () => {} };
  }

  notify(newMetrics) {
    this.metrics = newMetrics;
    this.listeners.forEach(l => l(newMetrics.state));
  }
}

class MemoryTreeItem {
  constructor(label, collapsibleState, options) {
    this.label = label;
    this.collapsibleState = collapsibleState;
    if (options?.description) this.description = options.description;
    if (options?.command) this.command = options.command;
    if (options?.iconId) this.iconPath = { id: options.iconId };
  }
}

class MemoryTreeProvider {
  constructor(memoryService) {
    this.memoryService = memoryService;
    this.changeListeners = [];
    memoryService.onDidChangeState(() => this.refresh());
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
    if (element) return [];

    const metrics = await this.memoryService.getDashboardMetrics();
    const state = metrics.state;

    if (!state.active || !state.path) {
      return [new MemoryTreeItem(
        'AI-Memory: INACTIVE',
        mockVscodeApi.TreeItemCollapsibleState.None,
        {
          description: 'Click to create',
          command: { command: 'aiSkeleton.memory.create', title: 'Create Memory Bank' },
          iconId: 'warning'
        }
      )];
    }

    const items = [];
    items.push(new MemoryTreeItem(
      'AI-Memory: ACTIVE',
      mockVscodeApi.TreeItemCollapsibleState.None,
      {
        description: state.path.fsPath.split(/[\\/]/).pop(),
        iconId: 'database'
      }
    ));

    const typeOrder = [
      { type: 'CONTEXT', label: 'Context', iconId: 'file-text' },
      { type: 'PROGRESS', label: 'Progress', iconId: 'checklist' },
      { type: 'DECISION', label: 'Decisions', iconId: 'lightbulb' },
      { type: 'PATTERN', label: 'Patterns', iconId: 'repo-forked' },
      { type: 'BRIEF', label: 'Brief', iconId: 'book' }
    ];

    for (const entry of typeOrder) {
      const count = metrics.entryCounts[entry.type] ?? 0;
      items.push(new MemoryTreeItem(
        `${entry.label} (${count})`,
        mockVscodeApi.TreeItemCollapsibleState.None,
        {
          iconId: entry.iconId,
          command: { command: 'aiSkeleton.memory.show', title: 'Show Memory' }
        }
      ));
    }

    return items;
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('MemoryTreeProvider (DB-only)', () => {
  let provider;
  let memoryService;

  beforeEach(() => {
    memoryService = new MockMemoryService();
    provider = new MemoryTreeProvider(memoryService);
  });

  test('inactive state renders single inactive node', async () => {
    const children = await provider.getChildren();
    expect(children).toHaveLength(1);
    const inactive = children[0];
    expect(inactive.label).toBe('AI-Memory: INACTIVE');
    expect(inactive.description).toBe('Click to create');
    expect(inactive.command.command).toBe('aiSkeleton.memory.create');
  });

  test('active state renders status plus 5 type nodes', async () => {
    const metrics = {
      state: {
        active: true,
        path: { fsPath: '/home/user/project/AI-Memory' },
        activity: 'idle',
        backend: 'sql.js',
        files: {
          activeContext: false,
          decisionLog: false,
          systemPatterns: false,
          progress: false,
          projectBrief: false
        }
      },
      dbSizeBytes: 1024,
      avgQueryTimeMs: 1.2,
      entryCounts: { CONTEXT: 2, DECISION: 1, PROGRESS: 3, PATTERN: 0, BRIEF: 1 },
      latest: { CONTEXT: [], DECISION: [], PROGRESS: [], PATTERN: [], BRIEF: [] },
      tasks: { next: [], doing: [], done: [], other: [] }
    };

    memoryService.notify(metrics);

    const children = await provider.getChildren();
    expect(children).toHaveLength(6);
    expect(children[0].label).toBe('AI-Memory: ACTIVE');
    expect(children[0].description).toBe('AI-Memory');

    const labels = children.slice(1).map(c => c.label);
    expect(labels).toContain('Context (2)');
    expect(labels).toContain('Progress (3)');
    expect(labels).toContain('Decisions (1)');
    expect(labels).toContain('Patterns (0)');
    expect(labels).toContain('Brief (1)');

    // All items should open the summary command
    children.slice(1).forEach(item => {
      expect(item.command.command).toBe('aiSkeleton.memory.show');
    });
  });

  test('refresh is invoked on state change event', () => {
    const spy = jest.fn();
    provider.onDidChangeTreeData(spy);

    const metrics = {
      state: {
        active: true,
        path: { fsPath: '/home/AI-Memory' },
        activity: 'idle',
        backend: 'sql.js',
        files: {
          activeContext: false,
          decisionLog: false,
          systemPatterns: false,
          progress: false,
          projectBrief: false
        }
      },
      dbSizeBytes: null,
      avgQueryTimeMs: null,
      entryCounts: { CONTEXT: 0, DECISION: 0, PROGRESS: 0, PATTERN: 0, BRIEF: 0 },
      latest: { CONTEXT: [], DECISION: [], PROGRESS: [], PATTERN: [], BRIEF: [] },
      tasks: { next: [], doing: [], done: [], other: [] }
    };

    memoryService.notify(metrics);
    expect(spy).toHaveBeenCalled();
  });
});
