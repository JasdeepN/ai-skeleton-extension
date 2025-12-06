// Schema Migration Manager - Handle database schema upgrades safely
// Manages schema versioning and migrations for memory.db

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MemoryStore } from './memoryStore';

export interface SchemaVersion {
  version: number;
  description: string;
  sql: string[];
}

/**
 * Get current schema version from database
 */
export async function getCurrentSchemaVersion(store: MemoryStore): Promise<number> {
  try {
    // Check if schema_version table exists
    const tables = store.queryRaw("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'");

    if (tables.length === 0) {
      // schema_version table doesn't exist, this is version 0 (original schema)
      return 0;
    }

    // Get current version
    const rows = store.queryRaw('SELECT version FROM schema_version ORDER BY id DESC LIMIT 1');
    return rows.length > 0 ? (rows[0].version || 0) : 0;
  } catch (error) {
    console.error('[SchemaManager] Error getting schema version:', error);
    return 0;
  }
}

/**
 * Create backup of memory.db before migration
 */
export async function createBackup(dbPath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupDir = path.join(path.dirname(dbPath), '.backup');
  const backupPath = path.join(backupDir, `memory.db.${timestamp}.backup`);

  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Copy database file
  fs.copyFileSync(dbPath, backupPath);

  console.log(`[SchemaManager] Backup created: ${backupPath}`);
  return backupPath;
}

/**
 * Schema migration definitions
 * Each migration includes version number, description, and SQL statements
 */
export const SCHEMA_MIGRATIONS: SchemaVersion[] = [
  // Migration 1: Add schema_version table and metrics tables (v0.2.0)
  {
    version: 1,
    description: 'Add schema_version table and metrics tables (token_metrics, query_metrics)',
    sql: [
      // Create schema_version table
      `CREATE TABLE IF NOT EXISTS schema_version (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL,
        description TEXT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Create token_metrics table
      `CREATE TABLE IF NOT EXISTS token_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        context_status TEXT CHECK(context_status IN ('healthy', 'warning', 'critical')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Indexes for token_metrics
      `CREATE INDEX IF NOT EXISTS idx_token_metrics_timestamp 
        ON token_metrics(timestamp DESC)`,
      
      `CREATE INDEX IF NOT EXISTS idx_token_metrics_model 
        ON token_metrics(model)`,
      
      `CREATE INDEX IF NOT EXISTS idx_token_metrics_status 
        ON token_metrics(context_status)`,

      // Create query_metrics table
      `CREATE TABLE IF NOT EXISTS query_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        operation TEXT NOT NULL,
        elapsed_ms REAL NOT NULL,
        result_count INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Indexes for query_metrics
      `CREATE INDEX IF NOT EXISTS idx_query_metrics_timestamp 
        ON query_metrics(timestamp DESC)`,
      
      `CREATE INDEX IF NOT EXISTS idx_query_metrics_operation 
        ON query_metrics(operation)`,

      // Record this migration
      `INSERT INTO schema_version (version, description) 
        VALUES (1, 'Add schema_version table and metrics tables (token_metrics, query_metrics)')`
    ]
  }
  // Future migrations go here:
  // {
  //   version: 2,
  //   description: 'Add new feature X',
  //   sql: [...]
  // }
];

/**
 * Apply pending migrations to database
 */
export async function applyMigrations(
  store: MemoryStore,
  dbPath: string,
  outputChannel?: vscode.OutputChannel
): Promise<{ success: boolean; migrationsApplied: number; backupPath?: string; error?: string }> {
  const log = (msg: string) => {
    console.log(`[SchemaManager] ${msg}`);
    outputChannel?.appendLine(msg);
  };

  try {
    // Get current schema version
    const currentVersion = await getCurrentSchemaVersion(store);
    log(`Current schema version: ${currentVersion}`);

    // Find pending migrations
    const pendingMigrations = SCHEMA_MIGRATIONS.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      log('No migrations needed - schema is up to date');
      return { success: true, migrationsApplied: 0 };
    }

    log(`Found ${pendingMigrations.length} pending migration(s)`);

    // Create backup before migration
    const backupPath = await createBackup(dbPath);
    log(`Database backup created: ${backupPath}`);

    // Apply each migration
    let applied = 0;

    for (const migration of pendingMigrations) {
      log(`Applying migration ${migration.version}: ${migration.description}`);

      try {
        // Use transaction for safety (auto-handles both backends)
        store.transaction(() => {
          for (const sql of migration.sql) {
            store.execRaw(sql);
          }
        });

        applied++;
        log(`✓ Migration ${migration.version} applied successfully`);
      } catch (error) {
        const errMsg = `Failed to apply migration ${migration.version}: ${error}`;
        log(`✗ ${errMsg}`);
        return {
          success: false,
          migrationsApplied: applied,
          backupPath,
          error: errMsg
        };
      }
    }

    log(`All migrations applied successfully (${applied} migration(s))`);
    log(`Backup preserved at: ${backupPath}`);

    return {
      success: true,
      migrationsApplied: applied,
      backupPath
    };
  } catch (error) {
    const errMsg = `Migration failed: ${error}`;
    log(`✗ ${errMsg}`);
    return {
      success: false,
      migrationsApplied: 0,
      error: errMsg
    };
  }
}

/**
 * Check if migrations are needed and prompt user
 */
export async function checkAndPromptMigration(
  store: MemoryStore,
  dbPath: string,
  outputChannel?: vscode.OutputChannel
): Promise<boolean> {
  const currentVersion = await getCurrentSchemaVersion(store);
  const latestVersion = SCHEMA_MIGRATIONS.length > 0 
    ? Math.max(...SCHEMA_MIGRATIONS.map(m => m.version))
    : 0;

  if (currentVersion >= latestVersion) {
    return true; // No migration needed
  }

  const pendingCount = SCHEMA_MIGRATIONS.filter(m => m.version > currentVersion).length;
  
  // Show notification with migration details
  const choice = await vscode.window.showInformationMessage(
    `AI-Memory database needs to be updated (${pendingCount} schema migration${pendingCount > 1 ? 's' : ''} pending).\n\n` +
    `Current version: ${currentVersion}, Latest version: ${latestVersion}\n\n` +
    `A backup will be created automatically before upgrading.`,
    { modal: true },
    'Upgrade Now',
    'View Details',
    'Cancel'
  );

  if (choice === 'View Details') {
    const details = SCHEMA_MIGRATIONS
      .filter(m => m.version > currentVersion)
      .map(m => `• v${m.version}: ${m.description}`)
      .join('\n');
    
    const proceed = await vscode.window.showInformationMessage(
      `Pending migrations:\n\n${details}\n\nProceed with upgrade?`,
      { modal: true },
      'Upgrade Now',
      'Cancel'
    );

    if (proceed !== 'Upgrade Now') {
      return false;
    }
  } else if (choice !== 'Upgrade Now') {
    return false;
  }

  // Apply migrations
  const result = await applyMigrations(store, dbPath, outputChannel);

  if (result.success) {
    vscode.window.showInformationMessage(
      `Database upgraded successfully! (${result.migrationsApplied} migration${result.migrationsApplied > 1 ? 's' : ''} applied)\n\n` +
      `Backup saved at: ${path.basename(result.backupPath || '')}`,
      'OK'
    );
    return true;
  } else {
    vscode.window.showErrorMessage(
      `Database migration failed: ${result.error}\n\n` +
      `Your data is safe - backup available at: ${path.basename(result.backupPath || '')}`,
      'OK'
    );
    return false;
  }
}
