import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getMemoryService } from '../../../src/memoryService';

suite('AI-Memory E2E Tests (DB-only)', () => {
	const testWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const memoryPath = testWorkspaceRoot ? path.join(testWorkspaceRoot, 'AI-Memory') : '';

	teardown(async () => {
		// Cleanup: Remove AI-Memory folder after tests
		if (memoryPath && fs.existsSync(memoryPath)) {
			fs.rmSync(memoryPath, { recursive: true, force: true });
		}
	});

	test('Create Memory Bank command should create AI-Memory folder and database', async () => {
		// Ensure clean state
		if (memoryPath && fs.existsSync(memoryPath)) {
			fs.rmSync(memoryPath, { recursive: true, force: true });
		}

		// Execute create command
		await vscode.commands.executeCommand('aiSkeleton.memory.create');

		// Wait for creation with polling using VS Code's filesystem API
		const memoryUri = vscode.Uri.file(memoryPath);
		const dbUri = vscode.Uri.file(path.join(memoryPath, 'memory.db'));
		let attempts = 0;
		const maxAttempts = 100; // 10 seconds total (100 * 100ms)
		
		while (attempts < maxAttempts) {
			try {
				const stat = await vscode.workspace.fs.stat(dbUri);
				if (stat.type === vscode.FileType.File) {
					break;
				}
			} catch {
				// File doesn't exist yet
			}
			await new Promise(resolve => setTimeout(resolve, 100));
			attempts++;
		}

		// Verify folder exists using VS Code API
		try {
			const stat = await vscode.workspace.fs.stat(memoryUri);
			assert.ok(stat.type === vscode.FileType.Directory, 'AI-Memory folder not created');
		} catch {
			assert.fail('AI-Memory folder not created');
		}

		// Verify database file exists using VS Code API
		try {
			const stat = await vscode.workspace.fs.stat(dbUri);
			assert.ok(stat.type === vscode.FileType.File, `memory.db not created after ${attempts * 100}ms (max ${maxAttempts * 100}ms)`);
		} catch {
			assert.fail(`memory.db not created after ${attempts * 100}ms (max ${maxAttempts * 100}ms)`);
		}
	});

	test('Show Memory should display summary from database', async () => {
		// Create memory bank first if needed
		if (!fs.existsSync(memoryPath)) {
			await vscode.commands.executeCommand('aiSkeleton.memory.create');
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		const service = getMemoryService();
		const summary = await service.showMemory();

		assert.ok(summary.includes('[MEMORY BANK: ACTIVE]'), 'Summary did not include active marker');
	});

	test('Update Memory command should append entries to database', async () => {
		// Create memory bank first
		if (!fs.existsSync(memoryPath)) {
			await vscode.commands.executeCommand('aiSkeleton.memory.create');
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		const testContent = 'Test entry added via E2E test';
		await vscode.commands.executeCommand('aiSkeleton.memory.update', {
			type: 'CONTEXT',
			content: testContent
		});

		await new Promise(resolve => setTimeout(resolve, 1000));

		const service = getMemoryService();
		const summary = await service.showMemory();
		assert.ok(summary.includes(testContent), 'Test entry not found in memory summary');
	});

	test('Memory database should support queries and counts', async () => {
		// Create memory bank first
		if (!fs.existsSync(memoryPath)) {
			await vscode.commands.executeCommand('aiSkeleton.memory.create');
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		const entries = [
			{ type: 'DECISION', content: 'Test decision 1', rationale: 'r1' },
			{ type: 'DECISION', content: 'Test decision 2', rationale: 'r2' },
			{ type: 'PROGRESS', content: 'Test progress entry', status: 'doing' },
		];

		for (const entry of entries) {
			await vscode.commands.executeCommand('aiSkeleton.memory.update', entry);
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		const service = getMemoryService();
		const metrics = await service.getDashboardMetrics();

		assert.ok(metrics.entryCounts.DECISION >= 2, 'Decision entries not counted in DB');
		assert.ok(metrics.entryCounts.PROGRESS >= 1, 'Progress entry not counted in DB');
	});
});
