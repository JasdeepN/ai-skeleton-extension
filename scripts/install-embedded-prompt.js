#!/usr/bin/env node
// Script to install a single embedded prompt to a local folder for testing
const path = require('path');
const fs = require('fs');
const minimist = require('minimist');

const args = minimist(process.argv.slice(2), { string: ['dest', 'id'], alias: { d: 'dest', i: 'id' } });
const dest = args.dest || path.join(__dirname, '..', 'tmp-install-single');
const id = args.id || 'checkpoint';

const dist = path.join(__dirname, '..', 'dist', 'promptStore.js');
if (!fs.existsSync(dist)) {
  console.error('dist/promptStore.js not found. Run `npm run compile` first.');
  process.exit(1);
}

(async () => {
  const mod = require(dist);
  const prompts = await mod.getPrompts('embedded');
  if (!prompts || !prompts.length) {
    console.error('No embedded prompts found.');
    process.exit(1);
  }
  const p = prompts.find(pp => pp.id === id);
  if (!p) {
    console.error(`prompt id not found: ${id}`);
    process.exit(1);
  }
  const destPromptDir = path.join(dest, '.github', 'prompts');
  fs.mkdirSync(destPromptDir, { recursive: true });
  const targetPath = path.join(destPromptDir, p.filename);
  fs.writeFileSync(targetPath, p.content, 'utf8');
  console.log(`Installed prompt ${p.id} to ${targetPath}`);
})();
