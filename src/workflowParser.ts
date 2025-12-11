import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Workflow step extracted from prompt file
 */
export interface WorkflowStep {
	title: string;
	description: string;
	order: number;
}

/**
 * Workflow phase with ordered steps
 */
export interface WorkflowPhase {
	phase: 'research' | 'planning' | 'execution';
	steps: WorkflowStep[];
}

/**
 * Cache for parsed workflow steps
 */
const workflowCache = new Map<string, WorkflowStep[]>();

/**
 * Parse workflow steps from a prompt file
 * 
 * @param phase - The workflow phase (research/planning/execution)
 * @returns Array of workflow steps
 */
export async function parseWorkflowSteps(phase: 'research' | 'planning' | 'execution'): Promise<WorkflowStep[]> {
	// Check cache first
	const cacheKey = phase;
	if (workflowCache.has(cacheKey)) {
		return workflowCache.get(cacheKey)!;
	}

	let steps: WorkflowStep[] = [];
	
	try {
		// Map phase to prompt filename
		const promptFile = getPromptFilename(phase);
		const promptPath = path.join(__dirname, '..', '.github', 'prompts', promptFile);
		
		// Read prompt file
		const content = await fs.promises.readFile(promptPath, 'utf-8');
		
		// Parse based on phase
		switch (phase) {
			case 'research':
				steps = parseThinkPrompt(content);
				break;
			case 'planning':
				steps = parsePlanPrompt(content);
				break;
			case 'execution':
				steps = parseExecutePrompt(content);
				break;
		}
		
		// Cache results
		workflowCache.set(cacheKey, steps);
		
	} catch (error) {
		console.error(`[workflowParser] Error parsing ${phase} prompt:`, error);
		// Return empty array on error
		steps = [];
	}
	
	return steps;
}

/**
 * Get prompt filename for a phase
 */
function getPromptFilename(phase: 'research' | 'planning' | 'execution'): string {
	switch (phase) {
		case 'research': return 'Think.prompt.md';
		case 'planning': return 'Plan.prompt.md';
		case 'execution': return 'Execute.prompt.md';
	}
}

/**
 * Parse Think.prompt.md (5 phases)
 */
function parseThinkPrompt(content: string): WorkflowStep[] {
	const steps: WorkflowStep[] = [];
	
	// Match: ### Phase N: Title
	const phaseRegex = /###\s+Phase\s+(\d+):\s+(.+)/g;
	let match;
	
	while ((match = phaseRegex.exec(content)) !== null) {
		const order = parseInt(match[1], 10);
		const title = match[2].trim();
		
		// Extract description (first paragraph after heading)
		const descStart = match.index + match[0].length;
		const descEnd = content.indexOf('\n\n', descStart);
		const description = descEnd > descStart 
			? content.substring(descStart, descEnd).trim()
			: title;
		
		steps.push({ title, description, order });
	}
	
	return steps;
}

/**
 * Parse Plan.prompt.md (6 main sections)
 */
function parsePlanPrompt(content: string): WorkflowStep[] {
	const steps: WorkflowStep[] = [];
	
	// Match: ## N. Section Title
	const sectionRegex = /##\s+(\d+)\.\s+(.+)/g;
	let match;
	
	while ((match = sectionRegex.exec(content)) !== null) {
		const order = parseInt(match[1], 10);
		const title = match[2].trim();
		
		// Extract description (first paragraph after heading)
		const descStart = match.index + match[0].length;
		const descEnd = content.indexOf('\n\n', descStart);
		const description = descEnd > descStart 
			? content.substring(descStart, descEnd).trim()
			: title;
		
		steps.push({ title, description, order });
	}
	
	return steps;
}

/**
 * Parse Execute.prompt.md (protocol phases)
 */
function parseExecutePrompt(content: string): WorkflowStep[] {
	const steps: WorkflowStep[] = [];
	
	// Match: ### Phase N: Title
	const phaseRegex = /###\s+Phase\s+(\d+):\s+(.+)/g;
	let match;
	let order = 0;
	
	while ((match = phaseRegex.exec(content)) !== null) {
		order++;
		const title = match[2].trim();
		
		// Extract description (first paragraph after heading)
		const descStart = match.index + match[0].length;
		const descEnd = content.indexOf('\n\n', descStart);
		const description = descEnd > descStart 
			? content.substring(descStart, descEnd).trim()
			: title;
		
		steps.push({ title, description, order });
	}
	
	return steps;
}

/**
 * Clear workflow cache (for testing)
 */
export function clearWorkflowCache(): void {
	workflowCache.clear();
}
