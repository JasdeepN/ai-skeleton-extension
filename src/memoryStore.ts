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
  metadata?: string; // JSON: {progress?: string, targets?: string[], phase?: string}
  phase?: 'research' | 'planning' | 'execution' | 'checkpoint' | null;
  progress_status?: 'done' | 'in-progress' | 'draft' | 'deprecated' | null;
  embedding?: Uint8Array | null; // Binary quantized 384-dim vector (48 bytes) for semantic search
}

export interface TokenMetric {
  id?: number;
  timestamp: string; // ISO 8601
  model: string; // e.g., "claude-3-5-sonnet"
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  operation?: string; // e.g., "showMemory", "logDecision"
  context_status?: 'healthy' | 'warning' | 'critical';
  created_at?: string;
}

export interface QueryMetric {
  id?: number;
  timestamp: string; // ISO 8601
  operation: string; // e.g., "queryByType", "appendEntry"
  elapsed_ms: number; // query duration in milliseconds
  result_count: number; // rows returned
  created_at?: string;
}

// Mapping from uppercase tags to display names (DB-only, no file extensions)
export const FILE_TYPE_TO_DISPLAY: Record<MemoryEntry['file_type'], string> = {
  CONTEXT: 'Active Context',
  DECISION: 'Decision Log',
  PROGRESS: 'Progress',
  PATTERN: 'System Patterns',
  BRIEF: 'Project Brief'
};

