/**
 * Tagging Service - Extensible metadata and tag management for AI-Memory entries
 * Supports three tag dimensions: progress status, target domain, and research phase
 */

/**
 * Progress Status Dimension - Mutually exclusive
 */
export type ProgressStatus = 'done' | 'in-progress' | 'draft' | 'deprecated';

/**
 * Target Domain Dimension - Can have multiple values
 */
export type TargetDomain = 'ui' | 'db' | 'refactor' | 'tests' | 'docs' | 'perf' | 'integration' | 'infra';

/**
 * Research Phase Dimension - Mutually exclusive
 */
export type ResearchPhase = 'research' | 'planning' | 'execution' | 'checkpoint';

/**
 * Metadata object for storing tags
 */
export interface EntryMetadata {
  progress?: ProgressStatus;
  targets?: TargetDomain[];
  phase?: ResearchPhase;
  [key: string]: any; // Allow extensibility
}

/**
 * Validates progress status
 */
export function isValidProgressStatus(value: any): value is ProgressStatus {
  return ['done', 'in-progress', 'draft', 'deprecated'].includes(value);
}

/**
 * Validates target domain
 */
export function isValidTargetDomain(value: any): value is TargetDomain {
  return ['ui', 'db', 'refactor', 'tests', 'docs', 'perf', 'integration', 'infra'].includes(value);
}

/**
 * Validates research phase
 */
export function isValidResearchPhase(value: any): value is ResearchPhase {
  return ['research', 'planning', 'execution', 'checkpoint'].includes(value);
}

/**
 * Validates complete metadata object
 */
export function validateMetadata(metadata: any): EntryMetadata {
  const validated: EntryMetadata = {};

  if (metadata.progress) {
    if (!isValidProgressStatus(metadata.progress)) {
      throw new Error(`Invalid progress status: ${metadata.progress}. Valid values: done, in-progress, draft, deprecated`);
    }
    validated.progress = metadata.progress;
  }

  if (metadata.targets) {
    if (!Array.isArray(metadata.targets)) {
      throw new Error('targets must be an array');
    }
    for (const target of metadata.targets) {
      if (!isValidTargetDomain(target)) {
        throw new Error(`Invalid target domain: ${target}. Valid values: ui, db, refactor, tests, docs, perf, integration, infra`);
      }
    }
    validated.targets = metadata.targets;
  }

  if (metadata.phase) {
    if (!isValidResearchPhase(metadata.phase)) {
      throw new Error(`Invalid research phase: ${metadata.phase}. Valid values: research, planning, execution, checkpoint`);
    }
    validated.phase = metadata.phase;
  }

  // Pass through any additional custom metadata
  for (const [key, value] of Object.entries(metadata)) {
    if (!['progress', 'targets', 'phase'].includes(key)) {
      validated[key] = value;
    }
  }

  return validated;
}

/**
 * Creates metadata from options (for tool parameters)
 */
export function createMetadataFromOptions(options?: {
  progress?: ProgressStatus;
  targets?: TargetDomain[];
  phase?: ResearchPhase;
}): EntryMetadata | undefined {
  if (!options || (Object.keys(options).length === 0)) {
    return undefined;
  }

  const validated = validateMetadata(options);
  return Object.keys(validated).length > 0 ? validated : undefined;
}

/**
 * Parses metadata JSON string
 */
export function parseMetadata(jsonString?: string): EntryMetadata {
  if (!jsonString || jsonString === '{}') {
    return {};
  }

  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.warn('[TaggingService] Failed to parse metadata JSON:', e);
    return {};
  }
}

/**
 * Serializes metadata to JSON string
 */
export function serializeMetadata(metadata?: EntryMetadata): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return '{}';
  }

  return JSON.stringify(metadata);
}

/**
 * Merges two metadata objects, with new values overriding old
 */
export function mergeMetadata(oldMetadata?: EntryMetadata, newMetadata?: EntryMetadata): EntryMetadata {
  return {
    ...oldMetadata,
    ...newMetadata
  };
}

/**
 * Tag query helper - filters entries by progress status
 */
export function filterByProgressStatus(entries: any[], status: ProgressStatus): any[] {
  return entries.filter(entry => {
    const metadata = parseMetadata(entry.metadata);
    return metadata.progress === status;
  });
}

/**
 * Tag query helper - filters entries by target domain(s)
 */
export function filterByTargetDomains(entries: any[], domains: TargetDomain[]): any[] {
  return entries.filter(entry => {
    const metadata = parseMetadata(entry.metadata);
    if (!metadata.targets || metadata.targets.length === 0) {
      return false;
    }
    return domains.some(domain => metadata.targets?.includes(domain));
  });
}

/**
 * Tag query helper - filters entries by research phase
 */
export function filterByResearchPhase(entries: any[], phase: ResearchPhase): any[] {
  return entries.filter(entry => {
    const metadata = parseMetadata(entry.metadata);
    return metadata.phase === phase;
  });
}

/**
 * Tag summary - counts entries by progress status
 */
export function countByProgressStatus(entries: any[]): Record<ProgressStatus, number> {
  const counts: Record<ProgressStatus, number> = {
    'done': 0,
    'in-progress': 0,
    'draft': 0,
    'deprecated': 0
  };

  for (const entry of entries) {
    const metadata = parseMetadata(entry.metadata);
    if (metadata.progress && counts[metadata.progress] !== undefined) {
      counts[metadata.progress]++;
    }
  }

  return counts;
}

/**
 * Tag summary - counts entries by research phase
 */
export function countByResearchPhase(entries: any[]): Record<ResearchPhase, number> {
  const counts: Record<ResearchPhase, number> = {
    'research': 0,
    'planning': 0,
    'execution': 0,
    'checkpoint': 0
  };

  for (const entry of entries) {
    const metadata = parseMetadata(entry.metadata);
    if (metadata.phase && counts[metadata.phase] !== undefined) {
      counts[metadata.phase]++;
    }
  }

  return counts;
}

/**
 * Tag summary - aggregates target domains used
 */
export function aggregateTargetDomains(entries: any[]): Record<TargetDomain, number> {
  const domains: Record<TargetDomain, number> = {
    'ui': 0,
    'db': 0,
    'refactor': 0,
    'tests': 0,
    'docs': 0,
    'perf': 0,
    'integration': 0,
    'infra': 0
  };

  for (const entry of entries) {
    const metadata = parseMetadata(entry.metadata);
    if (metadata.targets && Array.isArray(metadata.targets)) {
      for (const target of metadata.targets) {
        if (domains[target] !== undefined) {
          domains[target]++;
        }
      }
    }
  }

  return domains;
}
