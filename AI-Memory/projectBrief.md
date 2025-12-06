# project Brief

[BRIEF:2025-12-05] AI-Memory initialized

[BRIEF:2025-12-05] ## AI Skeleton Extension

**Version:** 0.1.28  
**Repository:** https://github.com/JasdeepN/ai-skeleton-extension  
**Publisher:** JasdeepN (VS Code Marketplace)

### Product Overview
Complete AI agent toolkit providing native memory management (AI-Memory), workflow prompts, MCP integration, and agent definitions. Enables structured, stateful AI interactions in VS Code with persistent knowledge graphs backed by SQLite.

### Core Features
1. **AI-Memory (SQLite-backed)**: Native memory management with database storage
   - 5 core memory files: projectBrief, activeContext, systemPatterns, decisionLog, progress
   - SQLite backend (sql.js WebAssembly + optional better-sqlite3 native)
   - Migration/export scripts for markdown ↔ SQLite conversion
   - 138 unit tests with comprehensive coverage
   
2. **Workflow Prompts**: 7 structured prompts for agent workflows
   - Think, Plan, Execute, Checkpoint, Sync, Startup, GH (GitHub)
   - Embedded directly in extension (no external dependencies)
   
3. **Agent Definitions**: 3 specialized agents with tool restrictions
   - memory-prompt (execution agent with edit tools)
   - memory-mcp-research (research agent, read-only)
   - memory-deep-think (analysis agent, read-only)
   
4. **MCP Integration**: Auto-start MCP servers from .vscode/mcp.json
5. **Protected Files**: GUARDRAILS.md system for AI safety restrictions
6. **Setup Dialog**: Smart detection and installation of all components

### Technical Stack
- **Language**: TypeScript 5.7.2
- **Runtime**: Node.js 18.x/20.x
- **Database**: sql.js 1.12.0 (WebAssembly SQLite), optional better-sqlite3
- **Testing**: Jest 29.7.0, @vscode/test-electron 2.5.2, c8 coverage
- **Build**: TypeScript compiler, vsce packaging
- **CI/CD**: GitHub Actions (6-platform matrix)
- **VS Code API**: 1.95.0+

### Release Strategy
- **Development**: db branch for testing, main for stable
- **Minor Releases**: Manual workflow trigger (minor-release.yml)
- **Critical Patches**: Emergency workflow (critical-patch.yml)
- **Stable Releases**: Promote pre-release to stable (stable-release.yml)

[BRIEF:2025-12-05] [BRIEF:2025-12-05] Coverage/Codecov investigation: CI test workflow runs c8 via `npm run test:coverage` and uploads using codecov/codecov-action@v4 only on ubuntu-latest Node 20. Release workflows auto-commit with `[skip ci]` and do not run tests or coverage upload, so latest main commits (release bumps) lack coverage, causing Codecov badge to show 0%. Codecov action also lacks explicit coverage file path and OIDC permissions; if CODECOV_TOKEN is unset uploads may silently fail (`fail_ci_if_error: false`).

[BRIEF:2025-12-05] 

[BRIEF:2025-12-05] **Version Updated:** Now at v0.1.32 on main (bumped by pre-release workflow). Package.json version reflects latest pre-release from automated patch bumps.

[BRIEF:2025-12-05] 

[BRIEF:2025-12-05] Research Brief: Activity Bar Memory Dashboard

## Problem Statement
Need an activity bar section that surfaces AI-Memory database status and key artifacts: DB active state, backend, size, avg query time; quick access to context/research/decisions/logs/plans; show archive of completed items; allow manual task tracking and adding tasks to the database for future consideration.

## Context
- Current activity bar container `aiSkeleton` exposes only Diagnostics view; memory tree lives in Explorer (`aiSkeletonMemory`) with minimal status.
- Memory data lives in SQLite (memory.db) via MemoryStore; no query timing metrics are collected today.
- Core files: activeContext, progress, decisionLog, systemPatterns, projectBrief.

## Approach Options
1) **Tree View in Activity Bar (recommended)**
   - Add new view (e.g., `aiSkeletonMemoryDashboard`) under existing `aiSkeleton` container.
   - Tree items: Status (active/backend/db path), Metrics (DB size from fs.stat, entry counts per type, avg query time), Context/Research/Decisions/Logs/Plans (links + latest entry summary), Archive (completed items from progress), Tasks (add/view next items).
   - Commands on items: open file, refresh, add task (writes to progress via memory service), run quick stats.
   - Pros: Native, low complexity, reuses tree provider patterns; fast to ship.
   - Cons: Limited layout richness; needs background refresh on state changes.

2) **Webview Dashboard in Activity Bar**
   - Rich UI with charts/gauges; communicates via VS Code message passing.
   - Pros: Flexible layout; can show graphs of query times and size.
   - Cons: Heavier implementation; more testing across platforms.

3) **Expand existing Explorer Memory View**
   - Add metrics and tasks inside `aiSkeletonMemory` explorer view.
   - Pros: Minimal new UI surface.
   - Cons: Does not satisfy “activity bar section” requirement; less discoverable.

## Recommended Approach
Option 1: New tree view in activity bar container. Lightweight, meets requirement, and aligns with existing extension patterns.

## Technical Considerations
- **Stats collection:**
  - DB size: fs.stat on memory.db, format human-readable.
  - Entry counts: SELECT COUNT(*) GROUP BY file_type.
  - Avg query time: instrument MemoryStore operations (measure durations per query/insert/export) and keep rolling averages in-memory; expose via MemoryService.
- **Data sources:** memoryService.detectMemoryBank(), memoryStore queries for counts and latest entries; progress parsing for “done/next/doing” buckets if encoded in markdown, or use tags if stored.
- **Commands:** new commands to add task/progress entry (prompt user), refresh stats, open memory files.
- **Refresh:** subscribe to memoryService.onDidChangeState and timers (e.g., refresh metrics every N seconds while view visible).
- **Performance:** avoid heavy queries on each render; cache metrics and throttle refresh.
- **Access control:** handle inactive memory gracefully (show create/activate CTA).

## Risks & Mitigations
- Missing avg query time: add instrumentation wrappers around store methods and keep last-N samples.
- Large DB size stat cost: use fs.stat (cheap) and avoid reading full DB.
- Progress parsing ambiguity: if progress entries aren’t structured, limit to counts and latest lines; optionally add schema/tag convention.

## Success Criteria
- Activity bar view shows live status (active/backend/path), size, counts, avg query time.
- Quick links to memory files and latest entry snippets.
- Tasks can be added from the view and stored in AI-Memory.
- Archive/completed items visible (from progress) and refreshable.

## Next Steps
- Plan: Define data model for metrics (interfaces) and TreeDataProvider structure.
- Implement: new activity bar view + commands; instrument MemoryStore for timings; add stats queries.
- Test: unit tests for metrics aggregation; manual verification with active/inactive memory states.


[BRIEF:2025-12-05] 

[PLAN:2025-12-05] Implementation Plan – Activity Bar Memory Dashboard

## Task
Add an activity bar dashboard that surfaces AI-Memory database status (active/backend/path/size/avg query time), entry counts, latest snippets, tasks/next items, archive/completed, and commands to add tasks. Reuse AI-Memory database for persistence.

## Major Components
1) **Data & Metrics Layer**
   - Instrument MemoryStore operations to capture per-query timings and compute rolling averages.
   - Provide APIs to fetch: db size, entry counts by file_type, latest entries per file_type, tasks/next/completed from progress, archive view.
   - Expose a lightweight metrics cache in MemoryService.

