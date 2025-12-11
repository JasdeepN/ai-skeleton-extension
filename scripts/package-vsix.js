#!/usr/bin/env node
/**
 * VSIX Packaging Script
 * - Builds the extension
 * - Bumps version by 0.0.1 (patch) IF the current version equals the last packaged version
 * - Creates a .vsix using vsce and saves it to an output directory (default: ./vsix)
 *
 * Usage:
 *   node scripts/package-vsix.js [--outDir=./vsix] [--forceBump] [--noBump] [--dry]
 *
 * Behavior:
 * - If --forceBump: Always bump patch version before packaging
 * - If --noBump: Never bump version
 * - Else (default): Bump only if last packaged version === current package.json version
 * - Persists last packaged version to <outDir>/last-version.json for future comparisons
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function log(...args) { console.log('[package-vsix]', ...args); }
function warn(...args) { console.warn('[package-vsix]', ...args); }
function error(...args) { console.error('[package-vsix]', ...args); }

function run(cmd, opts = {}) {
  log('>', cmd);
  cp.execSync(cmd, { stdio: 'inherit', ...opts });
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function bumpPatch(version) {
  // Increment patch by 1, keeping major.minor unchanged
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) {
    throw new Error(`Unsupported semver: ${version}`);
  }
  parts[2] += 1;
  return parts.join('.');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { outDir: './vsix', forceBump: false, noBump: false, dry: false };
  for (const a of args) {
    if (a.startsWith('--outDir=')) out.outDir = a.split('=')[1];
    else if (a === '--forceBump') out.forceBump = true;
    else if (a === '--noBump') out.noBump = true;
    else if (a === '--dry') out.dry = true;
    else warn('Unknown arg:', a);
  }
  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

(function main() {
  const args = parseArgs();
  const root = path.resolve(__dirname, '..');
  const pkgPath = path.join(root, 'package.json');
  const pkg = readJSON(pkgPath);
  const name = pkg.name || 'extension';
  const version = pkg.version || '0.0.1';
  const outDir = path.resolve(root, args.outDir);
  const lastFile = path.join(outDir, 'last-version.json');

  log('Root:', root);
  log('Package:', name, version);
  log('OutDir:', outDir);
  ensureDir(outDir);

  let lastVersion = null;
  if (fs.existsSync(lastFile)) {
    try { lastVersion = readJSON(lastFile).version; } catch { /* ignore */ }
  }
  log('Last version:', lastVersion ?? '(none)');

  // Decide bump policy
  let nextVersion = version;
  if (args.forceBump) {
    nextVersion = bumpPatch(version);
    log('forceBump enabled -> nextVersion =', nextVersion);
  } else if (args.noBump) {
    log('noBump enabled -> version remains', version);
  } else {
    if (lastVersion && lastVersion === version) {
      nextVersion = bumpPatch(version);
      log('Auto-bump: lastVersion === version -> nextVersion =', nextVersion);
    } else {
      log('No auto-bump: new version or first packaging');
    }
  }

  // Persist version bump
  if (nextVersion !== version) {
    pkg.version = nextVersion;
    writeJSON(pkgPath, pkg);
    log('package.json version updated ->', nextVersion);
  }

  if (args.dry) {
    log('Dry run: skipping build and package');
    return;
  }

  // Build the extension (embed + compile)
  run('npm run build', { cwd: root });

  // Package with vsce
  // Prefer npx vsce to avoid global requirement
  const vsixName = `${name}-${pkg.version}.vsix`;
  const outPath = path.join(outDir, vsixName);
  // Allow star activation without interactive prompt (we intentionally use '*' to ensure activation)
  run(`npx vsce package --allow-star-activation --out "${outPath}"`, { cwd: root });

  // Update last-version.json
  writeJSON(lastFile, { version: pkg.version, time: new Date().toISOString(), file: vsixName });
  log('VSIX created ->', outPath);
})();
