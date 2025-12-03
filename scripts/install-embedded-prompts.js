#!/usr/bin/env node
// Script to install embedded prompts to a local folder (non-VS Code host) for testing
const path = require('path');
const fs = require('fs');
const minimist = require('minimist');

const args = minimist(process.argv.slice(2), { string: ['dest'], boolean: ['overwrite'], alias: { d: 'dest', o: 'overwrite' } });
const dest = args.dest || path.join(__dirname, '..', 'tmp-install');
const overwrite = !!args.overwrite;

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

  const destPromptDir = path.join(dest, '.github', 'prompts');
  fs.mkdirSync(destPromptDir, { recursive: true });
  let written = 0;
  let skipped = 0;
  for (const p of prompts) {
    const targetPath = path.join(destPromptDir, p.filename);
    if (fs.existsSync(targetPath) && !overwrite) {
      skipped++;
      continue;
    }
    fs.writeFileSync(targetPath, p.content, 'utf8');
    written++;
  }
  console.log(`Installed prompts to ${destPromptDir}. written=${written} skipped=${skipped}`);
})();
