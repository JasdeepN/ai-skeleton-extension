#!/usr/bin/env node
// Simple Node script to verify encoding & writing of prompt content outside of VS Code
const path = require('path');
const fs = require('fs');

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
  const prompt = prompts[0];
  const tmpFile = path.join('/tmp', `ai-skeleton-${prompt.id}.md`);

  // Encode to Uint8Array using the same runtime-agnostic strategy as extension.ts
  const g = globalThis;
  let data;
  if (typeof g.TextEncoder === 'function') {
    data = new g.TextEncoder().encode(prompt.content);
  } else if (g.Buffer && typeof g.Buffer.from === 'function') {
    data = g.Buffer.from(prompt.content, 'utf8');
  } else {
    data = new Uint8Array(prompt.content.split('').map((c) => c.charCodeAt(0)));
  }

  // Write to tmp using Node Buffer
  fs.writeFileSync(tmpFile, Buffer.from(data));
  const readBack = fs.readFileSync(tmpFile, 'utf8');
  if (readBack === prompt.content) {
    console.log(`Successfully wrote and read ${tmpFile}`);
    console.log('Content verified (length:', prompt.content.length, ')');
  } else {
    console.error('Saved content mismatch!');
    console.error('Wrote:', prompt.content.slice(0, 200));
    console.error('Read:', readBack.slice(0, 200));
    process.exit(2);
  }
})();
