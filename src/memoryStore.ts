// SQLite-based Memory Store
// Provides queryable database backend for AI-Memory
// Uses sql.js (WebAssembly SQLite) as primary for cross-platform compatibility
// Optionally uses better-sqlite3 (native) for better performance

import * as path from 'path';
import * as fs from 'fs';

export interface MemoryEntry {
  id?: number;
  file_type: 'CONTEXT' | 'DECISION' | 'PROGRESS' | 'PATTERN' | 'BRIEF';
  timestamp: string; // ISO 8601
  tag: string; // e.g., "CONTEXT:2025-12-04"
  content: string;
}

// Mapping from uppercase tags to filenames
export const FILE_TYPE_TO_FILENAME: Record<MemoryEntry['file_type'], string> = {
  CONTEXT: 'activeContext.md',
  DECISION: 'decisionLog.md',
  PROGRESS: 'progress.md',
  PATTERN: 'systemPatterns.md',
  BRIEF: 'projectBrief.md'
};

// Reverse mapping from filenames to uppercase tags
export const FILENAME_TO_FILE_TYPE: Record<string, MemoryEntry['file_type']> = {
  'activeContext.md': 'CONTEXT',
  'activeContext': 'CONTEXT',
  'decisionLog.md': 'DECISION',
  'decisionLog': 'DECISION',
  'progress.md': 'PROGRESS',
  'progress': 'PROGRESS',
  'systemPatterns.md': 'PATTERN',
  'systemPatterns': 'PATTERN',
  'projectBrief.md': 'BRIEF',
  'projectBrief': 'BRIEF'
};

export interface QueryResult {
  entries: MemoryEntry[];
  count: number;
  error?: string;
}

type DatabaseBackend = 'better-sqlite3' | 'sql.js' | 'none';

/**
 * MemoryStore - Unified SQLite interface
 * Primary: sql.js (WebAssembly) - guaranteed to work everywhere
 * Optional: better-sqlite3 (native) - faster performance
 */
export class MemoryStore {
  private backend: DatabaseBackend = 'none';
  private db: any = null;
  private isInitialized = false;
  private dbPath: string = '';

  /**
   * Initialize database connection
   * Attempts sql.js first (guaranteed), then optional better-sqlite3
   */
  async init(dbPath: string): Promise<boolean> {
    if (this.isInitialized) return true;

    this.dbPath = dbPath;

    try {
      // Try sql.js first (pure JavaScript, guaranteed to work)
      const initSqlJs = require('sql.js');
      if (!initSqlJs) {
        throw new Error('sql.js not found');
      }

      const SQL = await initSqlJs();
      
      // Try to load existing DB file
      let fileBuffer: Buffer | undefined;
      try {
        fileBuffer = fs.readFileSync(dbPath);
      } catch {
        // File doesn't exist yet, will create new
      }
      
      this.db = new SQL.Database(fileBuffer);
      this.backend = 'sql.js';
      this.initializeSchema();
      this.isInitialized = true;
      
      // Persist to disk
      this.persistSqlJs();
      
      console.log('[MemoryStore] Using sql.js (WebAssembly SQLite) backend');
      return true;
    } catch (err) {
      console.warn('[MemoryStore] sql.js initialization failed:', err);
      
      try {
        // Fallback to better-sqlite3 (optional, native)
        const Database = require('better-sqlite3');
        if (!Database) {
          throw new Error('better-sqlite3 not available');
        }

        this.db = new Database(dbPath);
        this.backend = 'better-sqlite3';
        this.initializeSchema();
        this.isInitialized = true;
        console.log('[MemoryStore] Using better-sqlite3 (native) backend');
        return true;
      } catch (fallbackErr) {
        console.error('[MemoryStore] Both backends failed:', fallbackErr);
        this.backend = 'none';
        return false;
      }
    }
  }

