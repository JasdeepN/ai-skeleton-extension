// Migration utilities - Convert markdown files to SQLite
// Handles one-time migration from existing AI-Memory markdown files to SQLite database

import * as vscode from 'vscode';
import * as path from 'path';
import { MemoryStore, MemoryEntry, FILENAME_TO_FILE_TYPE } from './memoryStore';

export interface MigrationResult {
  success: boolean;
  entriesCreated: number;
  entriesSkipped: number;
  errors: string[];
  backupPath?: string;
}

/**
 * Parse tag from markdown entry
 * Extracts type and date from [TYPE:YYYY-MM-DD] format
 */
function parseTag(line: string): { type: string; date: string } | null {
  const match = line.match(/\[([A-Z_]+):(\d{4}-\d{2}-\d{2})\]/);
  if (match) {
    return { type: match[1], date: match[2] };
  }
  return null;
}

/**
 * Extract file type from tag
 */
function fileTypeFromTag(tagType: string): MemoryEntry['file_type'] | null {
  const validTypes: MemoryEntry['file_type'][] = [
    'CONTEXT',
    'DECISION',
    'PROGRESS',
    'PATTERN',
    'BRIEF'
  ];

  if (validTypes.includes(tagType as MemoryEntry['file_type'])) {
    return tagType as MemoryEntry['file_type'];
  }
  return null;
}

/**
 * Parse markdown file and extract entries
 */
function parseMarkdownFile(content: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const lines = content.split('\n');
  let currentEntry: Partial<MemoryEntry> | null = null;
  let contentBuffer: string[] = [];

  for (const line of lines) {
    const tag = parseTag(line);

    if (tag) {
      // Save previous entry if exists
      if (currentEntry && contentBuffer.length > 0) {
        entries.push({
          file_type: currentEntry.file_type!,
          timestamp: currentEntry.timestamp!,
          tag: currentEntry.tag!,
          content: contentBuffer.join('\n').trim()
        });
      }

      // Start new entry
      const fileType = fileTypeFromTag(tag.type);
      if (fileType) {
        currentEntry = {
          file_type: fileType,
          timestamp: `${tag.date}T00:00:00Z`,
          tag: `${tag.type}:${tag.date}`
        };
        contentBuffer = [];

        // Extract content after tag on same line
        const contentMatch = line.match(/\]\s*(.*)/);
        if (contentMatch && contentMatch[1]) {
          contentBuffer.push(contentMatch[1]);
        }
      }
    } else if (currentEntry && line.trim()) {
      // Accumulate content
      contentBuffer.push(line);
    }
  }

  // Save last entry
  if (currentEntry && contentBuffer.length > 0) {
    entries.push({
      file_type: currentEntry.file_type!,
      timestamp: currentEntry.timestamp!,
      tag: currentEntry.tag!,
      content: contentBuffer.join('\n').trim()
    });
  }

  return entries;
}

/**
 * Migrate markdown files to SQLite database
 */
export async function migrateMarkdownToSQLite(
  memoryPath: vscode.Uri,
  store: MemoryStore
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    entriesCreated: 0,
    entriesSkipped: 0,
    errors: []
  };

  const memoryFiles = [
    'activeContext.md',
    'decisionLog.md',
    'progress.md',
    'systemPatterns.md',
    'projectBrief.md'
  ];

  // Create backup of markdown files
  try {
    const backupFolder = vscode.Uri.joinPath(memoryPath, '.backup');
    await vscode.workspace.fs.createDirectory(backupFolder);

    for (const file of memoryFiles) {
      const filePath = vscode.Uri.joinPath(memoryPath, file);
      const backupPath = vscode.Uri.joinPath(backupFolder, `${file}.backup`);
      try {
        const content = await vscode.workspace.fs.readFile(filePath);
        await vscode.workspace.fs.writeFile(backupPath, content);
      } catch {
        // File may not exist, skip
      }
    }

    result.backupPath = backupFolder.fsPath;
  } catch (err) {
    result.errors.push(`Backup failed: ${err}`);
  }

  // Read and migrate each markdown file
  const seenEntries = new Set<string>(); // Deduplicate

  for (const file of memoryFiles) {
    const filePath = vscode.Uri.joinPath(memoryPath, file);

    try {
      const content = await vscode.workspace.fs.readFile(filePath);
      const text = Buffer.from(content).toString('utf8');
      const entries = parseMarkdownFile(text);

      for (const entry of entries) {
        // Deduplicate by content hash
        const entryHash = `${entry.file_type}:${entry.tag}:${entry.content.substring(0, 50)}`;
        if (seenEntries.has(entryHash)) {
          result.entriesSkipped++;
          continue;
        }
        seenEntries.add(entryHash);

        const inserted = await store.appendEntry(entry);
        if (inserted) {
          result.entriesCreated++;
        } else {
          result.entriesSkipped++;
        }
      }
    } catch (err) {
      result.errors.push(`Failed to migrate ${file}: ${err}`);
    }
  }

  result.success = result.entriesCreated > 0 && result.errors.length === 0;
  return result;
}

/**
 * Check if migration is needed
 * Returns true if markdown files exist but SQLite is empty
 */
export async function isMigrationNeeded(
  memoryPath: vscode.Uri,
  store: MemoryStore
): Promise<boolean> {
  // Check if markdown files exist
  let markdownExists = false;
  const memoryFiles = [
    'activeContext.md',
    'decisionLog.md',
    'progress.md',
    'systemPatterns.md',
    'projectBrief.md'
  ];

  for (const file of memoryFiles) {
    try {
      const filePath = vscode.Uri.joinPath(memoryPath, file);
      await vscode.workspace.fs.stat(filePath);
      markdownExists = true;
      break;
    } catch {
      // File doesn't exist
    }
  }

  if (!markdownExists) {
    return false;
  }

  // Check if SQLite has entries
  const result = await store.queryByType('CONTEXT', 1);
  return result.count === 0;
}
