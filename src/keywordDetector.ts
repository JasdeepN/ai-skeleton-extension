/**
 * Keyword Detection Utility
 * Detects trigger words in user input and maps them to corresponding prompts.
 * LM autonomously decides which tools to use based on injected prompt guidance.
 */

import { getSummary } from './promptSummaries';

export interface DetectedKeyword {
  keyword: string;
  promptKey: string;
  summary: string;
  confidence: number;
}

/**
 * Trigger word mappings to prompt keys
 * Keys match promptStore entries (e.g., 'checkpoint' loads Checkpoint.prompt.md)
 */
const KEYWORD_MAPPINGS: Record<string, string[]> = {
  checkpoint: ['checkpoint', 'save checkpoint', 'create checkpoint', 'mark checkpoint'],
  execute: ['execute', 'implement', 'run', 'deploy', 'build', 'start'],
  plan: ['plan', 'planning', 'think', 'design', 'architect', 'strategy'],
  sync: ['sync', 'synchronize', 'update', 'refresh', 'reconcile'],
  commit: ['commit', 'push', 'save', 'persist', 'store'],
  update: ['update', 'modify', 'change', 'edit', 'alter'],
};

/**
 * Detect keywords in user input
 * Returns the most confident match if found, including concise summary
 */
export function detectKeyword(userInput: string): DetectedKeyword | null {
  const lowerInput = userInput.toLowerCase();

  // Check each mapping for matches
  for (const [promptKey, keywords] of Object.entries(KEYWORD_MAPPINGS)) {
    for (const keyword of keywords) {
      // Exact phrase match (highest confidence)
      if (lowerInput.includes(keyword)) {
        const summary = getSummary(promptKey);
        return {
          keyword,
          promptKey,
          summary: summary || `Follow ${promptKey} workflow`,
          confidence: 0.95,
        };
      }
    }
  }

  return null;
}

/**
 * Get all registered trigger words (for documentation/help)
 */
export function getTriggerWords(): Record<string, string[]> {
  return KEYWORD_MAPPINGS;
}