2) **Dashboard Tree View (Activity Bar)**
   - New view (e.g., `aiSkeletonMemoryDashboard`) under existing `aiSkeleton` activity bar container.
   - Sections: Status, Metrics, Entries (Context/Research/Decisions/Logs/Plans), Tasks/Next, Archive/Completed, Actions (Add Task, Refresh).
   - Item commands to open files, add task, refresh metrics.

3) **Commands & UX**
   - `aiSkeleton.memory.addTask` (prompt for task text; writes to progress with [Next] or [Doing]).
   - `aiSkeleton.memory.refreshDashboard` to force refresh/cached metrics update.
   - Consider `aiSkeleton.memory.showStats` to display detail (size, backend, avg query time).

4) **Integration & Refresh**
   - Subscribe to MemoryService state changes; throttle metrics refresh; handle inactive memory gracefully.
   - Ensure fallback if db missing or migration needed.

5) **Testing & Validation**
   - Unit tests for metrics aggregation (counts, latest entries, avg timings).
   - Integration test for tree provider with mocked MemoryService.
   - Manual validation scenarios: inactive bank, active bank with data, large db file.

## Actionable Steps (#todos)
- #todo Instrument MemoryStore to time queries/inserts and expose rolling average API
- #todo Add metrics helpers in MemoryService: db size (fs.stat), entry counts, latest entries, tasks/archive extraction
- #todo Create dashboard TreeDataProvider (activity bar view) with sections and commands
- #todo Add commands: addTask, refreshDashboard, openStats
- #todo Wire view refresh to MemoryService changes and throttled timers
- #todo Write tests for metrics aggregation and tree provider behavior
- #todo Document usage in README (activity bar dashboard)

## Tools/Areas to touch
- Files: src/memoryStore.ts, src/memoryService.ts, new src/memoryDashboardProvider.ts (or similar), package.json contributes (views/commands/menus), tests.
- Commands: new command registrations in extension activation.

## Risks
- Query timing overhead: keep lightweight, sample-only; disable if no memory active.
- Progress parsing ambiguity: may need simple convention (e.g., headings [Next]/[Doing]/[Done]) or just append tagged entries.
- Refresh performance: throttle and cache metrics to avoid UI lag.

## Success Criteria
- Activity bar dashboard shows status, size, counts, avg query time, latest snippets, tasks/archive.
- Add Task command writes to AI-Memory and appears in Tasks section after refresh.
- View handles inactive memory gracefully.


[BRIEF:2025-12-06] [BRIEF:2025-12-06] **Research Brief: Context Window Optimization & Token Tracking for AI Agents**

## Problem Statement
AI agents have fixed context windows (tokens) and need to maximize data density when communicating commands and context. For VS Code AI-Memory agents, we need:
1. **Encoding strategies** to fit more data in limited token budgets
2. **Token counting/tracking** to know current usage vs limits
3. **Decision criteria** for starting new chat vs continuing

## Key Findings

### 1. Encoding Efficiency (Token Density)

**Format Comparison for Structured Data:**
- **Markdown**: 34-38% fewer tokens than JSON (MOST EFFICIENT for nested data)
- **YAML**: 15-56% token savings vs JSON; more efficient than minified JSON
- **Minified JSON**: Surprisingly efficient when all whitespace removed (41 tokens vs 101 for pretty-printed)
- **XML**: Least efficient; verbose punctuation
- **Protocol Buffers**: Binary encoding, extremely compact (~60-80% savings vs JSON), but requires schema definition and decoding
- **CSV/TSV**: Most efficient for tabular data only; not suitable for nested structures

**Practical Recommendation for Agents:**
1. **Primary**: Use **Markdown** for human-readable context (34-38% savings)
2. **Secondary**: Use **YAML** for structured data (15-56% savings vs JSON)
3. **Tertiary**: Use **minified JSON** only if downstream systems require strict JSON
4. **Performance-critical**: Use **Protocol Buffers** for large binary datasets

**Why Markdown wins:**
- BPE tokenization respects paragraph breaks and newlines efficiently
- Minimal punctuation overhead
- Highly readable for agents (matches training data format)
- No schema coupling

### 2. Token Counting & Tracking

**Recommended Libraries:**
- **Official APIs (BEST):**
  - Claude: `client.messages.countTokens()` (exact count)
  - OpenAI: `tiktoken` library with model-specific encodings
  - Gemini: `countTokens()` method in SDK
  
- **Offline Estimation (for local/deployment):**
  - `tiktoken` (Python/JS): js-tiktoken for JavaScript
  - Anthropic tokenizer from Hugging Face (when API unavailable)
  - Claude approximation: Use tiktoken with `p50k_base` encoding (~95% accurate)

**Implementation Pattern:**
```typescript
// Before making LLM call
const estimate = await countTokens({
  model: "claude-3-5-sonnet",
  messages: agentContext,
  systemPrompt: agentPrompt
});

const available = 200000 - estimate; // Claude window is 200K
if (available < 10000) {
  // Signal: need new chat or compress context
  console.warn(`Low context budget: ${available} tokens remaining`);
}
```

**Key Metrics to Track:**
- Input tokens (context + prompt)
- Output tokens (reserved for response; ~20% of window is reasonable max)
- Total used
- Remaining budget
- Compression ratio achieved

### 3. Context Window Management Strategies

**Three Core Principles (Industry Standard):**
1. **OFFLOAD**: Move long-term data to external memory (vector DB, knowledge base)
2. **REDUCE**: Compress, filter, or summarize context to essential only
3. **ISOLATE**: Only include tools/strategies relevant to current workflow step

**Compression Techniques (Research-backed):**

**Hard Prompt Methods (Remove unnecessary tokens):**
- **Selective Filtering** (SelectiveContext, LLMLingua): Remove low-importance tokens
- **Token Pruning** (LLMLingua-2): Trained classifier identifies/removes redundant tokens (~26-54% reduction)
- **Query-aware Filtering** (LLMLingua): Use perplexity to rank token importance
- **Extractive Compression**: Select most relevant sentences, discard others

**Soft Prompt Methods (Compress into dense vectors):**
- **Memory Compression** (GIST, AutoCompressor): Learn compressed representations
- **Continuous Prompting** (CC): Replace text prompts with learned vectors
- **Distillation**: Compress context into small learnable modules

**Abstractive Compression (Rewrite more concisely):**
- Run offline summarization on context chunks using small LLM (Mistral 7B)
- Preserve semantics while reducing token count
- Works best for long documents (20-50% reduction)

**Practical Approach for Agents:**
1. **Semantic Chunking**: Break context into logical chunks
2. **Relevance Ranking**: Score chunks against current task
3. **Budget Allocation**: Reserve 30% for system prompt, 50% for context, 20% for response
4. **Dynamic Injection**: Only include top N most relevant chunks
5. **Fallback Compression**: If over budget, apply abstractive summarization

### 4. Context Rot Problem

**What is it?**
As context grows extremely long (50K+ tokens), model performance degrades ("lost in the middle"):
- Model attention becomes diffuse
- Long-range dependencies lost
- Relevant information gets deprioritized

**Mitigation:**
- Keep context windows under 30K tokens when possible
- Use RAG (Retrieval-Augmented Generation) for larger documents
- Employ recency bias: recent context is more important
- Use explicit markers to highlight critical information

### 5. Implementation for AI-Memory Agents

