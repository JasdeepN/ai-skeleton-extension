#!/usr/bin/env node
// Script to install embedded agents to a local folder (non-VS Code host) for testing
const path = require('path');
const fs = require('fs');
const minimist = require('minimist');

const args = minimist(process.argv.slice(2), { string: ['dest'], boolean: ['overwrite'], alias: { d: 'dest', o: 'overwrite' } });
const dest = args.dest || path.join(__dirname, '..', 'tmp-agent-install');
const overwrite = !!args.overwrite;

const dist = path.join(__dirname, '..', 'dist', 'agentStore.js');
if (!fs.existsSync(dist)) {
  console.error('dist/agentStore.js not found. Run `npm run compile` first.');
  process.exit(1);
}

(async () => {
  const mod = require(dist);
  const agents = await mod.getAgents('embedded');
  if (!agents || !agents.length) {
    console.error('No embedded agents found.');
    process.exit(1);
  }

  const destAgentDir = path.join(dest, '.github', 'agents');
  fs.mkdirSync(destAgentDir, { recursive: true });
  let written = 0;
  let skipped = 0;
  for (const a of agents) {
    const targetPath = path.join(destAgentDir, a.filename);
    if (fs.existsSync(targetPath) && !overwrite) {
      skipped++;
      continue;
    }
    fs.writeFileSync(targetPath, a.content, 'utf8');
    written++;
  }
  console.log(`Installed agents to ${destAgentDir}. written=${written} skipped=${skipped}`);
})();
