/**
 * Phase Detector - Automatically determines workflow phase from context
 * 
 * Detects which phase the agent is in based on:
 * - Prompt context (Think.prompt.md mentions "research")
 * - Memory state (previous progress entries tagged with phases)
 * - System message content
 * 
 * Phases:
 * - 'research': Discovery, analysis, understanding (Think mode)
 * - 'planning': Design, breakdown, task definition (Plan mode)
 * - 'execution': Implementation, code changes, testing (Execute mode)
 * - 'checkpoint': Summary, state saving (Checkpoint mode)
 */

import * as vscode from 'vscode';
import { getMemoryStore } from './memoryStore';

export type WorkflowPhase = 'research' | 'planning' | 'execution' | 'checkpoint' | null;

// Module-level variable to track phase transitions
let lastDetectedPhase: WorkflowPhase = null;

/**
 * Keywords that indicate each phase
 */
const PHASE_KEYWORDS = {
  research: [
    'deep think', 'research', 'analysis', 'analyze', 'understand', 'investigate',
    'explore', 'discover', 'learn', 'problem definition', 'root cause', 'investigation'
  ],
  planning: [
    'plan', 'design', 'architecture', 'breakdown', 'task list', 'todo', 'strategy',
    'organize', 'structure', 'divide', 'decompose', 'sequence', 'roadmap', 'steps'
  ],
  execution: [
    'execute', 'implement', 'code', 'build', 'deploy', 'run', 'test', 'integrate',
    'create', 'modify', 'fix', 'refactor', 'write', 'development', 'implementation'
  ],
  checkpoint: [
    'checkpoint', 'save', 'commit', 'summary', 'recap', 'wrap up', 'complete',
    'finalize', 'consolidate', 'progress update', 'status'
  ]
};

/**
 * Auto-generate reports on phase transitions
 */
async function onPhaseTransition(previousPhase: WorkflowPhase, currentPhase: WorkflowPhase): Promise<void> {
  if (!previousPhase || !currentPhase || previousPhase === currentPhase) {
    return; // No transition
  }

  try {
    // Dynamically import to avoid circular dependencies
    const { getMemoryService } = await import('./memoryService');
    const memoryService = getMemoryService();

    // Generate report for the phase we're leaving (if it's research, planning, or execution)
    const phaseToReport = previousPhase as 'research' | 'planning' | 'execution' | null;
    if (phaseToReport && ['research', 'planning', 'execution'].includes(phaseToReport)) {
      console.log(`[PhaseDetector] Phase transition: ${previousPhase} → ${currentPhase}. Auto-generating ${phaseToReport} report.`);
      const success = await memoryService.generatePhaseMemoryReport(phaseToReport as 'research' | 'planning' | 'execution');
      if (success) {
        void vscode.window.showInformationMessage(
          `✓ ${phaseToReport} phase complete. Report saved to memory with vector tagging.`,
          'View in Dashboard'
        ).then(action => {
          if (action === 'View in Dashboard') {
            // Open the memory dashboard (if it exists as a command)
            vscode.commands.executeCommand('aiSkeleton.memory.dashboard');
          }
        });
      }
    }
  } catch (err) {
    console.warn('[PhaseDetector] Failed to auto-generate report on phase transition:', err);
  }
}

/**
 * Detect the current workflow phase from system context
 */
export async function detectPhase(systemPrompt?: string): Promise<WorkflowPhase> {
  let detectedPhase: WorkflowPhase = null;

  // If system prompt provided, analyze it for keywords
  if (systemPrompt) {
    const lowerPrompt = systemPrompt.toLowerCase();
    
    for (const [phase, keywords] of Object.entries(PHASE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerPrompt.includes(keyword)) {
          console.log(`[PhaseDetector] Detected phase '${phase}' from system prompt keyword: '${keyword}'`);
          detectedPhase = phase as WorkflowPhase;
          break;
        }
      }
      if (detectedPhase) break;
    }
  }

  // If no phase from prompt, check the most recent progress entry with phase metadata
  if (!detectedPhase) {
    try {
      const store = getMemoryStore();
      
      // Query recent PROGRESS entries to see what phase was last active
      const progressResult = await store.queryByType('PROGRESS', 20);
      
      if (progressResult.entries.length > 0) {
        // Look for the most recent entry with explicit phase metadata
        for (const entry of progressResult.entries) {
          if (entry.phase) {
            console.log(`[PhaseDetector] Detected phase '${entry.phase}' from recent PROGRESS entry`);
            detectedPhase = entry.phase;
            break;
          }
        }
      }

      // If still no phase, check recent CONTEXT entries
      if (!detectedPhase) {
        const contextResult = await store.queryByType('CONTEXT', 10);
        if (contextResult.entries.length > 0) {
          for (const entry of contextResult.entries) {
            if (entry.phase) {
              console.log(`[PhaseDetector] Detected phase '${entry.phase}' from recent CONTEXT entry`);
              detectedPhase = entry.phase;
              break;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[PhaseDetector] Failed to query memory for phase detection:', err);
    }
  }

  // Check for phase transition and auto-generate report if needed
  if (detectedPhase !== lastDetectedPhase) {
    await onPhaseTransition(lastDetectedPhase, detectedPhase);
    lastDetectedPhase = detectedPhase;
  }

  // Default: no phase detected
  if (!detectedPhase) {
    console.log('[PhaseDetector] No phase detected from context or memory');
  }
  
  return detectedPhase;
}

/**
 * Detect phase from tool invocation context
 * Examines the system message to infer workflow mode
 */
export function detectPhaseFromContext(context?: {
  systemPrompt?: string;
  userMessage?: string;
  previousPhase?: WorkflowPhase;
}): WorkflowPhase {
  if (!context) return null;

  const text = (context.systemPrompt || '') + ' ' + (context.userMessage || '');
  const lowerText = text.toLowerCase();

  // Check for explicit phase markers
  if (lowerText.includes('[think') || lowerText.includes('deep think') || lowerText.includes('research')) {
    return 'research';
  }
  if (lowerText.includes('[plan') || lowerText.includes('planning') || lowerText.includes('design')) {
    return 'planning';
  }
  if (lowerText.includes('[execute') || lowerText.includes('execution') || lowerText.includes('implement')) {
    return 'execution';
  }
  if (lowerText.includes('[checkpoint') || lowerText.includes('checkpoint') || lowerText.includes('save')) {
    return 'checkpoint';
  }

  // Fall back to previous phase if detected
  return context.previousPhase || null;
}

/**
 * Infer the next phase in the workflow
 * Useful for suggesting what comes after current phase
 */
export function getNextPhase(currentPhase: WorkflowPhase): WorkflowPhase {
  switch (currentPhase) {
    case 'research':
      return 'planning';
    case 'planning':
      return 'execution';
    case 'execution':
      return 'checkpoint';
    case 'checkpoint':
      return 'research'; // Cycle back for iterative improvement
    default:
      return 'research'; // Start with research if unknown
  }
}

/**
 * Get human-readable name for a phase
 */
export function getPhaseLabel(phase: WorkflowPhase): string {
  const labels: Record<NonNullable<WorkflowPhase>, string> = {
    research: 'Research & Analysis',
    planning: 'Planning & Design',
    execution: 'Implementation & Testing',
    checkpoint: 'Checkpoint & Summary'
  };
  return phase ? labels[phase] : 'Unknown Phase';
}
