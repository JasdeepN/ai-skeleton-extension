// Context Formatter
// Converts memory entries to optimized Markdown+YAML format for token efficiency
// Markdown is 34-38% more efficient than JSON for nested data

import { MemoryEntry as StoreMemoryEntry } from './memoryStore';

export interface MemoryEntryFormatted {
  tag: string;
  type: StoreMemoryEntry['file_type'];
  content: string;
  metadata?: Record<string, any>;
  formatted: string; // Full formatted output
}

/**
 * Context Formatter Service
 * Converts memory entries to optimized Markdown + YAML format
 * 
 * Format:
 * [TYPE:DATE] title
 * 
 * content lines stripped of unnecessary whitespace
 * 
 * ---
 */
export class ContextFormatter {
  private static instance: ContextFormatter;

  private constructor() {}

  static getInstance(): ContextFormatter {
    if (!ContextFormatter.instance) {
      ContextFormatter.instance = new ContextFormatter();
    }
    return ContextFormatter.instance;
  }

  /**
   * Format a memory entry for agent consumption
   * Strips whitespace, uses Markdown for content, YAML for metadata
   */
  formatEntry(entry: StoreMemoryEntry, includeMetadata: boolean = true): MemoryEntryFormatted {
    const formattedContent = this.stripWhitespace(entry.content);
    
    // Extract title (first line before newline)
    const titleMatch = formattedContent.match(/^([^\n]+)/);
    const title = titleMatch ? titleMatch[1].trim() : entry.tag;

    // Build formatted output
    let formatted = `[${entry.tag}] ${title}\n\n`;
    
    // Add content (preserve structure but strip excess whitespace)
    formatted += formattedContent;
    
    // Add separator
    formatted += '\n\n---\n';

    const result: MemoryEntryFormatted = {
      tag: entry.tag,
      type: entry.file_type,
      content: entry.content,
      formatted
    };

    if (includeMetadata) {
      result.metadata = {
        type: entry.file_type,
        timestamp: entry.timestamp,
        title: title,
        contentLength: entry.content.length,
        contentLines: entry.content.split('\n').length
      };
    }

    return result;
  }

  /**
   * Format multiple entries
   */
  formatEntries(entries: StoreMemoryEntry[], includeMetadata: boolean = true): MemoryEntryFormatted[] {
    return entries.map(entry => this.formatEntry(entry, includeMetadata));
  }

  /**
   * Strip unnecessary whitespace while preserving structure
   * - Remove extra blank lines (max 2 consecutive)
   * - Remove leading/trailing spaces from lines
   * - Preserve code block formatting
   */
  private stripWhitespace(content: string): string {
    let lines = content.split('\n');
    
    // Trim each line but preserve indentation
    lines = lines.map(line => {
      // Preserve leading spaces for code blocks and lists
      if (line.match(/^[\s]+[\-*#`]/)) {
        return line.trimEnd();
      }
      return line.trim();
    });

    // Remove consecutive blank lines (keep max 1 blank line for readability)
    let result: string[] = [];
    let blankCount = 0;

    for (const line of lines) {
      if (line.length === 0) {
        blankCount++;
        if (blankCount <= 1) {
          result.push(line);
        }
      } else {
        blankCount = 0;
        result.push(line);
      }
    }

    // Remove leading/trailing blank lines
    while (result.length > 0 && result[0].trim().length === 0) {
      result.shift();
    }
    while (result.length > 0 && result[result.length - 1].trim().length === 0) {
      result.pop();
    }

    return result.join('\n');
  }

  /**
   * Serialize entry metadata as YAML
   * More efficient than JSON for this use case
   */
  serializeAsYAML(entry: MemoryEntryFormatted): string {
    if (!entry.metadata) {
      return '';
    }

    const yaml: string[] = [];
    yaml.push('---');
    
    for (const [key, value] of Object.entries(entry.metadata)) {
      if (typeof value === 'string') {
        yaml.push(`${key}: "${value}"`);
      } else if (typeof value === 'number') {
        yaml.push(`${key}: ${value}`);
      } else if (Array.isArray(value)) {
        yaml.push(`${key}:`);
        for (const item of value) {
          yaml.push(`  - ${item}`);
        }
      } else if (typeof value === 'object' && value !== null) {
        yaml.push(`${key}:`);
        for (const [k, v] of Object.entries(value)) {
          yaml.push(`  ${k}: ${v}`);
        }
      }
    }

    yaml.push('---');
    return yaml.join('\n');
  }

  /**
   * Parse YAML-formatted metadata back to object
   * Simple YAML parser for basic structures
   */
  parseYAML(yamlContent: string): Record<string, any> {
    const result: Record<string, any> = {};

    if (!yamlContent.includes('---')) {
      return result;
    }

    const lines = yamlContent.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && trimmed !== '---';
    });

    let currentKey: string | null = null;
    let currentArray: any[] = [];

    for (const line of lines) {
      // Check for array items
      if (line.match(/^\s+- /)) {
        const item = line.replace(/^\s+- /, '').trim();
        currentArray.push(item);
        continue;
      }

      // Save previous array if exists and we're moving to a new key
      if (currentArray.length > 0 && currentKey && !line.startsWith('  ')) {
        result[currentKey] = currentArray;
        currentArray = [];
        currentKey = null;
      }

      // Check for key: value
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const key = match[1];
        let value: any = match[2];

        if (!value) {
          // This might be an array or nested structure
          currentKey = key;
          currentArray = [];
          result[key] = currentArray; // placeholder
          continue;
        }

        // Parse value type
        if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        } else if (/^[\d.]+$/.test(value)) {
          value = parseFloat(value);
        } else if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }

        result[key] = value;
        currentKey = null;
      }
    }

    // Save final array if exists
    if (currentArray.length > 0 && currentKey) {
      result[currentKey] = currentArray;
    }

    return result;
  }

  /**
   * Format all entries as a single document (e.g., for agent context)
   * Uses Markdown + YAML tags for efficiency
   */
  formatAsDocument(entries: StoreMemoryEntry[], sortByType: boolean = true): string {
    let formatted = entries;

    if (sortByType) {
      // Group by type: BRIEF, CONTEXT, PATTERN, DECISION, PROGRESS
      const typeOrder: Record<string, number> = {
        'BRIEF': 0,
        'CONTEXT': 1,
        'PATTERN': 2,
        'DECISION': 3,
        'PROGRESS': 4
      };

      formatted = entries.sort((a, b) => {
        const orderA = typeOrder[a.file_type] ?? 999;
        const orderB = typeOrder[b.file_type] ?? 999;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        // Within same type, sort by timestamp descending (newest first)
        return b.timestamp.localeCompare(a.timestamp);
      });
    }

    const sections: string[] = [];

    for (const entry of formatted) {
      const formatted_entry = this.formatEntry(entry, false);
      sections.push(formatted_entry.formatted);
    }

    return sections.join('\n');
  }

  /**
   * Estimate token count reduction from formatting
   * Compares JSON vs Markdown formatting
   */
  estimateTokenReduction(originalJson: string, formattedMarkdown: string): {
    originalLength: number;
    formattedLength: number;
    reduction: number;
    reductionPercent: number;
  } {
    const originalLength = originalJson.length;
    const formattedLength = formattedMarkdown.length;
    const reduction = originalLength - formattedLength;
    const reductionPercent = originalLength > 0 ? (reduction / originalLength) * 100 : 0;

    return {
      originalLength,
      formattedLength,
      reduction,
      reductionPercent
    };
  }
}

export default ContextFormatter.getInstance();
