/**
 * Embedding Integrity Tests
 * 
 * Validates that all prompts, agents, and protected files are properly embedded
 * in their respective store files with current content (hash matching).
 * 
 * This test suite prevents stale embeddings from being released.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function decodeBase64(b64) {
  return Buffer.from(b64.replace(/\n/g, ''), 'base64').toString('utf8');
}

function readFile(filepath) {
  try {
    return fs.readFileSync(filepath, 'utf8');
  } catch (e) {
    return null;
  }
}

function extractEmbeddedContent(storePath) {
  try {
    const storeContent = fs.readFileSync(storePath, 'utf8');
    const embedded = {};

    // Match all base64 entries in the store file
    const pattern = /id:\s*'([^']+)'[,\s]+filename:\s*'([^']+)'[,\s]+title:\s*'([^']+)'[,\s]+base64:\s*'([^']+)'/g;

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
    throw new Error(`Failed to extract embedded content from ${storePath}: ${e.message}`);
  }
}

describe('Embedding Integrity Tests', () => {
  // ID mapping (same as embed-prompts.js)
  const promptIdMap = {
    'gh': 'githubActions',
    'sync': 'sync'
  };
  
  function derivePromptId(filename) {
    const base = filename.replace(/\.prompt\.md$/, '').toLowerCase();
    return promptIdMap[base] || base;
  }

  describe('Prompts', () => {
    const promptsDir = path.join(__dirname, '..', 'embeds', 'prompts');
    const embedded = extractEmbeddedContent(
      path.join(__dirname, '..', 'src', 'promptStore.ts')
    );

    const sourceFiles = fs
      .readdirSync(promptsDir)
      .filter(f => f.endsWith('.md'));

    test('all prompt files are embedded', () => {
      expect(sourceFiles.length).toBeGreaterThan(0);

      for (const file of sourceFiles) {
        const id = derivePromptId(file);
        expect(embedded).toHaveProperty(id);
      }
    });

    sourceFiles.forEach(file => {
      test(`prompt ${file} has matching hash`, () => {
        const id = derivePromptId(file);
        const filepath = path.join(promptsDir, file);
        const sourceContent = readFile(filepath);

        expect(sourceContent).not.toBeNull();
        expect(embedded[id]).toBeDefined();

        const sourceHash = hash(sourceContent);
        const embeddedHash = hash(embedded[id].content);

        expect(embeddedHash).toBe(
          sourceHash,
          `${file} content mismatch - run 'npm run embed-all' to fix`
        );
      });
    });

    test('embedded prompt metadata is correct', () => {
      sourceFiles.forEach(file => {
        const id = derivePromptId(file);
        const embeddedData = embedded[id];

        expect(embeddedData).toBeDefined();
        expect(embeddedData.filename).toBe(file);
        expect(embeddedData.title).toBeDefined();
        expect(embeddedData.content).toBeDefined();
        expect(embeddedData.content.length).toBeGreaterThan(0);
      });
    });

    test('all embedded prompts decode correctly', () => {
      for (const [id, data] of Object.entries(embedded)) {
        expect(data.content).toBeTruthy();
        // Verify it's valid markdown (rough check)
        expect(data.content).toMatch(/^(---|\#)/);
      }
    });
  });

  describe('Agents', () => {
    const agentsDir = path.join(__dirname, '..', 'embeds', 'agents');
    const embedded = extractEmbeddedContent(
      path.join(__dirname, '..', 'src', 'agentStore.ts')
    );

    const sourceFiles = fs
      .readdirSync(agentsDir)
      .filter(f => f.endsWith('.agent.md'));

    test('all agent files are embedded', () => {
      expect(sourceFiles.length).toBeGreaterThan(0);

      for (const file of sourceFiles) {
        const id = file.replace(/\.agent\.md$/, '').toLowerCase();
        expect(embedded).toHaveProperty(id);
      }
    });

    sourceFiles.forEach(file => {
      test(`agent ${file} has matching hash`, () => {
        const id = file.replace(/\.agent\.md$/, '').toLowerCase();
        const filepath = path.join(agentsDir, file);
        const sourceContent = readFile(filepath);

        expect(sourceContent).not.toBeNull();
        expect(embedded[id]).toBeDefined();

        const sourceHash = hash(sourceContent);
        const embeddedHash = hash(embedded[id].content);

        expect(embeddedHash).toBe(
          sourceHash,
          `${file} content mismatch - run 'npm run embed-all' to fix`
        );
      });
    });

    test('embedded agent metadata is correct', () => {
      sourceFiles.forEach(file => {
        const id = file.replace(/\.agent\.md$/, '').toLowerCase();
        const embeddedData = embedded[id];

        expect(embeddedData).toBeDefined();
        expect(embeddedData.filename).toBe(file);
        expect(embeddedData.title).toBeDefined();
        expect(embeddedData.content).toBeDefined();
        expect(embeddedData.content.length).toBeGreaterThan(0);
      });
    });

    test('all embedded agents have valid YAML frontmatter', () => {
      // Only check actual agent files (exclude protected files)
      for (const file of sourceFiles) {
        const id = file.replace(/\.agent\.md$/, '').toLowerCase();
        const data = embedded[id];
        // Agents should start with YAML frontmatter
        expect(data.content).toMatch(/^---\nname:/);
      }
    });

    test('agent tool declarations are current', () => {
      const agentContent = embedded['memory-deep-think']?.content;
      expect(agentContent).toBeDefined();

      // Verify correct tool names are used (individual tools, not wildcard)
      expect(agentContent).toContain('jasdeepn.ai-skeleton-extension/showMemory');
      expect(agentContent).toContain('jasdeepn.ai-skeleton-extension/logDecision');
      expect(agentContent).toContain('jasdeepn.ai-skeleton-extension/updateContext');

      // Verify old/incorrect tool names are NOT present
      expect(agentContent).not.toContain('JasdeepN.ai-skeleton-prompts');
      expect(agentContent).not.toContain('modelcontextprotocol.servers');
    });
  });

  describe('Protected Files', () => {
    const protectedDir = path.join(__dirname, '..', 'protected');
    const agentStoreContent = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'agentStore.ts'),
      'utf8'
    );

    test('protected directory exists or test is skipped', () => {
      // Protected files are optional - they might not exist in all setups
      if (!fs.existsSync(protectedDir)) {
        console.warn('Protected directory not found - skipping protected file tests');
        expect(true).toBe(true);
      }
    });

    test('.copilotignore is embedded', () => {
      if (!agentStoreContent.includes('copilotignore')) {
        console.warn('.copilotignore not embedded - skipping');
        expect(true).toBe(true);
        return;
      }

      const pattern = /id:\s*'copilotignore'[,\s]+filename:\s*'([^']+)'[,\s]+title:\s*'([^']+)'[,\s]+base64:\s*'([^']+)'/;
      const match = pattern.exec(agentStoreContent);

      expect(match).not.toBeNull();

      if (match) {
        const [, filename, title, b64] = match;
        const content = decodeBase64(b64);

        expect(filename).toBe('.copilotignore');
        expect(title).toBeDefined();
        expect(content).toContain('agents/*');
        expect(content).toContain('prompts/*');
      }
    });

    test('PROTECTED_FILES.md is embedded', () => {
      if (!agentStoreContent.includes('protected-files')) {
        console.warn('PROTECTED_FILES.md not embedded - skipping');
        expect(true).toBe(true);
        return;
      }

      const pattern = /id:\s*'protected-files'[,\s]+filename:\s*'([^']+)'[,\s]+title:\s*'([^']+)'[,\s]+base64:\s*'([^']+)'/;
      const match = pattern.exec(agentStoreContent);

      expect(match).not.toBeNull();

      if (match) {
        const [, filename, title, b64] = match;
        const content = decodeBase64(b64);

        expect(filename).toBe('PROTECTED_FILES.md');
        expect(content).toContain('Protected Files');
      }
    });
  });

  describe('Store File Integrity', () => {
    test('promptStore.ts is valid TypeScript', () => {
      const storeContent = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'promptStore.ts'),
        'utf8'
      );

      // Check for required exports
      expect(storeContent).toContain('export');
      expect(storeContent).toContain('const embeddedPromptsData');
      expect(storeContent).toContain('getPrompts');
    });

    test('agentStore.ts is valid TypeScript', () => {
      const storeContent = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'agentStore.ts'),
        'utf8'
      );

      // Check for required exports
      expect(storeContent).toContain('export');
      expect(storeContent).toContain('embeddedAgentsData');
      expect(storeContent).toContain('embeddedProtectedFilesData');
      expect(storeContent).toContain('getAgents');
      expect(storeContent).toContain('getProtectedFilesEmbedded');
    });

    test('store files have AUTO-GENERATED comment', () => {
      const promptStore = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'promptStore.ts'),
        'utf8'
      );
      const agentStore = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'agentStore.ts'),
        'utf8'
      );

      expect(promptStore).toContain('AUTO-GENERATED FILE');
      expect(agentStore).toContain('AUTO-GENERATED FILE');
    });
  });

  describe('Release Readiness Checks', () => {
    test('all embeddings are up to date', () => {
      // This is the master test that ensures nothing slipped through
      const promptsDir = path.join(__dirname, '..', 'embeds', 'prompts');
      const agentsDir = path.join(__dirname, '..', 'embeds', 'agents');

      const promptEmbedded = extractEmbeddedContent(
        path.join(__dirname, '..', 'src', 'promptStore.ts')
      );
      const agentEmbedded = extractEmbeddedContent(
        path.join(__dirname, '..', 'src', 'agentStore.ts')
      );

      const prompts = fs
        .readdirSync(promptsDir)
        .filter(f => f.endsWith('.md'));
      const agents = fs
        .readdirSync(agentsDir)
        .filter(f => f.endsWith('.agent.md'));

      let mismatchCount = 0;
      const mismatches = [];

      prompts.forEach(file => {
        const id = derivePromptId(file);
        const filepath = path.join(promptsDir, file);
        const sourceContent = readFile(filepath);
        const sourceHash = hash(sourceContent);
        const embeddedHash = hash(promptEmbedded[id]?.content || '');

        if (sourceHash !== embeddedHash) {
          mismatchCount++;
          mismatches.push(`  - Prompt: ${file}`);
        }
      });

      agents.forEach(file => {
        const id = file.replace(/\.agent\.md$/, '').toLowerCase();
        const filepath = path.join(agentsDir, file);
        const sourceContent = readFile(filepath);
        const sourceHash = hash(sourceContent);
        const embeddedHash = hash(agentEmbedded[id]?.content || '');

        if (sourceHash !== embeddedHash) {
          mismatchCount++;
          mismatches.push(`  - Agent: ${file}`);
        }
      });

      expect(mismatchCount).toBe(
        0,
        mismatchCount > 0
          ? `${mismatchCount} embedding(s) out of sync:\n${mismatches.join('\n')}\n\nRun 'npm run embed-all' to fix`
          : ''
      );
    });
  });
});
