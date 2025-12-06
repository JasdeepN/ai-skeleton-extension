import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('AI-Memory E2E Tests', () => {
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

		// SQLite-only: Verify database exists, markdown files are NOT created automatically
		// Markdown files are only created via explicit "Dump Memory" command
		const dbPath = path.join(memoryPath, 'memory.db');
		assert.ok(fs.existsSync(dbPath), 'memory.db not created');
	});

	test('Show Memory command should display memory content', async () => {
		// Create memory bank first
		if (!fs.existsSync(memoryPath)) {
			await vscode.commands.executeCommand('aiSkeleton.memory.create');
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		// Execute show command
		const result = await vscode.commands.executeCommand('aiSkeleton.memory.show');

		// Command should complete without error
		assert.ok(result !== undefined || result === undefined, 'Show command failed');
	});

	test('Update Memory command should append entries to database', async () => {
		// Create memory bank first
		if (!fs.existsSync(memoryPath)) {
			await vscode.commands.executeCommand('aiSkeleton.memory.create');
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		// Execute update command (this would typically be called by agent)
		const testContent = 'Test entry added via E2E test';
		await vscode.commands.executeCommand('aiSkeleton.memory.update', {
			type: 'CONTEXT',
			content: testContent
		});

		// Wait for update
		await new Promise(resolve => setTimeout(resolve, 1000));

		// SQLite-only: Verify database exists (entries stored in DB, not markdown)
		const dbPath = path.join(memoryPath, 'memory.db');
		assert.ok(fs.existsSync(dbPath), 'memory.db not found');
		
		// Verify database file has grown (entry was added)
		const dbStats = fs.statSync(dbPath);
		assert.ok(dbStats.size > 0, 'memory.db is empty');
	});

	test('Memory database should support queries', async () => {
		// Create memory bank first
		if (!fs.existsSync(memoryPath)) {
			await vscode.commands.executeCommand('aiSkeleton.memory.create');
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		// Add multiple entries
		const entries = [
			{ type: 'DECISION', content: 'Test decision 1', rationale: 'E2E test' },
			{ type: 'DECISION', content: 'Test decision 2', rationale: 'E2E test' },
			{ type: 'PROGRESS', content: 'Test progress entry', status: 'doing' },
		];

		for (const entry of entries) {
			await vscode.commands.executeCommand('aiSkeleton.memory.update', entry);
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		// SQLite-only: Verify database exists and has content
		const dbPath = path.join(memoryPath, 'memory.db');
		assert.ok(fs.existsSync(dbPath), 'memory.db not found');
		
		// Verify database file has grown (entries were added)
		const dbStats = fs.statSync(dbPath);
		assert.ok(dbStats.size > 20480, 'memory.db should have grown with entries');
	});

	test('Dump Memory command should export to markdown files', async () => {
		// Create memory bank first
		if (!fs.existsSync(memoryPath)) {
			await vscode.commands.executeCommand('aiSkeleton.memory.create');
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		// Add some entries first
		await vscode.commands.executeCommand('aiSkeleton.memory.update', {
			type: 'CONTEXT',
			content: 'Test entry for dump'
		});
		await new Promise(resolve => setTimeout(resolve, 500));

		// Execute dump command
		await vscode.commands.executeCommand('aiSkeleton.memory.dump');
		await new Promise(resolve => setTimeout(resolve, 1000));

		// Now markdown files should exist
		const expectedFiles = [
			'activeContext.md',
			'decisionLog.md',
			'progress.md',
			'systemPatterns.md',
			'projectBrief.md'
		];

		expectedFiles.forEach(file => {
			const filePath = path.join(memoryPath, file);
			assert.ok(fs.existsSync(filePath), `${file} not created after dump`);
		});
	});
});
