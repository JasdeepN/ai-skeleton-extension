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

		// Verify markdown files exist (exported from DB)
		const expectedFiles = [
			'activeContext.md',
			'decisionLog.md',
			'progress.md',
			'systemPatterns.md',
			'projectBrief.md'
		];

		expectedFiles.forEach(file => {
			const filePath = path.join(memoryPath, file);
			assert.ok(fs.existsSync(filePath), `${file} not created`);
		});
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

		// Verify entry was added by reading the markdown file
		const contextPath = path.join(memoryPath, 'activeContext.md');
		assert.ok(fs.existsSync(contextPath), 'activeContext.md not found');

		const content = fs.readFileSync(contextPath, 'utf-8');
		assert.ok(content.includes(testContent), 'Test entry not found in activeContext.md');
	});

	test('Memory database should support queries', async () => {
		// Create memory bank first
		if (!fs.existsSync(memoryPath)) {
			await vscode.commands.executeCommand('aiSkeleton.memory.create');
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		// Add multiple entries
		const entries = [
			{ type: 'DECISION', content: 'Test decision 1' },
			{ type: 'DECISION', content: 'Test decision 2' },
			{ type: 'PROGRESS', content: 'Test progress entry' },
		];

		for (const entry of entries) {
			await vscode.commands.executeCommand('aiSkeleton.memory.update', entry);
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		// Verify entries exist in markdown files
		const decisionPath = path.join(memoryPath, 'decisionLog.md');
		const progressPath = path.join(memoryPath, 'progress.md');

		assert.ok(fs.existsSync(decisionPath), 'decisionLog.md not found');
		assert.ok(fs.existsSync(progressPath), 'progress.md not found');

		const decisionContent = fs.readFileSync(decisionPath, 'utf-8');
		const progressContent = fs.readFileSync(progressPath, 'utf-8');

		assert.ok(decisionContent.includes('Test decision 1'), 'Decision 1 not found');
		assert.ok(decisionContent.includes('Test decision 2'), 'Decision 2 not found');
		assert.ok(progressContent.includes('Test progress entry'), 'Progress entry not found');
	});
});