**Encoding Strategy:**
```
Memory Bank Encoding Priority:
1. Entry metadata (YAML): [TYPE:2025-12-06] type system for fast filtering
2. Entry content (Markdown): Human + agent readable, 34-38% savings
3. Structured data in queries (minified JSON): Only if needed for parsing
4. File attachments (Protocol Buffers): Binary-encoded large datasets
```

**Token Budget Management:**
```
Total Context: 200,000 tokens (Claude)
├─ System Prompt (ai-skeleton instructions): ~3,000
├─ Reserved Output: ~40,000 (20%)
├─ Available for Context: ~157,000
├─ Memory Entries (filtered): ~50,000
├─ Tool Definitions: ~10,000
├─ Working Context (user request + current task): ~40,000
└─ Safety Buffer: ~14,000

Decision Rule:
- If used > 180,000: "Context high; recommend new chat"
- If used > 150,000: "Context 75%; compress or start new chat"
- If used < 50,000: "Safe to add more context"
```

**Context Tracking Implementation:**
```typescript
interface ContextBudget {
  total: number;
  used: number;
  remaining: number;
  percentUsed: number;
  status: 'healthy' | 'warning' | 'critical';
  recommendations: string[];
}

class AgentContextManager {
  async trackContextUsage(messages: Message[]): Promise<ContextBudget> {
    const inputTokens = await countTokens(messages);
    const outputReserved = this.model.contextWindow * 0.20;
    const used = inputTokens + outputReserved;
    const remaining = this.model.contextWindow - used;
    
    return {
      total: this.model.contextWindow,
      used,
      remaining,
      percentUsed: (used / this.model.contextWindow) * 100,
      status: remaining > 50000 ? 'healthy' : remaining > 10000 ? 'warning' : 'critical',
      recommendations: this.getRecommendations(remaining)
    };
  }
}
```

## Recommended Architecture

**Phase 1: Token Counting (IMMEDIATE)**
- Add token counter middleware to agent calls
- Use Anthropic's countTokens API (most accurate)
- Log context metrics to memory.db for visibility
- Add context-window-status indicator to prompts

**Phase 2: Encoding Optimization (SHORT-TERM)**
- Convert entry formatting to Markdown + YAML tags
- Implement minified JSON for tool outputs only
- Create encoding helper: `formatForAgent(entry)` → Markdown
- Measure token savings (target: 20-30% reduction)

**Phase 3: Smart Context Management (MEDIUM-TERM)**
- Implement selective context injection (RAG-style)
- Add relevance scoring for memory entries
- Create "context-aware trimming" when over budget
- Implement conversation summarization on new chat boundary

**Phase 4: Context Rot Mitigation (OPTIONAL)**
- Monitor performance metrics per context size
- Implement recency-weighted relevance scoring
- Consider soft-prompt compression if context grows >50K

## Success Metrics
- [ ] Token count visible before each agent call
- [ ] 20-30% reduction in context size vs baseline
- [ ] Decision visibility: "New chat recommended when usage > 75%"
- [ ] Agents successfully operate within bounded context windows
- [ ] No agent "lost in the middle" degradation on long conversations

## Next Steps (for Planning/Execution)
1. Integrate token counting API into MemoryService
2. Update agent prompts with context-aware formatting (Markdown)
3. Create contextBudget helper + tracking UI
4. Implement selective memory injection based on relevance
5. Test and measure token savings

---

[BRIEF:2025-12-06] [BRIEF:2025-12-06] **Implementation Plan: Context Window Optimization for AI-Memory Agents**

## Main Task
Implement token tracking, encoding optimization, and context budget management for AI-Memory agents to maximize data density within fixed context windows and provide visibility into usage vs limits.

## Timeline & Phases

### PHASE 1: Token Counting Middleware (FOUNDATION) - Week 1
**Goal**: Add token visibility before every LLM call; know current budget status

**Components:**
1. **Token Counter Service** (`src/tokenCounterService.ts`)
   - Wrapper around Anthropic SDK `countTokens()` API
   - Fallback to offline estimation (js-tiktoken) for non-API calls
   - Cache token counts to avoid duplicate API calls
   - Log metrics to memory.db for visibility

2. **Context Budget Tracker** (add to `src/memoryService.ts`)
   - Track total available tokens (200K for Claude)
   - Calculate used: input + reserved output (20%)
   - Expose `getContextBudget()` → { used, remaining, percentUsed, status }
   - Update on each agent activation

3. **Budget Status Indicator** (update agent prompts)
   - Add `[CONTEXT_STATUS: healthy|warning|critical]` header to all prompts
   - Visible decision signal: "Budget at 75%; recommend new chat after next response"
   - Store in memory.db metrics table for historical tracking

**Files to Create/Modify:**
- CREATE: `src/tokenCounterService.ts` (new service)
- MODIFY: `src/memoryService.ts` (add budget tracking)
- MODIFY: `embeds/agents/memory-prompt.agent.md` (add status header)
- MODIFY: `src/extension.ts` (register token counter service)
- CREATE: `tests/tokenCounterService.test.js` (unit tests)

**Dependencies:**
- Anthropic SDK already available (`client.messages.countTokens`)
- js-tiktoken npm package (add if needed)
- memory.db already has metrics table

**Success Criteria:**
- [ ] Token count accurate within 5% of actual
- [ ] Budget status visible in agent prompts
- [ ] No API rate limiting from excessive countTokens calls (cache effectively)
- [ ] Metrics logged for analysis

---

### PHASE 2: Encoding Optimization (DATA DENSITY) - Week 2
**Goal**: Convert agent context to Markdown+YAML to achieve 30-40% token savings

**Components:**
1. **Entry Formatter** (`src/contextFormatter.ts` - new)
   - Convert memory entries to optimized format:
     ```
     [TYPE:2025-12-06] <title>
     
     <markdown content, no wrapping>
     
     ---
     ```
   - Strip unnecessary whitespace/comments from entries
   - Tag system: `[CONTEXT:date]`, `[DECISION:date]`, etc. (already in use)

2. **YAML-based Metadata** (update entry schema)
   - Use YAML front-matter for entry attributes (instead of JSON):
     ```yaml
     type: CONTEXT
     date: 2025-12-06
     tags: [optimization, token-tracking]
     priority: high
     ```
   - Why: YAML is 15-56% more token-efficient than JSON

3. **Agent Prompt Optimization** (update memory-*.agent.md files)
   - Replace verbose examples with compact Markdown
   - Condense memory context display in prompts
   - Add: "Use Markdown + YAML tagged entries for efficiency"
   - Reduce unnecessary formatting instructions

4. **Minified JSON Output** (tools/commands only)
   - Keep minified (no whitespace) for structured outputs only
   - Add flag: `format: 'minified-json'` for API returns

**Files to Create/Modify:**
- CREATE: `src/contextFormatter.ts` (formatting logic)
- MODIFY: `src/memoryStore.ts` (add YAML metadata serialization)
- MODIFY: `embeds/agents/*.agent.md` (optimize formatting)
- MODIFY: `embeds/prompts/*.prompt.md` (reduce verbosity ~15%)
- CREATE: `tests/contextFormatter.test.js` (unit tests)

**Dependencies:**
- yaml npm package (add: `npm install yaml`)
- memoryStore already handles serialization
- No breaking changes to existing entries (backward compatible)

**Success Criteria:**
- [ ] 25-35% reduction in context size (measured by token count)
- [ ] Agents correctly parse Markdown+YAML entries
- [ ] No loss of information or clarity
- [ ] Existing entries migrate automatically

