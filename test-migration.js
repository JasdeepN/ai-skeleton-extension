// Test schema migration locally before deploying
const path = require('path');
const { getMemoryStore } = require('./dist/src/memoryStore');
const { applyMigrations, getCurrentSchemaVersion } = require('./dist/src/memorySchemaManager');

async function testMigration() {
  console.log('=== Testing Schema Migration ===\n');
  
  const dbPath = path.join(__dirname, 'AI-Memory', 'memory.db');
  console.log('Database path:', dbPath);
  
  const store = getMemoryStore();
  
  try {
    // Initialize database
    console.log('\n1. Initializing database...');
    const initialized = await store.init(dbPath);
    
    if (!initialized) {
      console.error('✗ Failed to initialize database');
      process.exit(1);
    }
    console.log('✓ Database initialized');
    
    // Check current version
    console.log('\n2. Checking current schema version...');
    const currentVersion = await getCurrentSchemaVersion(store);
    console.log(`Current schema version: ${currentVersion}`);
    
    // Apply migrations
    console.log('\n3. Applying migrations...');
    const result = await applyMigrations(store, dbPath);
    
    if (result.success) {
      console.log(`\n✓ SUCCESS: ${result.migrationsApplied} migration(s) applied`);
      if (result.backupPath) {
        console.log(`  Backup created at: ${result.backupPath}`);
      }
    } else {
      console.error(`\n✗ FAILED: ${result.error}`);
      if (result.backupPath) {
        console.log(`  Backup available at: ${result.backupPath}`);
      }
      process.exit(1);
    }
    
    // Verify new version
    console.log('\n4. Verifying new schema version...');
    const newVersion = await getCurrentSchemaVersion(store);
    console.log(`New schema version: ${newVersion}`);
    
    // Check tables
    console.log('\n5. Checking database tables...');
    const tables = store.queryRaw("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('Tables:', tables.map(t => t.name).join(', '));
    
    // Check token_metrics schema
    console.log('\n6. Verifying token_metrics table...');
    const tokenCols = store.queryRaw("PRAGMA table_info(token_metrics)");
    console.log('token_metrics columns:', tokenCols.map(c => c.name).join(', '));
    
    // Check query_metrics schema
    console.log('\n7. Verifying query_metrics table...');
    const queryCols = store.queryRaw("PRAGMA table_info(query_metrics)");
    console.log('query_metrics columns:', queryCols.map(c => c.name).join(', '));
    
    console.log('\n=== Migration Test Complete ===');
    
  } catch (error) {
    console.error('\n✗ ERROR:', error);
    process.exit(1);
  }
}

testMigration().catch(console.error);