// Reverse mapping from various inputs to uppercase tags (for backward compat)
export const INPUT_TO_FILE_TYPE: Record<string, MemoryEntry['file_type']> = {
  'activeContext': 'CONTEXT',
  'context': 'CONTEXT',
  'CONTEXT': 'CONTEXT',
  'decisionLog': 'DECISION',
  'decision': 'DECISION',
  'DECISION': 'DECISION',
  'progress': 'PROGRESS',
  'PROGRESS': 'PROGRESS',
  'systemPatterns': 'PATTERN',
  'patterns': 'PATTERN',
  'PATTERN': 'PATTERN',
  'projectBrief': 'BRIEF',
  'brief': 'BRIEF',
  'BRIEF': 'BRIEF'
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
  private querySamples: number[] = [];
  private readonly maxSamples = 50;

  /**
   * Initialize database connection
   * Attempts sql.js first (guaranteed), then optional better-sqlite3
   */
  async init(dbPath: string): Promise<boolean> {
    // Check if file was deleted (test cleanup scenario)
    const fileExists = fs.existsSync(dbPath);
    
    // Allow re-initialization if path changes OR if file was deleted
    if (this.isInitialized && this.dbPath === dbPath && fileExists) {
      console.log('[MemoryStore] Already initialized with same path:', dbPath);
      // CRITICAL: Always run migrations even if already initialized
      // This ensures schema updates are applied to existing databases
      this.runMigrations();
      return true;
    }

    // If path changed OR file was deleted, reset state
    if (this.isInitialized && (this.dbPath !== dbPath || !fileExists)) {
      console.log('[MemoryStore] Reinitializing - path changed:', this.dbPath !== dbPath, 'file deleted:', !fileExists);
      this.isInitialized = false;
      this.db = null;
      this.backend = 'none';
    }

    this.dbPath = dbPath;

    try {
      // Try sql.js first (pure JavaScript, guaranteed to work)
      const initSqlJs = require('sql.js');
      if (!initSqlJs) {
        throw new Error('sql.js not found');
      }

      console.log('[MemoryStore] Initializing sql.js with dbPath:', dbPath);

      // Load WASM binary directly - this is the most reliable method
      // sql.js's locateFile doesn't work well in VS Code extension context
      let wasmBinary: Buffer | undefined;
      let wasmLoadAttempts: string[] = [];
      
      // Method 1: Use require.resolve to find sql.js location (works when extension has node_modules)
      try {
        const sqlJsPath = require.resolve('sql.js');
        const distDir = path.dirname(sqlJsPath);
        const wasmPath = path.join(distDir, 'sql-wasm.wasm');
        wasmLoadAttempts.push(`require.resolve: ${wasmPath}`);
        
        if (fs.existsSync(wasmPath)) {
          wasmBinary = fs.readFileSync(wasmPath);
          console.log('[MemoryStore] Loaded wasm binary from:', wasmPath, 'size:', wasmBinary.length);
        } else {
          console.warn('[MemoryStore] WASM not found at require.resolve path:', wasmPath);
        }
      } catch (e) {
        console.warn('[MemoryStore] Failed to load wasm from sql.js path:', e);
        wasmLoadAttempts.push(`require.resolve failed: ${e}`);
      }
      
      // Method 2: Try __dirname (extension's dist folder) + node_modules
      if (!wasmBinary) {
        try {
          // __dirname is the extension's dist folder, go up to find node_modules
          const extensionRoot = path.join(__dirname, '..');
          const wasmPath = path.join(extensionRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
          wasmLoadAttempts.push(`__dirname: ${wasmPath}`);
          
          if (fs.existsSync(wasmPath)) {
            wasmBinary = fs.readFileSync(wasmPath);
            console.log('[MemoryStore] Loaded wasm binary from extension path:', wasmPath);
          } else {
            console.warn('[MemoryStore] WASM not found at extension path:', wasmPath);
          }
        } catch (e) {
          console.warn('[MemoryStore] Failed to load wasm from extension path:', e);
          wasmLoadAttempts.push(`__dirname failed: ${e}`);
        }
      }
      
      // Method 3: Fallback to process.cwd() (development mode)
      if (!wasmBinary) {
        try {
          const fallbackPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
          wasmLoadAttempts.push(`process.cwd: ${fallbackPath}`);
          
          if (fs.existsSync(fallbackPath)) {
            wasmBinary = fs.readFileSync(fallbackPath);
            console.log('[MemoryStore] Loaded wasm binary from cwd fallback:', fallbackPath);
          } else {
            console.warn('[MemoryStore] WASM not found at cwd path:', fallbackPath);
          }
        } catch (e) {
          console.warn('[MemoryStore] Fallback wasm load also failed:', e);
          wasmLoadAttempts.push(`process.cwd failed: ${e}`);
        }
      }
      
      if (!wasmBinary) {
        console.error('[MemoryStore] All WASM load attempts failed:', wasmLoadAttempts);
        throw new Error(`Could not locate sql-wasm.wasm file. Attempts: ${wasmLoadAttempts.join('; ')}`);
      }

      // Initialize with wasmBinary directly - most reliable method
      // Polyfill navigator to avoid issues with newer Node.js versions
      const globalObj = global as any;
      const hadNavigator = typeof globalObj.navigator !== 'undefined';
      const oldNavigator = hadNavigator ? globalObj.navigator : undefined;
      
      if (!hadNavigator) {
        try {
          globalObj.navigator = {};
        } catch (navErr) {
          console.warn('[MemoryStore] Could not polyfill navigator:', navErr);
          // Continue anyway, might still work
        }
      }
      
      try {
        const SQL = await initSqlJs({ wasmBinary });
        console.log('[MemoryStore] sql.js initialized successfully, creating database');
        
        // Try to load existing DB file
        let fileBuffer: Buffer | undefined;
        try {
          fileBuffer = fs.readFileSync(dbPath);
          console.log('[MemoryStore] Loaded existing database from:', dbPath);
        } catch (err) {
          console.log('[MemoryStore] Creating new database at:', dbPath);
        }
        
        this.db = new SQL.Database(fileBuffer);
        this.backend = 'sql.js';
        this.initializeSchema();
        this.isInitialized = true;
        
        // Persist to disk
        this.persistSqlJs();
        
        console.log('[MemoryStore] Using sql.js (WebAssembly SQLite) backend - SUCCESS');
        return true;
      } catch (sqlErr) {
        console.error('[MemoryStore] Error during sql.js initialization or DB creation:', sqlErr);
        throw sqlErr;
      } finally {
        // Restore navigator to original state
        try {
          if (hadNavigator) {
            globalObj.navigator = oldNavigator;
          } else {
            delete globalObj.navigator;
          }
        } catch (navCleanupErr) {
          console.warn('[MemoryStore] Could not restore navigator:', navCleanupErr);
        }
      }
    } catch (err) {
      console.error('[MemoryStore] sql.js initialization failed with error:', err);
      console.error('[MemoryStore] Error details:', {
        name: (err as any)?.name,
        message: (err as any)?.message,
        stack: (err as any)?.stack?.split('\n').slice(0, 5).join('\n')
      });
      
      try {
        // Fallback to better-sqlite3 (optional, native)
        console.log('[MemoryStore] Attempting fallback to better-sqlite3');
        const Database = require('better-sqlite3');
        if (!Database) {
          throw new Error('better-sqlite3 not available');
        }

        this.db = new Database(dbPath);
        this.backend = 'better-sqlite3';
        this.initializeSchema();
        this.isInitialized = true;
        console.log('[MemoryStore] Using better-sqlite3 (native) backend - SUCCESS');
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
            content TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            phase TEXT DEFAULT NULL,
            progress_status TEXT DEFAULT NULL,
            embedding BLOB DEFAULT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_file_timestamp 
            ON entries(file_type, timestamp DESC);
          
          CREATE INDEX IF NOT EXISTS idx_tag 
            ON entries(tag);

          CREATE TABLE IF NOT EXISTS token_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            total_tokens INTEGER NOT NULL,
            operation TEXT,
            context_status TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_token_timestamp 
            ON token_metrics(timestamp DESC);

          CREATE TABLE IF NOT EXISTS query_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            operation TEXT NOT NULL,
            elapsed_ms INTEGER NOT NULL,
            result_count INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_query_timestamp 
            ON query_metrics(timestamp DESC);
        `);
      } else if (this.backend === 'sql.js') {
        // sql.js uses run() for each statement
        const statements = [
          `CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_type TEXT NOT NULL CHECK(file_type IN ('CONTEXT', 'DECISION', 'PROGRESS', 'PATTERN', 'BRIEF')),
            timestamp TEXT NOT NULL,
            tag TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            phase TEXT DEFAULT NULL,
            progress_status TEXT DEFAULT NULL,
            embedding BLOB DEFAULT NULL
          )`,
          `CREATE INDEX IF NOT EXISTS idx_file_timestamp 
            ON entries(file_type, timestamp DESC)`,
          `CREATE INDEX IF NOT EXISTS idx_tag 
            ON entries(tag)`,
          `CREATE TABLE IF NOT EXISTS token_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            model TEXT NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            total_tokens INTEGER NOT NULL,
            operation TEXT,
            context_status TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
          `CREATE INDEX IF NOT EXISTS idx_token_timestamp 
            ON token_metrics(timestamp DESC)`,
          `CREATE TABLE IF NOT EXISTS query_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            operation TEXT NOT NULL,
            elapsed_ms INTEGER NOT NULL,
            result_count INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
          `CREATE INDEX IF NOT EXISTS idx_query_timestamp 
            ON query_metrics(timestamp DESC)`
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

    // Run migrations for existing databases
    this.runMigrations();
  }

  /**
   * Run database migrations for schema updates
   */
  private runMigrations(): void {
    if (!this.db || !this.isInitialized) return;

    try {
      if (this.backend === 'better-sqlite3') {
        // Check existing columns
        const tableInfo = this.db.prepare('PRAGMA table_info(entries)').all() as Array<{name: string}>;
        const columnNames = new Set(tableInfo.map(col => col.name));
        
        // Migration 1: Add metadata column if missing
        if (!columnNames.has('metadata')) {
          console.log('[MemoryStore] Running migration: Adding metadata column to entries');
          try {
            this.db.prepare('ALTER TABLE entries ADD COLUMN metadata TEXT DEFAULT \'{}\'').run();
          } catch (e) {
            console.warn('[MemoryStore] metadata column already exists or migration failed:', e);
          }
        }
        
        // Migration 2: Add phase column if missing
        if (!columnNames.has('phase')) {
          console.log('[MemoryStore] Running migration: Adding phase column to entries');
          try {
            this.db.prepare('ALTER TABLE entries ADD COLUMN phase TEXT DEFAULT NULL').run();
          } catch (e) {
            console.warn('[MemoryStore] phase column already exists or migration failed:', e);
          }
        }
        
        // Migration 3: Add progress_status column if missing
        if (!columnNames.has('progress_status')) {
          console.log('[MemoryStore] Running migration: Adding progress_status column to entries');
          try {
            this.db.prepare('ALTER TABLE entries ADD COLUMN progress_status TEXT DEFAULT NULL').run();
          } catch (e) {
            console.warn('[MemoryStore] progress_status column already exists or migration failed:', e);
          }
        }
        
        // Migration 4: Add operation column to token_metrics if it doesn't exist
        const tokenMetricsInfo = this.db.prepare('PRAGMA table_info(token_metrics)').all() as Array<{name: string}>;
        const hasOperation = tokenMetricsInfo.some(col => col.name === 'operation');
        
        if (!hasOperation) {
          console.log('[MemoryStore] Running migration: Adding operation column to token_metrics');
          try {
            this.db.prepare('ALTER TABLE token_metrics ADD COLUMN operation TEXT').run();
          } catch (e) {
            console.warn('[MemoryStore] operation column already exists:', e);
          }
        }
      } else if (this.backend === 'sql.js') {
        // Check existing columns
        const tableInfo = this.db.exec('PRAGMA table_info(entries)');
        const columnNames = new Set<string>();
        if (tableInfo.length > 0) {
          tableInfo[0].values.forEach((row: any) => {
            columnNames.add(row[1] as string);
          });
        }
        
        // Migration 1: Add metadata column if missing
        if (!columnNames.has('metadata')) {
          console.log('[MemoryStore] Running migration: Adding metadata column to entries');
          try {
            this.db.run('ALTER TABLE entries ADD COLUMN metadata TEXT DEFAULT \'{}\'');
            this.persistSqlJs();
          } catch (e) {
            console.warn('[MemoryStore] metadata column migration failed:', e);
          }
        }
        
        // Migration 2: Add phase column if missing
        if (!columnNames.has('phase')) {
          console.log('[MemoryStore] Running migration: Adding phase column to entries');
          try {
            this.db.run('ALTER TABLE entries ADD COLUMN phase TEXT DEFAULT NULL');
            this.persistSqlJs();
          } catch (e) {
            console.warn('[MemoryStore] phase column migration failed:', e);
          }
        }
        
        // Migration 3: Add progress_status column if missing
        if (!columnNames.has('progress_status')) {
          console.log('[MemoryStore] Running migration: Adding progress_status column to entries');
          try {
            this.db.run('ALTER TABLE entries ADD COLUMN progress_status TEXT DEFAULT NULL');
            this.persistSqlJs();
          } catch (e) {
            console.warn('[MemoryStore] progress_status column migration failed:', e);
          }
        }
        
        // Migration 4: Add operation column to token_metrics if missing
        const tokenTableInfo = this.db.exec('PRAGMA table_info(token_metrics)');
        const tokenColumnNames = new Set<string>();
        if (tokenTableInfo.length > 0) {
          tokenTableInfo[0].values.forEach((row: any) => {
            tokenColumnNames.add(row[1] as string);
          });
        }
        
        if (!tokenColumnNames.has('operation')) {
          console.log('[MemoryStore] Running migration: Adding operation column to token_metrics');
          try {
            this.db.run('ALTER TABLE token_metrics ADD COLUMN operation TEXT');
            this.persistSqlJs();
          } catch (e) {
            console.warn('[MemoryStore] operation column migration failed:', e);
          }
        }
      }
    } catch (err) {
      console.error('[MemoryStore] Migration failed:', err);
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
          INSERT INTO entries (file_type, timestamp, tag, content, metadata, phase, progress_status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
          entry.file_type,
          entry.timestamp,
          entry.tag,
          entry.content,
          entry.metadata ?? '{}',
          entry.phase ?? null,
          entry.progress_status ?? null
        );
        return result.lastInsertRowid as number;
      } else if (this.backend === 'sql.js') {
        this.db.run(
          `INSERT INTO entries (file_type, timestamp, tag, content, metadata, phase, progress_status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [entry.file_type, entry.timestamp, entry.tag, entry.content, entry.metadata ?? '{}', entry.phase ?? null, entry.progress_status ?? null]
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
          SELECT id, file_type, timestamp, tag, content, metadata, phase, progress_status
          FROM entries
          WHERE file_type = ?
          ORDER BY timestamp DESC
          LIMIT ?
        `);
        const entries = stmt.all(fileType, limit) as MemoryEntry[];
        return { entries, count: entries.length };
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT id, file_type, timestamp, tag, content, metadata, phase, progress_status
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
          SELECT id, file_type, timestamp, tag, content, metadata, phase, progress_status
          FROM entries
          WHERE file_type = ? AND timestamp >= ? AND timestamp < ?
          ORDER BY timestamp DESC
        `);
        const entries = stmt.all(fileType, startDate, endDate) as MemoryEntry[];
        return { entries, count: entries.length };
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT id, file_type, timestamp, tag, content, metadata, phase, progress_status
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
          SELECT id, file_type, timestamp, tag, content, metadata, phase, progress_status
          FROM entries
          WHERE content LIKE ?
          ORDER BY timestamp DESC
          LIMIT ?
        `);
        const entries = stmt.all(`%${query}%`, limit) as MemoryEntry[];
        return { entries, count: entries.length };
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT id, file_type, timestamp, tag, content, metadata, phase, progress_status
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
      
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write with explicit sync to ensure it's flushed to disk
      fs.writeFileSync(this.dbPath, buffer, { flag: 'w', mode: 0o666 });
      console.log('[MemoryStore] Persisted database to:', this.dbPath, 'size:', buffer.length);
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

  /**
   * Log token metric to database
   */
  async logTokenMetric(metric: Omit<TokenMetric, 'id' | 'created_at'>): Promise<number | null> {
    if (!this.db || !this.isInitialized) return null;

    try {
      if (this.backend === 'better-sqlite3') {
        const stmt = this.db.prepare(`
          INSERT INTO token_metrics (timestamp, model, input_tokens, output_tokens, total_tokens, operation, context_status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
          metric.timestamp,
          metric.model,
          metric.input_tokens,
          metric.output_tokens,
          metric.total_tokens,
          metric.operation || null,
          metric.context_status || null
        );
        return result.lastInsertRowid as number;
      } else if (this.backend === 'sql.js') {
        this.db.run(
          `INSERT INTO token_metrics (timestamp, model, input_tokens, output_tokens, total_tokens, operation, context_status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [metric.timestamp, metric.model, metric.input_tokens, metric.output_tokens, metric.total_tokens, metric.operation || null, metric.context_status || null]
        );
        this.persistSqlJs();
        return Math.floor(Date.now() / 1000);
      }
    } catch (err) {
      console.error('[MemoryStore] logTokenMetric failed:', err);
    }
    return null;
  }

  /**
   * Query token metrics
   */
  async queryTokenMetrics(limit: number = 100): Promise<TokenMetric[]> {
    if (!this.db || !this.isInitialized) return [];

    try {
      if (this.backend === 'better-sqlite3') {
        const stmt = this.db.prepare(`
          SELECT id, timestamp, model, input_tokens, output_tokens, total_tokens, context_status, created_at
          FROM token_metrics
          ORDER BY timestamp DESC
          LIMIT ?
        `);
        return stmt.all(limit) as TokenMetric[];
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT id, timestamp, model, input_tokens, output_tokens, total_tokens, context_status, created_at
          FROM token_metrics
          ORDER BY timestamp DESC
          LIMIT ?
        `);
        stmt.bind([limit]);
        const metrics: TokenMetric[] = [];
        while (stmt.step()) {
          metrics.push(stmt.getAsObject() as TokenMetric);
        }
        stmt.free();
        return metrics;
      }
    } catch (err) {
      console.error('[MemoryStore] queryTokenMetrics failed:', err);
    }
    return [];
  }

  /**
   * Get token metrics for a date range
   */
  async getTokenMetrics(days: number = 7): Promise<TokenMetric[]> {
    if (!this.db || !this.isInitialized) return [];

    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      if (this.backend === 'better-sqlite3') {
        const stmt = this.db.prepare(`
          SELECT id, timestamp, model, input_tokens, output_tokens, total_tokens, context_status, created_at
          FROM token_metrics
          WHERE timestamp >= ?
          ORDER BY timestamp DESC
        `);
        return stmt.all(startDate) as TokenMetric[];
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT id, timestamp, model, input_tokens, output_tokens, total_tokens, context_status, created_at
          FROM token_metrics
          WHERE timestamp >= ?
          ORDER BY timestamp DESC
        `);
        stmt.bind([startDate]);
        const metrics: TokenMetric[] = [];
        while (stmt.step()) {
          metrics.push(stmt.getAsObject() as TokenMetric);
        }
        stmt.free();
        return metrics;
      }
    } catch (err) {
      console.error('[MemoryStore] Get token metrics failed:', err);
    }
    return [];
  }

  /**
   * Get query metrics for a specific operation
   */
  async getQueryMetrics(operation: string, days: number = 7): Promise<QueryMetric[]> {
    if (!this.db || !this.isInitialized) return [];

    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      if (this.backend === 'better-sqlite3') {
        const stmt = this.db.prepare(`
          SELECT id, timestamp, operation, elapsed_ms, result_count, created_at
          FROM query_metrics
          WHERE operation = ? AND timestamp >= ?
          ORDER BY timestamp DESC
        `);
        return stmt.all(operation, startDate) as QueryMetric[];
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT id, timestamp, operation, elapsed_ms, result_count, created_at
          FROM query_metrics
          WHERE operation = ? AND timestamp >= ?
          ORDER BY timestamp DESC
        `);
        stmt.bind([operation, startDate]);
        const metrics: QueryMetric[] = [];
        while (stmt.step()) {
          metrics.push(stmt.getAsObject() as QueryMetric);
        }
        stmt.free();
        return metrics;
      }
    } catch (err) {
      console.error('[MemoryStore] Get query metrics failed:', err);
    }
    return [];
  }

  /**
   * Get latest entry for a specific type (for metrics display)
   */
  async getLatestEntry(metricType: 'token_metrics' | 'query_metrics'): Promise<any | null> {
    if (!this.db || !this.isInitialized) return null;

    try {
      if (metricType === 'token_metrics') {
        if (this.backend === 'better-sqlite3') {
          const stmt = this.db.prepare(`
            SELECT id, timestamp, model, input_tokens, output_tokens, total_tokens, context_status, created_at
            FROM token_metrics
            ORDER BY timestamp DESC
            LIMIT 1
          `);
          const result = stmt.get() as TokenMetric | undefined;
          return result || null;
        } else if (this.backend === 'sql.js') {
          const stmt = this.db.prepare(`
            SELECT id, timestamp, model, input_tokens, output_tokens, total_tokens, context_status, created_at
            FROM token_metrics
            ORDER BY timestamp DESC
            LIMIT 1
          `);
          if (stmt.step()) {
            const result = stmt.getAsObject() as TokenMetric;
            stmt.free();
            return result;
          }
          stmt.free();
          return null;
        }
      } else if (metricType === 'query_metrics') {
        if (this.backend === 'better-sqlite3') {
          const stmt = this.db.prepare(`
            SELECT id, timestamp, operation, elapsed_ms, result_count, created_at
            FROM query_metrics
            ORDER BY timestamp DESC
            LIMIT 1
          `);
          const result = stmt.get() as QueryMetric | undefined;
          return result || null;
        } else if (this.backend === 'sql.js') {
          const stmt = this.db.prepare(`
            SELECT id, timestamp, operation, elapsed_ms, result_count, created_at
            FROM query_metrics
            ORDER BY timestamp DESC
            LIMIT 1
          `);
          if (stmt.step()) {
            const result = stmt.getAsObject() as QueryMetric;
            stmt.free();
            return result;
          }
          stmt.free();
          return null;
        }
      }
    } catch (err) {
      console.error('[MemoryStore] Get latest entry failed:', err);
    }
    return null;
  }

  /**
   * Count entries grouped by file type
   */
  async getEntryCounts(): Promise<Record<MemoryEntry['file_type'], number>> {
    const counts: Record<MemoryEntry['file_type'], number> = {
      CONTEXT: 0,
      DECISION: 0,
      PROGRESS: 0,
      PATTERN: 0,
      BRIEF: 0
    };

    if (!this.db || !this.isInitialized) return counts;

    try {
      if (this.backend === 'better-sqlite3') {
        const stmt = this.db.prepare(`
          SELECT file_type, COUNT(*) as count
          FROM entries
          GROUP BY file_type
        `);
        const rows = stmt.all() as { file_type: MemoryEntry['file_type']; count: number }[];
        for (const row of rows) {
          counts[row.file_type] = row.count;
        }
        return counts;
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT file_type, COUNT(*) as count
          FROM entries
          GROUP BY file_type
        `);
        const rows: { file_type: MemoryEntry['file_type']; count: number }[] = [];
        while (stmt.step()) {
          const obj = stmt.getAsObject();
          rows.push({
            file_type: obj.file_type as MemoryEntry['file_type'],
            count: obj.count as number
          });
        }
        stmt.free();
        for (const row of rows) {
          counts[row.file_type] = row.count;
        }
        return counts;
      }
    } catch (err) {
      console.error('[MemoryStore] Get entry counts failed:', err);
    }
    return counts;
  }

  /**
   * Count entries that have embeddings
   */
  async countEntriesWithEmbeddings(): Promise<number> {
    if (!this.db || !this.isInitialized) return 0;

    try {
      if (this.backend === 'better-sqlite3') {
        const stmt = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM entries
          WHERE embedding IS NOT NULL
        `);
        const result = stmt.get() as { count: number };
        return result.count;
      } else if (this.backend === 'sql.js') {
        const stmt = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM entries
          WHERE embedding IS NOT NULL
        `);
        let count = 0;
        if (stmt.step()) {
          const obj = stmt.getAsObject();
          count = obj.count as number;
        }
        stmt.free();
        return count;
      }
    } catch (err) {
      console.error('[MemoryStore] Count entries with embeddings failed:', err);
    }
    return 0;
  }

  /**
   * Rolling average of recorded query timings in milliseconds
   */
  getAverageQueryTimeMs(): number | null {
    if (!this.querySamples.length) return null;
    const sum = this.querySamples.reduce((a, b) => a + b, 0);
    return sum / this.querySamples.length;
  }

  private recordTiming(durationMs: number) {
    if (Number.isFinite(durationMs)) {
      this.querySamples.push(durationMs);
      if (this.querySamples.length > this.maxSamples) {
        this.querySamples.shift();
      }
    }
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