---

### PHASE 3: Smart Context Management (SELECTIVE INJECTION) - Week 3
**Goal**: Only include memory entries relevant to current task; dynamic filtering based on relevance

**Components:**
1. **Relevance Scorer** (`src/relevanceScorer.ts` - new)
   - Compare user query/task against memory entries using embeddings or keyword matching
   - Score entries 0-1 for relevance
   - Rank by: (relevance_score * recency_weight * priority)
   - Fallback: keyword matching if embedding unavailable

2. **Context Selector** (add to `src/memoryService.ts`)
   - Given token budget and relevance scores, select top N entries
   - Greedy algorithm: include high-relevance until budget exhausted
   - Fallback: if no context entries fit, include system prompt + current task only
   - Expose: `selectContextForBudget(taskDescription, tokenBudget) → entries[]`

3. **RAG-style Retrieval** (update agent activation flow)
   - Before calling agent, call `selectContextForBudget()`
   - Inject only selected entries into prompt
   - Log which entries included/excluded for debugging
   - Track coverage: "Included 3/20 context entries (budget: 45K tokens)"

4. **Summarization Fallback** (optional, for high-budget scenarios)
   - If context > 60K tokens, trigger offline summarization:
     - Group entries by type
     - Generate 1-line summary per group
     - Replace full entries with summaries to free tokens

**Files to Create/Modify:**
- CREATE: `src/relevanceScorer.ts` (scoring logic)
- MODIFY: `src/memoryService.ts` (add selectContextForBudget)
- MODIFY: `src/extension.ts` (integrate context selector into agent flow)
- CREATE: `tests/relevanceScorer.test.js` (unit tests)

