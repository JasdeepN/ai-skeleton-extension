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

[PATTERN:2025-12-05] DB-only AI-Memory persistence: Memory bank no longer writes markdown files; all entries live in SQLite. UI components (tree/dashboard) rely on database metrics rather than filesystem files.

[PATTERN:2025-12-06] Context Window Token Encoding Hierarchy: For maximum token efficiency with nested/structured data: (1) Markdown primary format (34-38% fewer tokens than JSON), (2) YAML for data attributes (15-56% savings), (3) minified JSON only for API compatibility, (4) Protocol Buffers for binary datasets. Format selection depends on readability vs efficiency trade-off. BPE tokenization heavily penalizes JSON/XML punctuation; Markdown's indentation is tokenization-friendly.

[PATTERN:2025-12-06] Agent Context Budget Management Pattern: Reserve context window as: (A) System prompt & instructions (~15% fixed), (B) Output generation (~20% max), (C) Agent context & memory (~50%), (D) Safety buffer (~15%). Track tokens before each LLM call via official API countTokens methods (Claude/OpenAI/Gemini). Decision rule: healthy if remaining > 50K tokens, warning if 10-50K, critical if < 10K. Surface context status to agents for decision-making (new chat vs continue).

[PATTERN:2025-12-06] Three-Principle Context Engineering: Industry standard (Elastic, AWS Bedrock, Google Vertex): (1) OFFLOAD long-term data to external storage (vector DB, knowledge base) rather than context window; (2) REDUCE context to only essentials via filtering, summarization, or pruning (26-54% token reduction possible); (3) ISOLATE by including only tools/context relevant to current workflow step. Prevents "context rot" (performance degradation in very long contexts) and ensures critical system prompts remain visible.

[PATTERN:2025-12-06] Token Counting Implementation for LLM Agents: Best practice: Always use official provider APIs for accuracy (Anthropic countTokens, OpenAI tiktoken, Gemini countTokens). For offline/deployment environments, use model-specific tokenizers from Hugging Face or approximate using provider libraries. Log token counts in memory database for visibility. Pattern: count before call, check against budget, decide (proceed, compress, or new chat), execute, log usage in metrics. JavaScript: use js-tiktoken or SDK native methods.
