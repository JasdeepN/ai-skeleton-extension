// Export utilities - Convert SQLite database back to markdown files
// Enables backup and maintains human-readable format

import * as vscode from 'vscode';
import { MemoryStore, MemoryEntry, FILE_TYPE_TO_DISPLAY } from './memoryStore';

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
  // Export to .md files for human-readable backup
  const filenameMap: Record<MemoryEntry['file_type'], string> = {
    CONTEXT: 'activeContext.md',
    DECISION: 'decisionLog.md',
    PROGRESS: 'progress.md',
    PATTERN: 'systemPatterns.md',
    BRIEF: 'projectBrief.md'
  };
  return filenameMap[type];
}

/**
 * Format markdown content from entry
 */
function formatEntryAsMarkdown(entry: MemoryEntry): string {
  const { tag, content } = entry;
  return `[${tag}] ${content}`;
}

/**
 * Export SQLite database to single consolidated markdown file
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
    'BRIEF',
    'PATTERN',
    'CONTEXT',
    'DECISION',
    'PROGRESS'
  ];

  try {
    // Create memory directory if needed
    await vscode.workspace.fs.createDirectory(memoryPath);
  } catch (err) {
    result.errors.push(`Failed to create directory: ${err}`);
    return result;
  }

  // Build single consolidated markdown file
  const sections: string[] = [];
  sections.push('# AI-Memory Export\n');
  sections.push(`Generated: ${new Date().toISOString()}\n`);
  sections.push('---\n');

  // Collect all entries by type
  for (const type of types) {
    const typeName = type.charAt(0) + type.slice(1).toLowerCase();
    sections.push(`## ${typeName}\n`);

    try {
      // Get all entries of this type (up to 10000)
      const queryResult = await store.queryByType(type, 10000);
      
      if (queryResult.entries.length === 0) {
        sections.push('*No entries*\n');
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

      sections.push(lines.join('\n\n') + '\n');
      result.entriesExported += sortedEntries.length;
    } catch (err) {
      sections.push(`*Error loading ${typeName}: ${err}*\n`);
      result.errors.push(`Failed to export ${typeName}: ${err}`);
    }
    
    sections.push('\n---\n');
  }

  // Write single memory.md file
  try {
    const filePath = vscode.Uri.joinPath(memoryPath, 'memory.md');
    const content = sections.join('\n');
    const buffer = Buffer.from(content);
    await vscode.workspace.fs.writeFile(filePath, buffer);

    result.filesExported.push('memory.md');
    result.success = result.errors.length === 0;
  } catch (err) {
    result.errors.push(`Failed to write memory.md: ${err}`);
  }

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