**Dependencies:**
- Optional: embedding model (use Anthropic's if available, else keyword-only)
- memoryStore for entry retrieval
- tokenCounterService from Phase 1

**Success Criteria:**
- [ ] Relevant entries prioritized over irrelevant ones
- [ ] Context fits within budget consistently
- [ ] Agent performance does not degrade despite reduced context
- [ ] Scoring algorithm < 100ms per call

---

### PHASE 4: Context Rot Mitigation (ADVANCED - OPTIONAL) - Week 4+
**Goal**: Prevent performance degradation on long conversations; add soft-prompt compression if needed

**Components:**
1. **Conversation Summarizer** (optional)
   - On new chat signal ("context > 75%"), create summary:
     - Extract key decisions from decisionLog
     - Extract active blockers from activeContext
     - Generate 1-paragraph summary of progress
     - Store in new "session_summary" entry type

2. **Recency Bias Weighting** (add to relevanceScorer)
   - Entries from last 7 days: 1.0x weight
   - Entries from 7-30 days: 0.7x weight
   - Entries > 30 days: 0.3x weight (unless explicitly pinned)
   - Formula: `score = relevance * recency_weight * priority`

3. **Soft-Prompt Compression** (research/prototype only)
   - If context consistently > 50K, consider learned compression
   - Options: GIST (adapter), AutoCompressor, or custom LoRA
   - Low priority; only if performance metrics show degradation

4. **Context Rot Detection** (monitoring)
   - Track quality metrics: response accuracy, coherence
   - Alert if performance drops when context > 50K
   - Trigger summarization or new-chat recommendation automatically

**Files (optional, defer to Phase 4):**
- CREATE: `src/conversationSummarizer.ts`
- MODIFY: `src/relevanceScorer.ts` (add recency weighting)
- MODIFY: dashboards/metrics UI (add context rot monitoring)

**Dependencies:**
- Phase 1-3 complete first
- Requires quality monitoring infrastructure

---

## Dependencies & Sequence

```
Phase 1 (Token Counter) ✓ Independent, foundation for others
  ↓
Phase 2 (Encoding) → Can run parallel to Phase 1
  ↓
Phase 3 (Smart Context) ← Depends on Phase 1 (token counting)
  ↓
Phase 4 (Rot Mitigation) ← Depends on Phase 1-3
```

**Critical Path**: Phase 1 → Phase 3. Phases 2 can overlap with 1.

---

## Tools & Technologies

| Component | Tool/Library | Notes |
|-----------|-------------|-------|
| Token Counting | Anthropic SDK | Official; countTokens() method |
| Offline Token Estimation | js-tiktoken | NPM; for offline scenarios |
| Data Formatting | yaml npm | For YAML serialization |
| Testing | Jest | Existing test framework |
| Memory Storage | sqlite (memory.db) | Existing database |
| Embeddings (optional) | Anthropic embeddings or local | For relevance scoring |

---

## File Structure After Implementation

```
src/
├── tokenCounterService.ts          (NEW - Phase 1)
├── contextFormatter.ts              (NEW - Phase 2)
├── relevanceScorer.ts               (NEW - Phase 3)
├── memoryService.ts                 (MODIFIED - all phases)
├── extension.ts                     (MODIFIED - integration)
└── ...existing files

embeds/
├── agents/
│   ├── memory-prompt.agent.md       (MODIFIED - Phase 2)
│   ├── memory-mcp-research.agent.md (MODIFIED - Phase 2)
│   └── memory-deep-think.agent.md   (MODIFIED - Phase 2)
└── prompts/
    ├── Think.prompt.md              (MODIFIED - Phase 2)
    ├── Execute.prompt.md            (MODIFIED - Phase 2)
    └── ...existing files

tests/
├── tokenCounterService.test.js      (NEW - Phase 1)
├── contextFormatter.test.js         (NEW - Phase 2)
└── relevanceScorer.test.js          (NEW - Phase 3)
```

---

## Implementation Sequence (Detailed)

### Phase 1 Tasks (Week 1 - ~25 hours)
1. #todo Create tokenCounterService.ts with Anthropic countTokens() wrapper
2. #todo Add caching layer to tokenCounterService (in-memory LRU cache)
3. #todo Create fallback offline estimation using js-tiktoken
4. #todo Add getContextBudget() method to memoryService.ts
5. #todo Update memory.db schema to store token metrics
6. #todo Add [CONTEXT_STATUS] header to agent prompts
7. #todo Write unit tests for tokenCounterService
8. #todo Update extension.ts to register and initialize tokenCounterService
9. #todo Validate token counts within 5% of actual usage
10. #todo Document token counting API in README

### Phase 2 Tasks (Week 2 - ~20 hours)
1. #todo Create contextFormatter.ts with Markdown+YAML formatting
2. #todo Add YAML metadata serialization to memoryStore.ts
3. #todo Test backward compatibility with existing entries
4. #todo Optimize agent prompt formatting (~15% reduction)
5. #todo Minify JSON outputs where structured data needed
6. #todo Measure token savings: baseline vs optimized
7. #todo Write unit tests for contextFormatter
8. #todo Update embedded agents with optimized formatting
9. #todo Re-embed agents and prompts (npm run embed-all)
10. #todo Validate agents parse Markdown correctly

### Phase 3 Tasks (Week 3 - ~30 hours)
1. #todo Create relevanceScorer.ts with scoring algorithm
2. #todo Implement keyword-based relevance (fast path)
3. #todo Add optional embedding-based relevance (slow path)
4. #todo Create selectContextForBudget() in memoryService.ts
5. #todo Implement greedy selection algorithm
6. #todo Add recency weighting to scorer
7. #todo Integrate context selector into agent activation flow
8. #todo Add logging: which entries included/excluded
9. #todo Write unit tests for relevanceScorer
10. #todo Integration test: full agent call with smart context
11. #todo Performance profile: scoring latency < 100ms
12. #todo Test with various token budgets: 50K, 100K, 150K

### Phase 4 Tasks (Week 4+ - Optional, ~20 hours)
1. #todo Create conversationSummarizer.ts
2. #todo Add recency bias weighting refinement
3. #todo Implement context rot detection metrics
4. #todo Add soft-prompt compression prototype (research)
5. #todo Monitor performance vs context size
6. #todo Update dashboard with context health indicators

---

## Testing Strategy

**Unit Tests (per component):**
- tokenCounterService: Mock Anthropic API, test caching, offline fallback
- contextFormatter: Test Markdown conversion, YAML serialization, backward compatibility
- relevanceScorer: Test scoring algorithm, ranking, recency weighting

**Integration Tests:**
- Full agent call flow with token counting + smart context selection
- Test with different token budgets: verify context fits
- Test with varying entry types: mixed contexts, decisions, progress

**Performance Tests:**
- Token counter caching: should not exceed 1 API call per 5 minutes
- Relevance scorer: < 100ms per scoring pass
- Context selector: greedy algorithm should complete in < 500ms

**Manual Validation:**
- Run agents with active memory bank
- Observe context status in prompts
- Verify relevant entries included, irrelevant excluded
- Check token savings: target 30-40% reduction

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Token counter API rate limiting | Medium | High | Implement caching (LRU, TTL 5 min) |
| Encoding changes break agents | Medium | High | Comprehensive unit + integration tests |
| Relevance scorer too slow | Low | Medium | Profile early, optimize scoring algorithm |
| Token estimation offline inaccurate | Low | Medium | Fallback to conservative estimate (+20% buffer) |
| Context rot not detected | Low | Medium | Add monitoring dashboard, alert thresholds |

---

## Success Metrics

- ✅ Token count visible before every agent call (Phase 1)
- ✅ 30-40% token savings via encoding optimization (Phase 2)
- ✅ Agents operate within bounded budgets (Phase 3)
- ✅ Relevant entries prioritized over irrelevant (Phase 3)
- ✅ No performance degradation despite reduced context (Phase 3)
- ✅ < 5% token count error margin (Phase 1)
- ✅ Relevance scoring < 100ms latency (Phase 3)
- ✅ "New chat recommended" signal works correctly (Phase 1)

---

## Deliverables

**By End of Phase 1:**
- Token counter service fully functional
- Context budget visible in prompts
- Metrics logged to memory.db

**By End of Phase 2:**
- 30-40% token savings achieved
- All agents use optimized formatting
- No information loss

**By End of Phase 3:**
- Smart context selection working
- Agents consistently operate within budget
- Relevant entries prioritized

**By End of Phase 4 (Optional):**
- Conversation summarization on context overflow
- Context rot detection monitoring
- Soft-prompt compression prototype (if needed)

---

[BRIEF:2025-12-06] [BRIEF:2025-12-06] **Task Breakdown & #todos - Context Window Optimization**

## PHASE 1: Token Counting Middleware (FOUNDATION - Week 1)

### Create tokenCounterService.ts
```
#todo Create src/tokenCounterService.ts with Anthropic SDK wrapper
  - Implement countTokens(messages, model) → number
  - Add caching (LRU cache, 5-min TTL) to prevent API spam
  - Add offline fallback using js-tiktoken for deployment scenarios
  - Export: { countTokens, getEstimate, cache stats }

#todo Implement budget calculation in getContextBudget()
  - Input: used tokens count
  - Calculation: remaining = 200K - used - (200K * 0.20 for output buffer)
  - Return: { total, used, remaining, percentUsed, status }
  - Status: 'healthy' (>50K), 'warning' (10-50K), 'critical' (<10K)

#todo Add metrics persistence to memory.db
  - Schema: token_metrics table (timestamp, model, input_tokens, output_tokens, total)
  - Log every countTokens() call for audit trail
  - Query: getTokenMetrics(days: 7) → historical view
```

### Update Agent Prompts
```
#todo Add context status header to memory-prompt.agent.md
  - Format: [CONTEXT_STATUS: healthy|warning|critical (used: 145K/200K)]
  - Update on each agent activation
  - Visible decision signal for agent: "At 72% capacity; recommend new chat"

#todo Repeat for other agents:
  - memory-mcp-research.agent.md
  - memory-deep-think.agent.md

#todo Update extension activation flow
  - On agent call: check getContextBudget()
  - Inject status into system prompt
  - Log metrics to memory.db
```

### Testing
```
#todo Write tokenCounterService.test.js
  - Test countTokens() accuracy (within 5% of actual)
  - Test caching: second call should not hit API
  - Test offline fallback: js-tiktoken produces reasonable estimate
  - Test budget calculation logic
  - Mock Anthropic SDK for isolated testing

#todo Integration test: extension.ts
  - Verify token counter initializes on activation
  - Verify metrics logged to memory.db
  - Verify status header appears in prompts
```

---

## PHASE 2: Encoding Optimization (DATA DENSITY - Week 2, parallel to Phase 1)

### Create contextFormatter.ts
```
#todo Create src/contextFormatter.ts
  - Input: memory entry object {type, date, content, tags, ...}
  - Output: formatted string for agent consumption
  - Format:
    ```
    [TYPE:DATE] title
    
    markdown content (stripped whitespace)
    
    ---
    ```
  - Strip: unnecessary newlines, comments, formatting metadata
  - Keep: all semantic content, structure

#todo Implement YAML metadata encoding
  - Entry attributes in YAML (instead of JSON)
  - Example:
    ```yaml
    type: CONTEXT
    date: 2025-12-06
    priority: high
    tags: [token-optimization, agents]
    ```
  - Serialize to YAML in memoryStore.ts
  - Decode: parse YAML back to object

#todo Add strip-whitespace utility
  - Remove extra newlines, leading spaces
  - Keep intentional line breaks (for readability)
  - Preserve code block formatting
```

### Optimize Prompts & Agents
```
#todo Reduce verbosity in Think.prompt.md
  - Remove redundant instructions (~15% reduction target)
  - Condense examples
  - Use bullet points instead of paragraphs where possible
  - Measure token count: baseline → optimized

#todo Optimize memory-*.agent.md files
  - Remove wordy descriptions
  - Compact "Memory Best Practices" section
  - Minify JSON examples
  - Keep essential guidance

#todo Update Execute.prompt.md
  - Reduce step-by-step walkthrough verbosity
  - Keep clear, actionable instructions
  - Target: 20-25% token reduction
```

### Minified JSON for Outputs
```
#todo Add output formatter for tool results
  - When agents output structured data (not for context):
    - Use minified JSON (no whitespace)
    - Add header: format: 'minified-json'
  - Keep Markdown for human-readable content

#todo Create outputMinifier utility
  - JSON.stringify(obj) with no spacing
  - Preserve readability for agent parse
```

### Testing
```
#todo Write contextFormatter.test.js
  - Test Markdown conversion: content preserved
  - Test YAML serialization: round-trip (YAML → object → YAML)
  - Test backward compatibility: existing entries still work
  - Test token reduction: measure % savings

#todo Validate agent parsing
  - Agents correctly parse formatted entries
  - No loss of information
  - Performance: formatting < 100ms per entry

#todo Measure token savings
  - Baseline: count tokens of original entries
  - Optimized: count tokens of formatted entries
  - Target: 25-35% reduction
  - Log results to metrics table
```

### Embed Changes
```
#todo Run npm run embed-all
  - Re-embed optimized prompts into promptStore.ts
  - Re-embed optimized agents into agentStore.ts
  - Verify compilation: npm run compile
  - Run tests: npm test
```

---

## PHASE 3: Smart Context Management (SELECTIVE INJECTION - Week 3)

### Create relevanceScorer.ts
```
#todo Create src/relevanceScorer.ts
  - Input: query (user request or task description), entry set
  - Output: scored entries [(entry, score), ...]
  
#todo Implement keyword-based relevance (fast path)
  - Extract keywords from query (remove stop words)
  - Score: TF-IDF or simple keyword overlap
  - Performance: < 50ms for 100 entries
  
#todo Add optional embedding-based relevance (slow path)
  - Use Anthropic embeddings API (if available)
  - Cosine similarity between query + entry embeddings
  - Performance: ~500ms for 100 entries (depends on API)
  - Feature flag: enable/disable embedding path

#todo Implement recency weighting
  - Last 7 days: 1.0x weight
  - 7-30 days: 0.7x weight
  - > 30 days: 0.3x weight
  - Formula: final_score = relevance_score * recency_weight * priority_multiplier

#todo Add priority override
  - High-priority entries (pinned=true): 2.0x multiplier
  - System entries (prompts, guidelines): 1.5x multiplier
  - Regular entries: 1.0x multiplier
```

### Integrate Context Selector
```
#todo Add selectContextForBudget() to memoryService.ts
  - Input: taskDescription (string), tokenBudget (number)
  - Algorithm: greedy selection
    1. Score all entries for relevance
    2. Sort by score descending
    3. Include entries until budget exhausted
    4. Return: selected entries + coverage stats
  - Output: { entries, coverage: "3/20 selected (67K tokens)" }

#todo Implement greedy selection algorithm
  - For each entry (in score order):
    - If (current_tokens + entry_tokens) <= budget:
      - Include entry, increment current_tokens
    - Else: Skip entry
  - Early stop if budget filled

#todo Add fallback for zero-context scenarios
  - If no entries fit budget: return system prompt + current task only
  - Log warning: "Insufficient budget for context entries"
```

### Integration & Flow
```
#todo Update agent activation flow in extension.ts
  - Before calling agent:
    1. Get current token usage (tokenCounterService)
    2. Calculate available budget
    3. Call selectContextForBudget(task, budget)
    4. Inject selected entries into agent prompt
    5. Log: which entries included/excluded
  
#todo Add logging for transparency
  - Log each context selection decision:
    ```
    [INFO] Context Selection: 3/20 entries selected for budget 45K tokens
    [INFO] Included: activeContext (2025-12-06), decisionLog (2025-12-04), ...
    [INFO] Excluded: oldEntry (2025-11-01), ...
    ```
  - Store logs in memory.db debug table for audit

#todo Store coverage metrics
  - Table: context_coverage { timestamp, task_hash, entries_selected, entries_total, tokens_used, budget }
  - Query: getContextCoverage() → historical trends
```

### Testing
```
#todo Write relevanceScorer.test.js
  - Test keyword matching: relevant entries score higher
  - Test recency weighting: recent entries ranked up
  - Test priority override: pinned entries ranked up
  - Test performance: scoring < 100ms for 100 entries
  - Mock embedding API for testing

#todo Write selectContextForBudget() tests
  - Test greedy algorithm: entries selected until budget
  - Test boundary: entry that exceeds budget is skipped
  - Test fallback: empty selection if budget too small
  - Test coverage reporting: accurate % and entry count

#todo Integration test: full agent flow
  - Create realistic memory entries (varied types, ages)
  - Call agent with limited budget (50K tokens)
  - Verify: relevant entries selected, irrelevant excluded
  - Verify: total tokens within budget
  - Measure agent performance: should not degrade

#todo Performance test
  - Scoring latency: < 100ms per call
  - Selection algorithm: < 500ms per call
  - Total overhead: < 1 second per agent call
  - Profile with real entry counts (100+)
```

### Documentation
```
#todo Update README with context management explanation
  - How smart context selection works
  - Token budget visualization
  - How to interpret coverage metrics

#todo Add inline code documentation
  - JSDoc comments on all public APIs
  - Algorithm explanation comments
  - Configuration options documented
```

---

## PHASE 4: Context Rot Mitigation (OPTIONAL ADVANCED - Week 4+)

### Conversation Summarizer
```
#todo Create src/conversationSummarizer.ts (optional)
  - Triggered when: context budget > 75%
  - Action:
    1. Extract key decisions (from decisionLog)
    2. Extract active blockers (from activeContext)
    3. Extract progress summary (from progress)
    4. Generate 1-paragraph summary
    5. Create new entry: {type: "SESSION_SUMMARY", content: summary}
    6. Store in memory.db

#todo Implement summary generation
  - Use offline summarization (Mistral 7B) or simple extraction
  - Output: concise summary < 500 tokens
  - Quality: preserves all critical information
```

### Recency Bias Refinement
```
#todo Add configurable recency weights
  - Adjust decay curve based on metrics
  - Configuration: { days_7: 1.0, days_30: 0.7, days_90: 0.3 }
  - Allow tuning per entry type
```

### Context Rot Monitoring
```
#todo Add performance monitoring
  - Track: agent response quality vs context size
  - Alert if: response quality drops when context > 50K
  - Recommendation: trigger summarization or new chat

#todo Create dashboard widget
  - Display: context health indicators
  - Show: token usage trend over time
  - Alert: when rot likely (based on quality metrics)
```

---

## Summary: Effort Estimate & Timeline

| Phase | Component | Hours | Duration | Dependency |
|-------|-----------|-------|----------|------------|
| 1 | Token Counter Service | 12 | 1.5 days | None |
| 1 | Budget Tracking | 8 | 1 day | TS |
| 1 | Agent Prompt Updates | 3 | 0.5 day | TS, BT |
| 1 | Testing & Integration | 7 | 1 day | All Phase 1 |
| **Phase 1 Total** | | **30** | **~1 week** | |
| 2 | Context Formatter | 10 | 1.5 days | None |
| 2 | YAML Encoding | 8 | 1 day | CF |
| 2 | Prompt Optimization | 5 | 0.5 day | CF |
| 2 | Testing & Embedding | 7 | 1 day | All Phase 2 |
| **Phase 2 Total** | | **30** | **~1 week (parallel)** | |
| 3 | Relevance Scorer | 15 | 2 days | None |
| 3 | Context Selector | 10 | 1.5 days | RS |
| 3 | Integration & Flow | 8 | 1 day | P1 complete |
| 3 | Testing & Validation | 12 | 1.5 days | All Phase 3 |
| **Phase 3 Total** | | **45** | **~1.5 weeks (after P1)** | |
| 4 | Summarizer (optional) | 10 | 1 day | None |
| 4 | Monitoring | 8 | 1 day | None |
| **Phase 4 Total** | | **18** | **~1 week (optional)** | |
| | **GRAND TOTAL** | **95** | **~4-5 weeks** | |

---

## Ready for Execution

All planning complete. Memory bank updated with:
- ✅ Detailed implementation plan (4 phases)
- ✅ Specific task breakdown (#todos per phase)
- ✅ File structure and dependencies
- ✅ Testing strategy and success criteria
- ✅ Risk mitigation plan
- ✅ Timeline and effort estimates

**Next Step**: Switch to Execute mode for Phase 1 implementation.

---

[BRIEF:2025-12-06] [BRIEF:2025-12-06] **METRICS COLLECTION WIRING - COMPREHENSIVE IMPLEMENTATION PLAN**

## Main Task
Wire token counter service + memory store instrumentation into live agent operation to automatically collect, persist, and display token usage and query performance metrics.

## Current State
- ✅ Phase 1-3 Complete: tokenCounterService.ts (286 lines), contextFormatter.ts, relevanceScorer.ts all implemented and tested
- ✅ Benchmark Script: scripts/benchmark-memory.js provides performance testing
- ✅ Memory Store: SQLite with query methods (queryByType, queryByDateRange, fullTextSearch)
- ❌ Missing: Schema for metrics persistence, instrumentation integration, dashboard wiring
- ❌ Gap: Metrics collected but not persisted; no auto-logging on agent calls

## Task Breakdown

### Phase 1: Metrics Schema & Database (Tasks 1-3)
**Goal:** Create persistent metrics storage in memory.db

**Component 1.1: Token Metrics Table**
```
#todo Create token_metrics table schema:
  - id (INTEGER PRIMARY KEY)
  - timestamp (TEXT ISO 8601)
  - model (TEXT: claude-3-5-sonnet, etc.)
  - input_tokens (INTEGER)
  - output_tokens (INTEGER)
  - total_tokens (INTEGER)
  - context_status (TEXT: healthy|warning|critical)
  - created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

#todo Create indexes on token_metrics:
  - INDEX idx_timestamp ON token_metrics(timestamp DESC)
  - INDEX idx_model ON token_metrics(model)
  - INDEX idx_status ON token_metrics(context_status)

#todo Add migration logic to memoryMigration.ts:
  - Check if token_metrics table exists
  - Create on first init if missing
  - No data loss if already exists
```

**Component 1.2: Query Metrics Table**
```
#todo Create query_metrics table schema:
  - id (INTEGER PRIMARY KEY)
  - timestamp (TEXT ISO 8601)
  - operation (TEXT: queryByType|queryByDateRange|fullTextSearch|appendEntry)
  - elapsed_ms (DECIMAL: query duration)
  - result_count (INTEGER: rows returned)
  - created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

#todo Create indexes on query_metrics:
  - INDEX idx_timestamp ON query_metrics(timestamp DESC)
  - INDEX idx_operation ON query_metrics(operation)

#todo Add schema creation to memoryStore initialization:
  - Check on init() call
  - Create tables if missing
```

**Component 1.3: Metrics Views/Helpers**
```
#todo Add helper queries to memoryService.ts:
  - getAverageTokenUsage(days: number) → {avg: number, status: string}
  - getAverageQueryTime(operation: string, days: number) → {avg: number, p50: number, p95: number}
  - getTokenTrend(days: number) → array of {timestamp, total_tokens, status}
  - getQueryLatencies(limit: number) → recent query timings
```

---

### Phase 2: Store Instrumentation (Tasks 4-6)
**Goal:** Auto-wrap memoryStore operations with timing + persistence

**Component 2.1: Query Timing Wrapper**
```
#todo Modify memoryStore.ts - add timing instrumentation:
  - Wrap queryByType() with try/finally timing
  - Wrap queryByDateRange() with timing
  - Wrap fullTextSearch() with timing
  - Wrap appendEntry() with timing
  - Persist each timing to query_metrics table
  - Maintain rolling 50-sample buffer for fast average calculation
  - Non-blocking: log async, don't slow queries

#todo Implementation pattern:
  async queryByType(fileType: string, limit?: number) {
    const startMs = performance.now();
    try {
      const result = await this.actualQuery(fileType, limit);
      const elapsedMs = performance.now() - startMs;
      await this.logQueryMetric('queryByType', elapsedMs, result.count);
      return result;
    } catch (error) {
      const elapsedMs = performance.now() - startMs;
      await this.logQueryMetric('queryByType', elapsedMs, 0, error);
      throw error;
    }
  }

#todo Add logQueryMetric() helper:
  - Insert row to query_metrics table
  - Keep rolling buffer (last 50 samples)
  - Calculate running average
  - Expose getAverageQueryTimeMs(): number
```

**Component 2.2: Entry Count Caching**
```
#todo Add getEntryCounts() to memoryStore:
  - SELECT COUNT(*), file_type FROM entries GROUP BY file_type
  - Return { CONTEXT: N, DECISION: N, PATTERN: N, PROGRESS: N, BRIEF: N }
  - Cache result (invalidate on append)
  - Non-blocking, used by dashboard

#todo Add getLatestEntries(type: string, limit: number):
  - SELECT * FROM entries WHERE file_type=type ORDER BY timestamp DESC LIMIT limit
  - Used by dashboard to show recent context snippets
```

**Component 2.3: Sampling Strategy**
```
#todo Implement sample-only logging to avoid write overhead:
  - Log 1 out of every N metrics (configurable, default N=5)
  - Reduces DB write volume
  - Still captures performance trends
  - No loss of accuracy for averages

#todo Add debug mode:
  - Environment variable: AISK_METRICS_DEBUG=true
  - When true: log 100% of metrics (for development)
  - When false: sample 20% (for production)
```

---

### Phase 3: Token Service Integration (Tasks 7-10)
**Goal:** Auto-log token counts when agents run

**Component 3.1: Extension Activation Hook**
```
#todo Modify extension.ts activation():
  - Initialize tokenCounterService on extension load
  - Initialize tokenCounterService.cache (LRU cache, 5-min TTL)
  - Register command: aiSkeleton.memory.trackTokenUsage
  - Log: "Token counter service initialized"

#todo Add getContextBudget() call on agent activation:
  - Before agent.run(), call tokenCounterService.getContextBudget(usedTokens)
  - Store in extension context state
  - Accessible to prompts/agents via status header
```

**Component 3.2: Agent Call Middleware**
```
#todo Create agentCallMiddleware in extension.ts or new file:
  - Hook called before each agent execution
  - Step 1: Count tokens in agent request
  - Step 2: Calculate budget status (healthy|warning|critical)
  - Step 3: Log to token_metrics table
  - Step 4: Inject status into agent system prompt
  - Return early if critical status (recommend new chat)

#todo Implementation pattern:
  async function logAgentCall(agentId: string, messages: Message[]) {
    const tokensUsed = await tokenCounterService.countTokens({
      model: 'claude-3-5-sonnet',
      messages
    });
    const budget = tokenCounterService.getContextBudget(tokensUsed.inputTokens);
    
    await memoryStore.appendMetric({
      timestamp: new Date().toISOString(),
      model: 'claude-3-5-sonnet',
      input_tokens: tokensUsed.inputTokens,
      output_tokens: tokensUsed.outputTokens,
      total_tokens: tokensUsed.inputTokens + tokensUsed.outputTokens,
      context_status: budget.status
    });
    
    return budget;
  }
```

**Component 3.3: Caching Optimization**
```
#todo Leverage tokenCounterService.cache:
  - Cache hit = no DB write (free metric, already in LRU)
  - Cache miss = write metric + update LRU
  - Prevents duplicate token counting for same request
  - TTL: 5 minutes (configurable)

#todo Add cache stats to dashboard:
  - Cache hit rate (%)
  - Cache eviction count
  - Average hit latency
```

**Component 3.4: Budget Decision Logic**
```
#todo Implement context budget guard in agent execution:
  - If budget.status === 'critical' (<10K tokens):
    - Log warning message
    - Recommend new chat to user
    - Allow override (continue anyway)
  - If budget.status === 'warning' (10-50K tokens):
    - Log warning in dashboard
    - No action required, but visible
  - If budget.status === 'healthy' (>50K tokens):
    - Silent, proceed normally

#todo Wire to statusBar or activity bar:
  - Show [CONTEXT_STATUS] in VS Code status bar
  - Click to see budget breakdown
  - Click "Start New Chat" to trigger action
```

---

### Phase 4: Dashboard Metrics Layer (Tasks 11-14)
**Goal:** Create metrics aggregator + wire to activity bar dashboard

**Component 4.1: Metrics Aggregator Service**
```
#todo Create src/metricsService.ts (new file):
  - Singleton service for metrics queries
  - Exposes:
    - getTokenMetrics(days: 7) → array of token usage records
    - getAverageTokenUsage() → {avg: number, status: string}
    - getTokenTrend(days: 7) → array for charting
    - getQueryMetrics(operation: string, days: 7) → query performance data
    - getAverageQueryTime(operation: string) → {avg: number, p95: number}
    - getLatestTokenEntry() → most recent token log
    - getDashboardMetrics() → aggregated snapshot for dashboard

#todo Implementation:
  - All queries use indexes (O(log n) performance)
  - Cache results for 30 seconds (prevent repeated queries)
  - Expose cache invalidation method for manual refresh
```

**Component 4.2: Dashboard Metrics Display**
```
#todo Update memoryDashboardProvider.ts:
  - Add new tree section: "📊 Metrics"
  - Show:
    - Current budget: "145K / 200K tokens (72%)"
    - Status: "🟡 Warning - consider new chat"
    - Avg query time: "2.3ms" with trending icon
    - Cache hit rate: "87%"
    - Latest token log timestamp
  - Update every 30 seconds automatically
  - Refresh on user focus (VS Code window becomes active)
  - Subscribe to memoryService state changes for real-time updates
```

**Component 4.3: Detailed Metrics Command**
```
#todo Add command: aiSkeleton.memory.showMetricsDetail
  - Opens webview with detailed metrics dashboard
  - Shows:
    - Token usage chart (last 7 days, line chart)
    - Query latency distribution (histogram)
    - Cache hit rate trend
    - Context status timeline
    - Performance SLA compliance (< 50ms target)
  - Export option: download CSV of metrics

#todo Command wiring:
  - Register in package.json contributes.commands
  - Wire to dashboard "📊 Details" button
  - Keyboard shortcut: Cmd+Shift+M (optional)
```

**Component 4.4: Metrics Persistence & Cleanup**
```
#todo Add metrics retention policy:
  - Keep token_metrics for 90 days
  - Keep query_metrics for 30 days
  - Automated cleanup on extension deactivation
  - User option: "Clear All Metrics" in settings

#todo Add to extension deactivation:
  - Call metricsService.cleanup()
  - Delete metrics older than retention period
  - Export summary to memory.db (for trend analysis)
  - Log: "Metrics cleaned up; retained 30 days"
```

---

## Task Dependency Graph

```
Phase 1: Schema & DB
  ↓
Phase 2: Store Instrumentation (depends on schema)
  ↓
Phase 3: Token Service Integration (depends on instrumentation)
  ↓
Phase 4: Dashboard Wiring (depends on all above)
```

**Critical Path:** Phase 1 → Phase 2 → Phase 3 → Phase 4 (sequential, each unblocks next)

---

## Detailed #todos

### Phase 1: Schema (4 hours, 3 tasks)
- #todo Create token_metrics table schema in memoryStore.init()
- #todo Create query_metrics table schema in memoryStore.init()
- #todo Add migration logic to handle existing DBs without these tables

### Phase 2: Instrumentation (8 hours, 4 tasks)
- #todo Wrap memoryStore.queryByType() with timing + metric logging
- #todo Wrap memoryStore.queryByDateRange() with timing + metric logging
- #todo Wrap memoryStore.fullTextSearch() with timing + metric logging
- #todo Wrap memoryStore.appendEntry() with timing + metric logging

### Phase 3: Integration (10 hours, 5 tasks)
- #todo Initialize tokenCounterService in extension.ts activation
- #todo Create agentCallMiddleware() to log token usage before agent runs
- #todo Hook middleware into agent execution flow
- #todo Implement budget decision logic (critical/warning/healthy status)
- #todo Wire context budget status to VS Code status bar

### Phase 4: Dashboard (8 hours, 4 tasks)
- #todo Create metricsService.ts aggregator with query helpers
- #todo Update memoryDashboardProvider.ts to show metrics section
- #todo Add aiSkeleton.memory.showMetricsDetail command + webview
- #todo Implement metrics retention policy + cleanup logic

---

## Success Criteria

✅ **Phase 1 Complete:**
- token_metrics table exists in memory.db
- query_metrics table exists in memory.db
- Schema migrations handle existing DBs gracefully
- No data loss on upgrade

✅ **Phase 2 Complete:**
- All memoryStore queries log timing to query_metrics
- Sample-only logging reduces write overhead
- Rolling average available in < 1ms
- Query performance remains < 50ms (no instrumentation overhead)

✅ **Phase 3 Complete:**
- tokenCounterService auto-logs on agent calls
- Context budget status injected into agent prompts
- Critical/warning/healthy status visible to user
- Budget decision logic prevents context overflow

✅ **Phase 4 Complete:**
- Dashboard shows live token usage (updated every 30s)
- Dashboard shows query latencies and cache stats
- Detailed metrics webview available
- Metrics retained for 90 days (configurable)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Instrumentation overhead slows queries | Low | Medium | Use sampling (1 in N), async logging, benchmark before/after |
| DB writes overwhelm on high traffic | Low | Medium | Sample-only logging, batch writes, periodic cleanup |
| Metrics DB grows too large | Medium | Low | Retention policy, cleanup on deactivation, configurable TTL |
| Dashboard refresh lags | Low | Low | Cache results 30s, update only on focus, async queries |
| Token counting API rate limit | Low | Low | Leverage LRU cache (5-min TTL), count at agent boundaries only |

---

## Timeline Estimate

**Total Effort:** ~30 hours across 1-2 weeks
- Phase 1 (Schema): 4 hours, 1 day
- Phase 2 (Instrumentation): 8 hours, 1-2 days
- Phase 3 (Integration): 10 hours, 2 days
- Phase 4 (Dashboard): 8 hours, 1-2 days
- Buffer/Testing: 2-3 days

**Critical Path:** Phase 1 → Phase 2 must complete before Phase 3 can start

---

## Files to Create/Modify

**New Files:**
- `src/metricsService.ts` (new metrics aggregator service)
- (Dashboard webview HTML/CSS if adding detailed metrics view)

**Modified Files:**
- `src/memoryStore.ts` - Add schema creation + timing instrumentation
- `src/extension.ts` - Add tokenCounterService hooks + middleware
- `src/memoryService.ts` - Add metrics query helpers
- `src/memoryDashboardProvider.ts` - Add metrics display section
- `package.json` - Add new commands + webview contributions (if needed)

**No Files Deleted**

---

## Ready for Execution

Planning complete. All major components identified with:
- ✅ Clear task breakdown (#todos)
- ✅ Dependency graph mapped
- ✅ Success criteria defined
- ✅ Risk mitigation in place
- ✅ Effort estimated
- ✅ Timeline established

**Next Step:** Handoff to Execute mode for Phase 1-4 implementation.
