#!/usr/bin/env node

/**
 * Database Schema Migration Script
 * Migrates memory.db to include RESEARCH_REPORT, PLAN_REPORT, EXECUTION_REPORT in CHECK constraint
 * 
 * SAFE: Preserves all existing data
 * IDEMPOTENT: Can be run multiple times safely
 * 
 * Usage: node scripts/migrate-schema.js
 */

const fs = require('fs');
const path = require('path');

async function migrate() {
  const projectRoot = path.join(__dirname, '..');
  const dbPath = path.join(projectRoot, 'AI-Memory/memory.db');

  // Check if database exists
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Database not found at:', dbPath);
    console.log('No migration needed - database will be created with correct schema.');
    return;
  }

  console.log('🔍 Found database at:', dbPath);
  console.log('📦 Loading sql.js...');

  // Load sql.js from project dependencies
  const initSqlJs = require(path.join(projectRoot, 'node_modules/sql.js'));
  const SQL = await initSqlJs({
    locateFile: file => path.join(projectRoot, 'node_modules/sql.js/dist', file)
  });

  // Read existing database
  console.log('📖 Reading database...');
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  // Check current schema
  const schemaResult = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='entries'");
  if (schemaResult.length === 0 || schemaResult[0].values.length === 0) {
    console.log('❌ No entries table found in database');
    db.close();
    return;
  }

  const currentSchema = schemaResult[0].values[0][0];
  
  // Check if migration already applied
  if (currentSchema.includes('RESEARCH_REPORT')) {
    console.log('✅ Schema already up-to-date - no migration needed');
    console.log('   CHECK constraint includes: RESEARCH_REPORT, PLAN_REPORT, EXECUTION_REPORT');
    db.close();
    return;
  }

  console.log('⚠️  Schema needs migration');
  console.log('   Current CHECK constraint only includes: CONTEXT, DECISION, PROGRESS, PATTERN, BRIEF');
  console.log('');

  // Count existing entries
  const countResult = db.exec('SELECT COUNT(*) FROM entries');
  const entryCount = countResult[0].values[0][0];
  console.log(`📊 Database contains ${entryCount} entries`);

  // Create backup
  const backupPath = dbPath + `.backup-${new Date().toISOString().split('T')[0]}`;
  fs.copyFileSync(dbPath, backupPath);
  console.log(`💾 Backup created: ${path.basename(backupPath)}`);
  console.log('');

  console.log('🔧 Running migration...');

  try {
    // Create new table with updated CHECK constraint
    db.run(`
      CREATE TABLE entries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_type TEXT NOT NULL CHECK(file_type IN ('CONTEXT', 'DECISION', 'PROGRESS', 'PATTERN', 'BRIEF', 'RESEARCH_REPORT', 'PLAN_REPORT', 'EXECUTION_REPORT')),
        timestamp TEXT NOT NULL,
        tag TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        phase TEXT DEFAULT NULL,
        progress_status TEXT DEFAULT NULL,
        embedding BLOB DEFAULT NULL
      )
    `);

    // Copy all data
    db.run('INSERT INTO entries_new SELECT * FROM entries');

    // Verify data copied correctly
    const verifyResult = db.exec('SELECT COUNT(*) FROM entries_new');
    const newCount = verifyResult[0].values[0][0];

    if (newCount !== entryCount) {
      throw new Error(`Data loss detected! Original: ${entryCount}, New: ${newCount}`);
    }

    // Drop old table and rename new one
    db.run('DROP TABLE entries');
    db.run('ALTER TABLE entries_new RENAME TO entries');

    console.log('✅ Migration successful!');
    console.log(`   ✓ All ${entryCount} entries preserved`);
    console.log('   ✓ CHECK constraint updated');
    console.log('');

    // Verify final schema
    const finalSchemaResult = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='entries'");
    const finalSchema = finalSchemaResult[0].values[0][0];
    const checkMatch = finalSchema.match(/CHECK\(file_type IN \([^)]+\)\)/);
    
    if (checkMatch) {
      console.log('📋 New CHECK constraint:');
      console.log('   ' + checkMatch[0]);
    }

    // Save to disk
    const data = db.export();
    fs.writeFileSync(dbPath, data);
    console.log('');
    console.log('💾 Database saved to disk');
    console.log('✅ Migration complete!');
    console.log('');
    console.log('⚡ Next step: Reload VS Code window to load the updated schema');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('');
    console.log('🔄 Database NOT modified - backup available at:', backupPath);
    db.close();
    process.exit(1);
  }

  db.close();
}

// Run migration
migrate().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
