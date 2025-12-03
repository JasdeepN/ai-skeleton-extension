#!/usr/bin/env node
// Script to install embedded protected files to a local folder for testing
const path = require('path');
const fs = require('fs');
const minimist = require('minimist');

const args = minimist(process.argv.slice(2), { string: ['dest'], boolean: ['overwrite'], alias: { d: 'dest', o: 'overwrite' } });
const dest = args.dest || path.join(__dirname, '..', 'tmp-protected-install');
const overwrite = !!args.overwrite;

const dist = path.join(__dirname, '..', 'dist', 'agentStore.js');
if (!fs.existsSync(dist)) {
  console.error('dist/agentStore.js not found. Run `npm run compile` first.');
  process.exit(1);
}

(async () => {
  const mod = require(dist);
  const files = mod.getProtectedFilesEmbedded();
  if (!files || !files.length) {
    console.error('No embedded protected files found.');
    process.exit(1);
  }

  const destDir = path.join(dest, '.github');
  fs.mkdirSync(destDir, { recursive: true });
  let written = 0;
  let skipped = 0;
  for (const f of files) {
    const targetPath = path.join(destDir, f.filename);
    if (fs.existsSync(targetPath) && !overwrite) {
      skipped++;
      continue;
    }
    fs.writeFileSync(targetPath, f.content, 'utf8');
    written++;
  }
  console.log(`Installed protected files to ${destDir}. written=${written} skipped=${skipped}`);
})();
