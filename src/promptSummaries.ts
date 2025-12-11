/**
 * Prompt Summaries - Concise guidance for keyword-triggered prompts
 * Optimized for context conservation: ~50 tokens instead of 500+ tokens per prompt
 * 
 * Used by chatParticipant.ts to inject brief guidance into system message
 * when keywords are detected in user input.
 */

/**
 * Concise summaries of each prompt's key actions
 * Format: [KEYWORD MODE] <concise steps>
 * Purpose: Guide LM autonomously without consuming full prompt content
 */
export const PROMPT_SUMMARIES: Record<string, string> = {
  checkpoint: `CHECKPOINT WORKFLOW - You MUST execute these steps in order:
1. FIRST: Analyze the [CURRENT MEMORY STATE] provided above - it contains context, decisions, progress, patterns
2. Call aiSkeleton_updateProgress for recently completed work (status: done)
3. Call aiSkeleton_logDecision for any technical decisions made this session
4. Call aiSkeleton_updatePatterns if new patterns were discovered
5. Generate a commit message summarizing the session work
DO NOT say "no memory available" - memory is already loaded above.`,
  
  execute: `Execute: 1) Load plan and #todos, 2) For each todo: make atomic change, verify compilation, run tests, 3) Log decision and progress after each action, 4) Build succeeds and all tests pass before completing`,
  
  plan: `Plan: 1) Define main task clearly, 2) Break into major components, 3) Outline actionable steps for each, 4) Assign #todos, 5) Save plan via aiSkeleton_updateProgress and aiSkeleton_updateContext`,
  
  sync: `SYNC WORKFLOW - You MUST execute these steps:
1. FIRST: Analyze the [CURRENT MEMORY STATE] provided above
2. Check git status for recent changes
3. Resolve conflicts between code state and memory entries
4. Call aiSkeleton_updateContext with current focus
5. Call aiSkeleton_updateProgress to reconcile task status
DO NOT say "no memory available" - memory is already loaded above.`,
  
  commit: `Commit: 1) Stage changes via git add, 2) Write clear commit message summarizing work, 3) Verify tests pass, 4) Push to branch, 5) Log decision if merging to main`,
  
  update: `Update: 1) Identify what changed (files/features), 2) Update affected documentation, 3) Log decision explaining changes, 4) Update memory context, 5) Verify build and tests`
};

/**
 * Get concise summary for a keyword
 * @param keyword The detected keyword (checkpoint, execute, plan, sync, commit, update)
 * @returns Summary string or null if keyword not found
 */
export function getSummary(keyword: string): string | null {
  const normalized = keyword.toLowerCase().trim();
  return PROMPT_SUMMARIES[normalized] || null;
}

/**
 * Get all available trigger keywords
 * @returns Array of supported keywords
 */
export function getTriggerKeywords(): string[] {
  return Object.keys(PROMPT_SUMMARIES);
}
