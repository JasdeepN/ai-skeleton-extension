/**
 * Smart Report Synthesizer - Auto-generates reports from memory context
 * 
 * Core concept: Instead of requiring users to manually write reports,
 * synthesize them automatically from what's actually in the memory bank.
 * 
 * This makes save tools "smart" - they capture work accomplished without
 * forcing users to manually compose summaries.
 * 
 * Supports:
 * - RESEARCH_REPORT (from Think phase)
 * - PLAN_REPORT (from Plan phase)
 * - EXECUTION_REPORT (from Execute phase)
 * - Extensible for custom report types
 */

import { getMemoryStore, MemoryEntry } from './memoryStore';

export interface ReportSynthesisContext {
  reportType: 'research' | 'plan' | 'execution' | string;
  recentEntries?: number;  // How many recent entries to analyze (default: 20)
  summaryMode?: 'full' | 'concise' | 'minimal';  // How detailed the synthesis
  customPrompt?: string;   // Optional: Custom synthesis instruction
}

export interface SynthesizedReport {
  content: string;
  sourceCount: number;
  metadata: {
    generatedAt: string;
    synthesisMode: 'auto' | 'manual';
    entriesAnalyzed: number;
  };
}

/**
 * Synthesize a research report from recent decision log and progress entries
 */
export async function synthesizeResearchReport(context: ReportSynthesisContext): Promise<SynthesizedReport> {
  const store = getMemoryStore();
  const limit = context.recentEntries || 20;
  
  try {
    const decisionsResult = await store.queryByType('DECISION', limit);
    const contextResult = await store.queryByType('CONTEXT', limit);
    
    const findings: string[] = [];
    findings.push('## Key Findings & Decisions\n');
    
    if (decisionsResult.entries.length > 0) {
      findings.push('### Decisions Made:');
      decisionsResult.entries.slice(0, 5).forEach((d: MemoryEntry) => {
        const tag = d.tag ? `[${d.tag}]` : '';
        findings.push(`- ${tag} ${d.content?.split('\n')[0] || 'Decision'}`);
      });
      findings.push('');
    }
    
    if (contextResult.entries.length > 0) {
      findings.push('### Context Insights:');
      contextResult.entries.slice(0, 5).forEach((c: MemoryEntry) => {
        const tag = c.tag ? `[${c.tag}]` : '';
        findings.push(`- ${tag} ${c.content?.split('\n')[0] || 'Context'}`);
      });
      findings.push('');
    }
    
    findings.push(`### Summary`);
    findings.push(`Analyzed ${decisionsResult.entries.length} decisions and ${contextResult.entries.length} context entries.`);
    findings.push(`Total sources reviewed: ${decisionsResult.entries.length + contextResult.entries.length}`);
    
    return {
      content: findings.join('\n'),
      sourceCount: decisionsResult.entries.length + contextResult.entries.length,
      metadata: {
        generatedAt: new Date().toISOString(),
        synthesisMode: 'auto',
        entriesAnalyzed: decisionsResult.entries.length + contextResult.entries.length
      }
    };
  } catch (err) {
    console.error('[ReportSynthesizer] Failed to synthesize research report:', err);
    throw err;
  }
}

/**
 * Synthesize a plan report from progress and decision entries
 */
export async function synthesizePlanReport(context: ReportSynthesisContext): Promise<SynthesizedReport> {
  const store = getMemoryStore();
  const limit = context.recentEntries || 20;
  
  try {
    const progressResult = await store.queryByType('PROGRESS', limit);
    const decisionsResult = await store.queryByType('DECISION', 10);
    
    const planItems: string[] = [];
    planItems.push('## Implementation Plan\n');
    
    if (progressResult.entries.length > 0) {
      planItems.push('### Planned Tasks:');
      
      const nextTasks = progressResult.entries.filter((p: MemoryEntry) => 
        p.content?.includes('next') || p.content?.includes('todo')
      );
      const doingTasks = progressResult.entries.filter((p: MemoryEntry) => 
        p.content?.includes('doing') || p.content?.includes('in-progress')
      );
      
      if (doingTasks.length > 0) {
        planItems.push('**In Progress:**');
        doingTasks.slice(0, 3).forEach((t: MemoryEntry) => {
          planItems.push(`- ${t.content?.split('\n')[0] || 'Task'}`);
        });
        planItems.push('');
      }
      
      if (nextTasks.length > 0) {
        planItems.push('**Next Steps:**');
        nextTasks.slice(0, 5).forEach((t: MemoryEntry) => {
          planItems.push(`- ${t.content?.split('\n')[0] || 'Task'}`);
        });
        planItems.push('');
      }
    }
    
    if (decisionsResult.entries.length > 0) {
      planItems.push('### Strategic Decisions:');
      decisionsResult.entries.slice(0, 3).forEach((d: MemoryEntry) => {
        const tag = d.tag ? `[${d.tag}]` : '';
        planItems.push(`- ${tag} ${d.content?.split('\n')[0] || 'Decision'}`);
      });
      planItems.push('');
    }
    
    planItems.push('### Metrics');
    planItems.push(`- Total planned items: ${progressResult.entries.length}`);
    planItems.push(`- Strategic decisions: ${decisionsResult.entries.length}`);
    
    return {
      content: planItems.join('\n'),
      sourceCount: progressResult.entries.length + decisionsResult.entries.length,
      metadata: {
        generatedAt: new Date().toISOString(),
        synthesisMode: 'auto',
        entriesAnalyzed: progressResult.entries.length + decisionsResult.entries.length
      }
    };
  } catch (err) {
    console.error('[ReportSynthesizer] Failed to synthesize plan report:', err);
    throw err;
  }
}