  /**
   * Create tables and indexes if they don't exist
   */
  private initializeSchema() {
    if (!this.db) return;

    try {
      if (this.backend === 'better-sqlite3') {
        // better-sqlite3 uses exec() for multiple statements
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_type TEXT NOT NULL CHECK(file_type IN ('CONTEXT', 'DECISION', 'PROGRESS', 'PATTERN', 'BRIEF')),
            timestamp TEXT NOT NULL,
            tag TEXT NOT NULL,
            content TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_file_timestamp 
            ON entries(file_type, timestamp DESC);
          
          CREATE INDEX IF NOT EXISTS idx_tag 
            ON entries(tag);
        `);
      } else if (this.backend === 'sql.js') {
        // sql.js uses run() for each statement
        const statements = [
          `CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_type TEXT NOT NULL CHECK(file_type IN ('CONTEXT', 'DECISION', 'PROGRESS', 'PATTERN', 'BRIEF')),
            timestamp TEXT NOT NULL,
            tag TEXT NOT NULL,
            content TEXT NOT NULL
          )`,
          `CREATE INDEX IF NOT EXISTS idx_file_timestamp 
            ON entries(file_type, timestamp DESC)`,
          `CREATE INDEX IF NOT EXISTS idx_tag 
            ON entries(tag)`
        ];
        
        for (const stmt of statements) {
          try {
            this.db.run(stmt);
          } catch {
            // Index or table may already exist
          }
        }
      }
    } catch (err) {
      console.error('[MemoryStore] Schema initialization failed:', err);
    }
  }

  /**
   * Append a new entry to the database
   */
  async appendEntry(entry: Omit<MemoryEntry, 'id'>): Promise<number | null> {
    if (!this.db || !this.isInitialized) return null;

    try {
      if (this.backend === 'better-sqlite3') {
        const stmt = this.db.prepare(`
          INSERT INTO entries (file_type, timestamp, tag, content)
          VALUES (?, ?, ?, ?)
        `);
        const result = stmt.run(
          entry.file_type,
          entry.timestamp,
          entry.tag,
          entry.content
        );
        return result.lastInsertRowid as number;
      } else if (this.backend === 'sql.js') {
        this.db.run(
          `INSERT INTO entries (file_type, timestamp, tag, content)
           VALUES (?, ?, ?, ?)`,
          [entry.file_type, entry.timestamp, entry.tag, entry.content]
        );
        this.persistSqlJs();
        // sql.js doesn't easily return lastInsertRowid
        return Math.floor(Date.now() / 1000);
      }
    } catch (err) {
      console.error('[MemoryStore] Append failed:', err);
    }
    return null;
  }

  /**
   * Query entries by file type
   */
  async queryByType(
    fileType: MemoryEntry['file_type'],
    limit: number = 50
  ): Promise<QueryResult> {
    if (!this.db || !this.isInitialized) {
      return { entries: [], count: 0, error: 'Database not initialized' };
    }

    try {
      if (this.backend === 'better-sqlite3') {
        const stmt = this.db.prepare(`
          SELECT id, file_type, timestamp, tag, content
          FROM entries
          WHERE file_type = ?
          ORDER BY timestamp DESC
          LIMIT ?
        `);
        const entries = stmt.all(fileType, limit) as MemoryEntry[];
        return { entries, count: entries.length };
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT id, file_type, timestamp, tag, content
          FROM entries
          WHERE file_type = ?
          ORDER BY timestamp DESC
          LIMIT ?
        `);
        stmt.bind([fileType, limit]);
        const entries: MemoryEntry[] = [];
        while (stmt.step()) {
          entries.push(stmt.getAsObject() as MemoryEntry);
        }
        stmt.free();
        return { entries, count: entries.length };
      }
    } catch (err) {
      console.error('[MemoryStore] Query by type failed:', err);
      return { entries: [], count: 0, error: String(err) };
    }

    return { entries: [], count: 0 };
  }

  /**
   * Query entries by date range
   */
  async queryByDateRange(
    fileType: MemoryEntry['file_type'],
    startDate: string,
    endDate: string
  ): Promise<QueryResult> {
    if (!this.db || !this.isInitialized) {
      return { entries: [], count: 0, error: 'Database not initialized' };
    }

    try {
      if (this.backend === 'better-sqlite3') {
        const stmt = this.db.prepare(`
          SELECT id, file_type, timestamp, tag, content
          FROM entries
          WHERE file_type = ? AND timestamp >= ? AND timestamp < ?
          ORDER BY timestamp DESC
        `);
        const entries = stmt.all(fileType, startDate, endDate) as MemoryEntry[];
        return { entries, count: entries.length };
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT id, file_type, timestamp, tag, content
          FROM entries
          WHERE file_type = ? AND timestamp >= ? AND timestamp < ?
          ORDER BY timestamp DESC
        `);
        stmt.bind([fileType, startDate, endDate]);
        const entries: MemoryEntry[] = [];
        while (stmt.step()) {
          entries.push(stmt.getAsObject() as MemoryEntry);
        }
        stmt.free();
        return { entries, count: entries.length };
      }
    } catch (err) {
      console.error('[MemoryStore] Date range query failed:', err);
      return { entries: [], count: 0, error: String(err) };
    }

    return { entries: [], count: 0 };
  }

  /**
   * Full-text search
   */
  async fullTextSearch(query: string, limit: number = 50): Promise<QueryResult> {
    if (!this.db || !this.isInitialized) {
      return { entries: [], count: 0, error: 'Database not initialized' };
    }

    try {
      if (this.backend === 'better-sqlite3') {
        const stmt = this.db.prepare(`
          SELECT id, file_type, timestamp, tag, content
          FROM entries
          WHERE content LIKE ?
          ORDER BY timestamp DESC
          LIMIT ?
        `);
        const entries = stmt.all(`%${query}%`, limit) as MemoryEntry[];
        return { entries, count: entries.length };
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT id, file_type, timestamp, tag, content
          FROM entries
          WHERE content LIKE ?
          ORDER BY timestamp DESC
          LIMIT ?
        `);
        stmt.bind([`%${query}%`, limit]);
        const entries: MemoryEntry[] = [];
        while (stmt.step()) {
          entries.push(stmt.getAsObject() as MemoryEntry);
        }
        stmt.free();
        return { entries, count: entries.length };
      }
    } catch (err) {
      console.error('[MemoryStore] Full-text search failed:', err);
      return { entries: [], count: 0, error: String(err) };
    }

    return { entries: [], count: 0 };
  }

  /**
   * Get recent entries for a file type
   */
  async getRecent(
    fileType: MemoryEntry['file_type'],
    count: number = 20
  ): Promise<MemoryEntry[]> {
    const result = await this.queryByType(fileType, count);
    return result.entries;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.backend === 'better-sqlite3' && this.db) {
      try {
        this.db.close();
      } catch (err) {
        console.error('[MemoryStore] Close failed:', err);
      }
    } else if (this.backend === 'sql.js') {
      try {
        this.persistSqlJs();
      } catch (err) {
        console.error('[MemoryStore] sql.js persist failed:', err);
      }
    }
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Persist sql.js data to disk (sql.js is in-memory)
   */
  private persistSqlJs() {
    if (this.backend !== 'sql.js' || !this.db || !this.dbPath) return;

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('[MemoryStore] sql.js persist failed:', err);
    }
  }

  /**
   * Get current backend
   */
  getBackend(): DatabaseBackend {
    return this.backend;
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Singleton instance
let _memoryStore: MemoryStore | undefined;

export function getMemoryStore(): MemoryStore {
  if (!_memoryStore) {
    _memoryStore = new MemoryStore();
  }
  return _memoryStore;
}
