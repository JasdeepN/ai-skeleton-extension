# system Patterns

[PATTERN:2025-12-05] AI-Memory initialized

[PATTERN:2025-12-05] Extension WASM Loading Pattern: For VS Code extensions using WebAssembly modules (like sql.js):
1. Load WASM as Buffer using fs.readFileSync, not via locateFile callback
2. Pass Buffer via wasmBinary initialization option
3. Use require.resolve() to find module location first
4. Fallback to __dirname-relative paths for installed extensions
5. Final fallback to process.cwd() for development mode
6. Bundle WASM files in VSIX using .vscodeignore exclusions (!node_modules/module-name/**)
7. Add comprehensive error logging with all attempted paths for diagnostics

[PATTERN:2025-12-05] Extension Packaging Pattern: VS Code extensions (.vsix):
- By default, node_modules/** is excluded
- Include specific dependencies using negation: !node_modules/package-name/**
- Consider bundle size impact (sql.js added 8MB)
- Test both local install and remote SSH scenarios
- Verify all assets accessible via unzip -l vsix-file.vsix
- Use vsce package to build VSIX from extension root

[PATTERN:2025-12-05] Singleton Re-initialization Pattern: For singletons managing file-backed resources (like databases):
1. Check if file exists in addition to path matching
2. Allow re-initialization when file is deleted but path is the same
3. Reset all internal state (isInitialized, db connection, backend type) before reinit
4. Log reinitialization reason for debugging (path changed vs file deleted)
Example from MemoryStore: `if (this.isInitialized && this.dbPath === dbPath && fs.existsSync(dbPath)) return true;`

[PATTERN:2025-12-05] Release Branch Governance for Extensions: For marketplace-published extensions (VS Code, npm, etc.):
1. **Development branch (permanent)**: Primary work, merges from feature branches, CI runs on every push, allows experimentation
2. **Release branch (permanent)**: Stable releases only, PR-merge only (no direct commits), full test suite required, creates 'latest-stable' tag, publishes to marketplace
3. **Branch Protection**: Release requires PR review, all CI checks pass, up-to-date before merge, admin can override for hotfixes
4. **Version Strategy**: Dev tags as 0.x.x (pre-release), release branch uses 'latest-stable' tag for production
5. **Workflow Separation**: Dev CI is fast iteration, Release CI is comprehensive validation
6. **Hotfix Process**: Cherry-pick from dev to release, or direct commit with override for emergencies
Benefits: Production safety, explicit release decision, easy rollback, clear development governance