/**
 * Synthesize an execution report from progress and decision entries
 */
export async function synthesizeExecutionReport(context: ReportSynthesisContext): Promise<SynthesizedReport> {
  const store = getMemoryStore();
  const limit = context.recentEntries || 30;
  
  try {
    const progressResult = await store.queryByType('PROGRESS', limit);
    const decisionsResult = await store.queryByType('DECISION', 15);
    const contextsResult = await store.queryByType('CONTEXT', 10);
    
    const report: string[] = [];
    report.push('## Execution Summary\n');
    
    // Work completed
    report.push('### Work Completed:');
    const completed = progressResult.entries.filter((p: MemoryEntry) => 
      p.content?.toLowerCase().includes('done') || p.progress_status === 'done'
    );
    if (completed.length > 0) {
      completed.slice(0, 8).forEach((item: MemoryEntry) => {
        const tag = item.tag ? `[${item.tag}]` : '[DONE]';
        report.push(`- ${tag} ${item.content?.split('\n')[0] || 'Completed task'}`);
      });
    } else {
      report.push('- (Review progress log for details)');
    }
    report.push('');
    
    // Issues resolved
    report.push('### Issues Resolved:');
    const problematic = decisionsResult.entries.filter((d: MemoryEntry) => 
      d.content?.toLowerCase().includes('fix') || 
      d.content?.toLowerCase().includes('issue') ||
      d.content?.toLowerCase().includes('bug')
    );
    
    if (problematic.length > 0) {
      problematic.slice(0, 4).forEach((item: MemoryEntry) => {
        const tag = item.tag ? `[${item.tag}]` : '[FIX]';
        report.push(`- ${tag} ${item.content?.split('\n')[0] || 'Issue resolved'}`);
      });
    } else if (decisionsResult.entries.length > 0) {
      report.push('- Applied ' + decisionsResult.entries.length + ' strategic decisions');
    } else {
      report.push('- (No issues recorded)');
    }
    report.push('');
    
    // State changes
    if (contextsResult.entries.length > 0) {
      report.push('### State Changes:');
      contextsResult.entries.slice(0, 3).forEach((ctx: MemoryEntry) => {
        const tag = ctx.tag ? `[${ctx.tag}]` : '[STATE]';
        report.push(`- ${tag} ${ctx.content?.split('\n')[0] || 'State updated'}`);
      });
      report.push('');
    }
    
    // Metrics
    report.push('### Execution Metrics');
    report.push(`- Tasks completed: ${completed.length}`);
    report.push(`- Issues resolved: ${problematic.length}`);
    report.push(`- Total progress items: ${progressResult.entries.length}`);
    report.push(`- Total decisions applied: ${decisionsResult.entries.length}`);
    report.push(`- Generated: ${new Date().toISOString().split('T')[0]}`);
    
    return {
      content: report.join('\n'),
      sourceCount: progressResult.entries.length + decisionsResult.entries.length + contextsResult.entries.length,
      metadata: {
        generatedAt: new Date().toISOString(),
        synthesisMode: 'auto',
        entriesAnalyzed: progressResult.entries.length + decisionsResult.entries.length + contextsResult.entries.length
      }
    };
  } catch (err) {
    console.error('[ReportSynthesizer] Failed to synthesize execution report:', err);
    throw err;
  }
}

/**
 * Generic report synthesizer - extensible framework for custom report types
 */
export async function synthesizeReport(context: ReportSynthesisContext & { 
  fileTypes?: string[];
  title?: string;
}): Promise<SynthesizedReport> {
  const store = getMemoryStore();
  const limit = context.recentEntries || 20;
  
  try {
    // Delegate to specific synthesizers for standard types
    if (context.reportType === 'research') {
      return synthesizeResearchReport(context);
    } else if (context.reportType === 'plan') {
      return synthesizePlanReport(context);
    } else if (context.reportType === 'execution') {
      return synthesizeExecutionReport(context);
    }
    
    // Generic/custom report synthesis
    const fileTypes = context.fileTypes || ['DECISION', 'PROGRESS', 'CONTEXT'];
    const title = context.title || `${context.reportType} Report`;
    
    const entries: MemoryEntry[] = [];
    for (const fileType of fileTypes) {
      const results = await store.queryByType(fileType as any, Math.floor(limit / fileTypes.length));
      entries.push(...results.entries);
    }
    
    // Sort by date descending
    entries.sort((a, b) => {
      const aDate = new Date(a.timestamp || 0).getTime();
      const bDate = new Date(b.timestamp || 0).getTime();
      return bDate - aDate;
    });
    
    // Build report
    const reportLines: string[] = [];
    reportLines.push(`## ${title}\n`);
    reportLines.push('### Entries:\n');
    
    entries.slice(0, limit).forEach((entry: MemoryEntry) => {
      const tag = entry.tag ? `[${entry.tag}]` : `[${entry.file_type}]`;
      const preview = (entry.content || '').split('\n')[0].slice(0, 80);
      reportLines.push(`- ${tag} ${preview}...`);
    });
    
    reportLines.push(`\n### Metadata`);
    reportLines.push(`- Report type: ${context.reportType}`);
    reportLines.push(`- Entries analyzed: ${entries.length}`);
    reportLines.push(`- Generated: ${new Date().toISOString()}`);
    
    return {
      content: reportLines.join('\n'),
      sourceCount: entries.length,
      metadata: {
        generatedAt: new Date().toISOString(),
        synthesisMode: 'auto',
        entriesAnalyzed: entries.length
      }
    };
  } catch (err) {
    console.error('[ReportSynthesizer] Failed to synthesize custom report:', err);
    throw err;
  }
}
