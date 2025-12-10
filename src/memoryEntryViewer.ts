/**
 * Memory Entry Viewer - Single persistent read-only editor for memory entries
 * Uses VS Code's TextDocumentContentProvider API to display memory entries
 * Updates content when user clicks different entries without creating new tabs
 */

import * as vscode from 'vscode';
import { MemoryBankService } from './memoryService';

export class MemoryEntryViewerProvider implements vscode.TextDocumentContentProvider {
  private currentEntryId: number | null = null;
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private memoryService: MemoryBankService) {}

  /**
   * Update which entry is currently displayed
   */
  setCurrentEntry(entryId: number): void {
    this.currentEntryId = entryId;
    // Notify VS Code to re-read the document content
    const uri = vscode.Uri.parse(`aiSkeleton-memory://memory-entry/${entryId}`);
    this._onDidChange.fire(uri);
  }

  /**
   * Provide the content for the memory entry document
   */
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    try {
      // Extract entry ID from URI (format: aiSkeleton-memory://memory-entry/123)
      const match = uri.path.match(/\/(\d+)$/);
      if (!match) {
        return '# Error\n\nCould not parse entry ID from URI';
      }

      const entryId = parseInt(match[1], 10);

      // Fetch the entry from the database
      const entry = await this.memoryService.getStore().getEntryById(entryId);

      if (!entry) {
        return `# Entry Not Found\n\nNo entry found with ID: ${entryId}\n\nIt may have been deleted.`;
      }

      // Format the entry as markdown with metadata header
      const header = `# ${entry.tag || entry.file_type}

**Type:** ${entry.file_type}  
**Date:** ${entry.timestamp}  
**ID:** ${entry.id}

---

`;

      return header + entry.content;
    } catch (error) {
      console.error('[MemoryEntryViewer] Error providing document content:', error);
      return `# Error Loading Entry\n\nFailed to load memory entry:\n\n\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\``;
    }
  }
}
