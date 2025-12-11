import * as vscode from 'vscode';

export type ToolSource = 'mcp' | 'extension' | 'builtin' | 'unknown';

export interface UnifiedToolEntry {
  name: string;
  source: ToolSource;
  tags: string[];
  description?: string;
  tool: vscode.LanguageModelTool<any>;
}

export interface RegistrySummary {
  allowedCount: number;
  blockedCount: number;
  bySource: Record<ToolSource, number>;
  blockedNames: string[];
  topNames: string[];
}

export interface RegistryResult {
  allowed: UnifiedToolEntry[];
  blocked: UnifiedToolEntry[];
  summary: RegistrySummary;
}

type Priority = 'mcp' | 'extension' | 'mixed';

const DEFAULT_PRIORITY: Priority = 'mcp';
const MAX_TOP_NAMES = 5;

function detectSource(tool: vscode.LanguageModelTool<any>): ToolSource {
  const anyTool = tool as any;
  const name = String((tool as any).name ?? '');
  const tags: string[] = Array.isArray((tool as any).tags) ? (tool as any).tags : [];

  // Heuristics for MCP tools
  if (
    anyTool?.provider?.type === 'mcp' ||
    anyTool?.provider?.kind === 'mcp' ||
    anyTool?.source === 'mcp' ||
    tags.includes('mcp') ||
    name.startsWith('mcp.') ||
    name.startsWith('mcp/')
  ) {
    return 'mcp';
  }

  // Extension-local tools (aiSkeleton_* are ours)
  if (
    name.startsWith('aiSkeleton_') ||
    tags.includes('ai-skeleton') ||
    anyTool?.extensionId?.includes?.('ai-skeleton')
  ) {
    return 'extension';
  }

  // Built-in VS Code or Copilot tools often have vendor-like tags
  if (tags.includes('builtin') || tags.includes('copilot')) {
    return 'builtin';
  }

  return 'unknown';
}

function toUnifiedEntry(tool: vscode.LanguageModelTool<any>): UnifiedToolEntry {
  const anyTool = tool as any;
  return {
    name: String(anyTool.name ?? ''),
    source: detectSource(tool),
    tags: Array.isArray(anyTool.tags) ? anyTool.tags : [],
    description: typeof anyTool.description === 'string' ? anyTool.description : undefined,
    tool
  };
}

function globToRegExp(pattern: string): RegExp {
  // Basic glob -> regex conversion (supports * and ?). Escapes other regex characters.
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(regexStr, 'i');
}

function buildRestrictionMatchers(restrictions: string[]): Array<(name: string) => boolean> {
  return restrictions
    .filter(r => typeof r === 'string' && r.trim().length > 0)
    .map(raw => {
      const pattern = raw.trim();
      // /regex/ pattern support
      if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
        try {
          const body = pattern.slice(1, -1);
          const re = new RegExp(body, 'i');
          return (name: string) => re.test(name);
        } catch {
          // fall through to glob/exact if regex invalid
        }
      }
      // Glob support
      if (pattern.includes('*') || pattern.includes('?')) {
        const re = globToRegExp(pattern);
        return (name: string) => re.test(name);
      }
      // Exact match (case-insensitive)
      return (name: string) => name.toLowerCase() === pattern.toLowerCase();
    });
}

function applyRestrictions(entries: UnifiedToolEntry[], restrictions: string[]): { allowed: UnifiedToolEntry[]; blocked: UnifiedToolEntry[] } {
  const matchers = buildRestrictionMatchers(restrictions);
  if (!matchers.length) return { allowed: entries, blocked: [] };

  const blocked: UnifiedToolEntry[] = [];
  const allowed: UnifiedToolEntry[] = [];

  for (const entry of entries) {
    const isBlocked = matchers.some(m => m(entry.name));
    (isBlocked ? blocked : allowed).push(entry);
  }

  return { allowed, blocked };
}

function dedupeByName(entries: UnifiedToolEntry[]): UnifiedToolEntry[] {
  const seen = new Set<string>();
  const result: UnifiedToolEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    result.push(entry);
  }
  return result;
}

function orderTools(buckets: Record<ToolSource, UnifiedToolEntry[]>, priority: Priority): UnifiedToolEntry[] {
  const mcp = buckets.mcp ?? [];
  const ext = buckets.extension ?? [];
  const builtin = buckets.builtin ?? [];
  const unknown = buckets.unknown ?? [];

  if (priority === 'extension') {
    return [...ext, ...mcp, ...builtin, ...unknown];
  }

  if (priority === 'mixed') {
    const ordered: UnifiedToolEntry[] = [];
    const lists = [mcp, ext, builtin, unknown];
    let index = 0;
    const maxLen = Math.max(...lists.map(l => l.length));
    while (index < maxLen) {
      for (const list of lists) {
        if (index < list.length) {
          ordered.push(list[index]);
        }
      }
      index++;
    }
    return ordered;
  }

  // Default MCP-first
  return [...mcp, ...ext, ...builtin, ...unknown];
}

function summarize(allowed: UnifiedToolEntry[], blocked: UnifiedToolEntry[]): RegistrySummary {
  const bySource: Record<ToolSource, number> = { mcp: 0, extension: 0, builtin: 0, unknown: 0 };
  for (const entry of allowed) {
    bySource[entry.source] = (bySource[entry.source] ?? 0) + 1;
  }

  return {
    allowedCount: allowed.length,
    blockedCount: blocked.length,
    bySource,
    blockedNames: blocked.map(b => b.name),
    topNames: allowed.slice(0, MAX_TOP_NAMES).map(a => a.name)
  };
}

export function buildUnifiedToolRegistry(options?: { priority?: Priority; restrictions?: string[] }): RegistryResult {
  const priority = options?.priority ?? DEFAULT_PRIORITY;
  const restrictions = options?.restrictions ?? [];

  const lm = (vscode as any).lm;
  const registeredTools: vscode.LanguageModelTool<any>[] = Array.isArray(lm?.tools) ? lm.tools : [];

  const unifiedEntries = registeredTools.map(toUnifiedEntry);
  const uniqueEntries = dedupeByName(unifiedEntries);
  const { allowed: unrestrictedAllowed, blocked } = applyRestrictions(uniqueEntries, restrictions);

  const buckets: Record<ToolSource, UnifiedToolEntry[]> = {
    mcp: [],
    extension: [],
    builtin: [],
    unknown: []
  };

  for (const entry of unrestrictedAllowed) {
    buckets[entry.source].push(entry);
  }

  const orderedAllowed = orderTools(buckets, priority);

  return {
    allowed: orderedAllowed,
    blocked,
    summary: summarize(orderedAllowed, blocked)
  };
}

export function formatAvailabilitySummary(summary: RegistrySummary, options?: { includeBlocked?: boolean; maxNames?: number }): string {
  const maxNames = options?.maxNames ?? MAX_TOP_NAMES;
  const parts: string[] = [];
  parts.push(`Allowed ${summary.allowedCount} (mcp ${summary.bySource.mcp ?? 0}, ext ${summary.bySource.extension ?? 0}, builtin ${summary.bySource.builtin ?? 0})`);

  if (summary.blockedCount > 0 && options?.includeBlocked !== false) {
    parts.push(`Blocked ${summary.blockedCount}`);
  }

  if (summary.topNames.length && maxNames > 0) {
    parts.push(`Top: ${summary.topNames.slice(0, maxNames).join(', ')}`);
  }

  return parts.join(' | ');
}
