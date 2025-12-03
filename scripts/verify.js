#!/usr/bin/env node
/* Simple verification: load compiled promptStore and print counts */
const path = require('path');
const fs = require('fs');

function findDist() {
  const distStore = path.join(__dirname, '..', 'dist', 'promptStore.js');
  if (!fs.existsSync(distStore)) {
    console.error('dist/promptStore.js not found. Run `npm run compile` first.');
    process.exit(1);
  }
  return distStore;
}

(async () => {
  const storePath = findDist();
  const mod = require(storePath);
  const prompts = await mod.getPrompts('embedded');
  console.log(`Embedded prompt count: ${prompts.length}`);
  console.log('IDs:', prompts.map(p => p.id).join(', '));
})();
