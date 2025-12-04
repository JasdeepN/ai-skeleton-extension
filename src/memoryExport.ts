// Export utilities - Convert SQLite database back to markdown files
// Enables backup and maintains human-readable format

import * as vscode from 'vscode';
import { MemoryStore, MemoryEntry, FILE_TYPE_TO_FILENAME } from './memoryStore';

export interface ExportResult {
  success: boolean;
  filesExported: string[];
  entriesExported: number;
  errors: string[];
}

/**
 * Get file name for memory entry type
 */
function getFileNameForType(type: MemoryEntry['file_type']): string {
  return FILE_TYPE_TO_FILENAME[type];
}

/**
 * Format markdown content from entry
 */
function formatEntryAsMarkdown(entry: MemoryEntry): string {
  const { tag, content } = entry;
  return `[${tag}] ${content}`;
}

/**
 * Export SQLite database back to markdown files
 */
export async function exportSQLiteToMarkdown(
  memoryPath: vscode.Uri,
  store: MemoryStore
): Promise<ExportResult> {
  const result: ExportResult = {
    success: false,
    filesExported: [],
    entriesExported: 0,
    errors: []
  };

  const types: MemoryEntry['file_type'][] = [
    'CONTEXT',
    'DECISION',
    'PROGRESS',
    'PATTERN',
    'BRIEF'
  ];

  try {
    // Create memory directory if needed
    await vscode.workspace.fs.createDirectory(memoryPath);
  } catch (err) {
    result.errors.push(`Failed to create directory: ${err}`);
    return result;
  }

  // Export each type to its corresponding file
  for (const type of types) {
    const fileName = getFileNameForType(type);
    const filePath = vscode.Uri.joinPath(memoryPath, fileName);

    try {
      // Get all entries of this type (up to 10000)
      const queryResult = await store.queryByType(type, 10000);
      
      if (queryResult.entries.length === 0) {
        // Create empty file with header if needed
        const header = `# ${fileName.replace('.md', '').replace(/([A-Z])/g, ' $1').trim()}\n\n`;
        const content = Buffer.from(header);
        await vscode.workspace.fs.writeFile(filePath, content);
        result.filesExported.push(fileName);
        continue;
      }

      // Sort entries by timestamp (oldest first for readability)
      const sortedEntries = queryResult.entries.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Format entries as markdown
      const lines = sortedEntries.map((entry) =>
        formatEntryAsMarkdown(entry)
      );

      // Add header
      const header = `# ${fileName.replace('.md', '').replace(/([A-Z])/g, ' $1').trim()}\n\n`;
      const content = header + lines.join('\n\n') + '\n';

      const buffer = Buffer.from(content);
      await vscode.workspace.fs.writeFile(filePath, buffer);

      result.filesExported.push(fileName);
      result.entriesExported += sortedEntries.length;
    } catch (err) {
      result.errors.push(`Failed to export ${fileName}: ${err}`);
    }
  }

  result.success = result.filesExported.length > 0 && result.errors.length === 0;
  return result;
}

/**
 * Create backup of current SQLite state to markdown
 * Called on extension deactivate for safety
 */
export async function createBackupMarkdown(
  memoryPath: vscode.Uri,
  store: MemoryStore
): Promise<boolean> {
  try {
    // Create .backup subdirectory
    const backupFolder = vscode.Uri.joinPath(memoryPath, '.backup');
    await vscode.workspace.fs.createDirectory(backupFolder);

    // Create timestamp for backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = vscode.Uri.joinPath(backupFolder, `backup-${timestamp}`);
    await vscode.workspace.fs.createDirectory(backupPath);

    // Export to backup location
    const result = await exportSQLiteToMarkdown(backupPath, store);
    return result.success;
  } catch (err) {
    console.error('[MemoryExport] Backup creation failed:', err);
    return false;
  }
}
