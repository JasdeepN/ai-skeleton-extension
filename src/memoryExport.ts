// Export utilities - Convert SQLite database back to markdown files
// Only enables human-readable backup; markdown file persistence is deprecated.

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
// Markdown export is deprecated; only database export/backup is supported.
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
