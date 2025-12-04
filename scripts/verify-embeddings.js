#!/usr/bin/env node
/**
 * Verify Embeddings Script
 * 
 * Validates that all source files (prompts, agents, protected files) are properly
 * embedded with current content. Prevents stale embeddings from being released.
 * 
 * Usage: node scripts/verify-embeddings.js
 * Exit codes:
 *   0 = All embeddings valid
 *   1 = One or more embeddings out of date
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function decodeBase64(b64) {
  return Buffer.from(b64.replace(/\n/g, ''), 'base64').toString('utf8');
}

function readSourceFile(filepath) {
  try {
    return fs.readFileSync(filepath, 'utf8');
  } catch (e) {
    return null;
  }
}

function extractEmbeddedContent(storePath, type = 'prompt') {
  try {
    const storeContent = fs.readFileSync(storePath, 'utf8');
    const embedded = {};

    // Match base64 strings in store file based on type
    let pattern, dataKey;
    if (type === 'prompt') {
      pattern = /id:\s*'([^']+)'[,\s]+filename:\s*'([^']+)'[,\s]+title:\s*'([^']+)'[,\s]+base64:\s*'([^']+)'/g;
      dataKey = 'embeddedPromptsData';
    } else if (type === 'agent') {
      pattern = /id:\s*'([^']+)'[,\s]+filename:\s*'([^']+)'[,\s]+title:\s*'([^']+)'[,\s]+base64:\s*'([^']+)'/g;
      dataKey = 'embeddedAgentsData';
    } else if (type === 'file') {
      pattern = /id:\s*'([^']+)'[,\s]+filename:\s*'([^']+)'[,\s]+title:\s*'([^']+)'[,\s]+base64:\s*'([^']+)'/g;
      dataKey = 'embeddedProtectedFilesData';
    }

    let match;
    while ((match = pattern.exec(storeContent)) !== null) {
      const [, id, filename, title, b64] = match;
      embedded[id] = {
        filename,
        title,
        content: decodeBase64(b64),
      };
    }

    return embedded;
  } catch (e) {
    console.error(`Error reading ${storePath}:`, e.message);
    return {};
  }
}

function verifyPrompts() {
  console.log(`\n${colors.blue}=== Verifying Prompts ===${colors.reset}`);

  // Mapping from filename to ID (matches embed-prompts.js)
  const idMap = {
    'checkpoint': 'checkpoint',
    'execute': 'execute',
    'gh': 'githubActions',
    'plan': 'plan',
    'startup': 'startup',
    'sync': 'sync',
    'think': 'think',
  };

  const promptsDir = path.join(__dirname, '..', 'embeds', 'prompts');
  const embedded = extractEmbeddedContent(
    path.join(__dirname, '..', 'src', 'promptStore.ts'),
    'prompt'
  );

  const sourceFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  let issues = 0;

  for (const file of sourceFiles) {
    const prefix = file.replace(/\.prompt\.md$/, '').toLowerCase();
    const id = idMap[prefix] || prefix;
    const filepath = path.join(promptsDir, file);
    const sourceContent = readSourceFile(filepath);

    if (!sourceContent) {
      console.log(`${colors.red}✗ ${file}${colors.reset} - Source file not found`);
      issues++;
      continue;
    }

    const sourceHash = hash(sourceContent);

    if (!embedded[id]) {
      console.log(`${colors.red}✗ ${file}${colors.reset} - Not embedded in promptStore.ts (looked for id: ${id})`);
      issues++;
      continue;
    }

    const embeddedHash = hash(embedded[id].content);

    if (sourceHash === embeddedHash) {
      console.log(`${colors.green}✓ ${file}${colors.reset} - OK`);
    } else {
      console.log(
        `${colors.red}✗ ${file}${colors.reset} - Content mismatch\n` +
        `  Source:   ${sourceHash}\n` +
        `  Embedded: ${embeddedHash}`
      );
      issues++;
    }
  }

  return issues;
}

function verifyAgents() {
  console.log(`\n${colors.bold}=== Verifying Agents ===${colors.reset}`);

  const agentsDir = path.join(__dirname, '..', 'embeds', 'agents');
  const embedded = extractEmbeddedContent(
    path.join(__dirname, '..', 'src', 'agentStore.ts'),
    'agent'
  );

  const sourceFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
  let issues = 0;

  for (const file of sourceFiles) {
    const id = file.replace(/\.agent\.md$/, '').toLowerCase();
    const filepath = path.join(agentsDir, file);
    const sourceContent = readSourceFile(filepath);

    if (!sourceContent) {
      console.log(`${colors.red}✗ ${file}${colors.reset} - Source file not found`);
      issues++;
      continue;
    }

    const sourceHash = hash(sourceContent);

    if (!embedded[id]) {
      console.log(`${colors.red}✗ ${file}${colors.reset} - Not embedded in agentStore.ts`);
      issues++;
      continue;
    }

    const embeddedHash = hash(embedded[id].content);

    if (sourceHash === embeddedHash) {
      console.log(`${colors.green}✓ ${file}${colors.reset} - OK`);
    } else {
      console.log(
        `${colors.red}✗ ${file}${colors.reset} - Content mismatch\n` +
        `  Source:   ${sourceHash}\n` +
        `  Embedded: ${embeddedHash}`
      );
      issues++;
    }
  }

  return issues;
}

function verifyProtectedFiles() {
  console.log(`\n${colors.bold}=== Verifying Protected Files ===${colors.reset}`);

  const protectedDir = path.join(__dirname, '..', 'embeds', 'protected');
  const embedded = extractEmbeddedContent(
    path.join(__dirname, '..', 'src', 'agentStore.ts'),
    'file'
  );

  if (!fs.existsSync(protectedDir)) {
    console.log(`${colors.yellow}⚠ Protected directory not found - skipping${colors.reset}`);
    return 0;
  }

  const sourceFiles = fs.readdirSync(protectedDir);
  let issues = 0;

  for (const file of sourceFiles) {
    if (file.startsWith('.')) continue; // Skip hidden files

    const id = file.replace(/\./g, '').toLowerCase();
    const filepath = path.join(protectedDir, file);
    const stat = fs.statSync(filepath);

    if (stat.isDirectory()) continue;

    const sourceContent = readSourceFile(filepath);
    if (!sourceContent) {
      console.log(`${colors.red}✗ ${file}${colors.reset} - Source file not found`);
      issues++;
      continue;
    }

    const sourceHash = hash(sourceContent);
    let found = false;

    for (const [embId, embData] of Object.entries(embedded)) {
      const embHash = hash(embData.content);
      if (sourceHash === embHash) {
        console.log(`${colors.green}✓ ${file}${colors.reset} - OK (embedded as ${embId})`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(`${colors.red}✗ ${file}${colors.reset} - Not found in embeddings or content mismatch`);
      issues++;
    }
  }

  return issues;
}

function verifyMemoryTemplates() {
  console.log(`\n${colors.blue}=== Verifying Memory Templates ===${colors.reset}`);

  const memoryDir = path.join(__dirname, '..', 'embeds', 'AI-Memory');
  const storePath = path.join(__dirname, '..', 'src', 'memoryTemplateStore.ts');

  if (!fs.existsSync(storePath)) {
    console.log(`${colors.red}✗ memoryTemplateStore.ts not found${colors.reset}`);
    return 1;
  }

  const storeContent = fs.readFileSync(storePath, 'utf8');
  const sourceFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
  let issues = 0;

  // Extract base64 values from store
  const embeddedPattern = /(\w+):\s*'([A-Za-z0-9+/=]+)'/g;
  const embedded = {};
  let match;
  while ((match = embeddedPattern.exec(storeContent)) !== null) {
    const [, key, b64] = match;
    embedded[key] = decodeBase64(b64);
  }

  for (const file of sourceFiles) {
    const key = file.replace('.md', '');
    const filepath = path.join(memoryDir, file);
    const sourceContent = readSourceFile(filepath);

    if (!sourceContent) {
      console.log(`${colors.red}✗ ${file}${colors.reset} - Source file not found`);
      issues++;
      continue;
    }

    if (!embedded[key]) {
      console.log(`${colors.red}✗ ${file}${colors.reset} - Not found in memoryTemplateStore.ts`);
      issues++;
      continue;
    }

    const sourceHash = hash(sourceContent);
    const embHash = hash(embedded[key]);

    if (sourceHash === embHash) {
      console.log(`${colors.green}✓ ${file}${colors.reset} - OK`);
    } else {
      console.log(`${colors.red}✗ ${file}${colors.reset} - Content mismatch`);
      issues++;
    }
  }

  return issues;
}

function main() {
  console.log(`${colors.blue}Verifying Embedded Assets${colors.reset}`);
  console.log('Checking that source files match their embedded content in store files...\n');

  let totalIssues = 0;
  totalIssues += verifyPrompts();
  totalIssues += verifyAgents();
  totalIssues += verifyProtectedFiles();
  totalIssues += verifyMemoryTemplates();

  console.log(`\n${colors.blue}=${'='.repeat(40)}${colors.reset}`);

  if (totalIssues === 0) {
    console.log(
      `${colors.green}✓ All embeddings valid - Ready for release${colors.reset}\n`
    );
    process.exit(0);
  } else {
    console.log(
      `${colors.red}✗ Found ${totalIssues} embedding issue(s)${colors.reset}\n` +
      `${colors.yellow}⚠ Run 'npm run embed-all' to fix${colors.reset}\n`
    );
    process.exit(1);
  }
}

main();
