#!/usr/bin/env node
// Basic Node test script for promptStore (non-VS Code host)
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const dist = path.join(__dirname, '..', 'dist', 'promptStore.js');
if (!fs.existsSync(dist)) {
  console.error('dist/promptStore.js not found. Run `npm run compile` first.');
  process.exit(1);
}

(async () => {
  const mod = require(dist);
  const prompts = await mod.getPrompts('embedded');
  assert(Array.isArray(prompts), 'expected array');
  assert(prompts.length === 6, `expected 6 prompts but got ${prompts.length}`);
  for (const p of prompts) {
    assert(typeof p.id === 'string' && p.id.length > 0, 'id missing');
    assert(typeof p.filename === 'string' && p.filename.endsWith('.md'), 'filename should be md');
    assert(typeof p.title === 'string' && p.title.length > 0, 'title missing');
    assert(typeof p.content === 'string' && p.content.length > 0, 'content missing');
    assert(p.content.includes('#'), 'content should include a markdown heading');
  }
  console.log('promptStore tests passed');
})();
