/**
 * Manual mock for VS Code API
 * Jest will automatically use this when 'vscode' is required in tests
 */

module.exports = {
  Uri: {
    file: (path) => ({ fsPath: path, scheme: 'file', path }),
    parse: (uri) => ({ fsPath: uri, scheme: 'file', path: uri }),
  },
  workspace: {
    getConfiguration: () => ({
      get: () => undefined,
      update: () => Promise.resolve(),
      has: () => false,
      inspect: () => undefined,
    }),
    workspaceFolders: [
      {
        uri: { fsPath: '/mock/workspace', scheme: 'file' },
        name: 'MockWorkspace',
        index: 0,
      },
    ],
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
    fs: {
      readFile: () => Promise.resolve(Buffer.from('')),
      writeFile: () => Promise.resolve(),
      stat: () => Promise.resolve({ type: 1, size: 0 }),
      readDirectory: () => Promise.resolve([]),
    },
  },
  window: {
    showInformationMessage: () => Promise.resolve(),
    showWarningMessage: () => Promise.resolve(),
    showErrorMessage: () => Promise.resolve(),
    createOutputChannel: () => ({
      appendLine: () => {},
      append: () => {},
      clear: () => {},
      show: () => {},
      dispose: () => {},
    }),
    withProgress: (options, task) => task({ report: () => {} }),
  },
  EventEmitter: class EventEmitter {
    constructor() {
      this.listeners = [];
    }
    fire(data) {
      this.listeners.forEach(listener => listener(data));
    }
    get event() {
      return (listener) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
      };
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class ThemeIcon {
    constructor(id) {
      this.id = id;
    }
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve(),
  },
  languages: {
    registerCodeActionsProvider: () => ({ dispose: () => {} }),
  },
};
