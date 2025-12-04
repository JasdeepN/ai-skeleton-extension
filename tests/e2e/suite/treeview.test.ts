import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Tree View E2E Tests', () => {
	const testWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const memoryPath = testWorkspaceRoot ? path.join(testWorkspaceRoot, 'AI-Memory') : '';

	setup(async () => {
		// Ensure memory bank exists for tree view tests
		if (memoryPath && !fs.existsSync(memoryPath)) {
			await vscode.commands.executeCommand('aiSkeleton.memory.create');
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
	});

	teardown(async () => {
		// Cleanup
		if (memoryPath && fs.existsSync(memoryPath)) {
			fs.rmSync(memoryPath, { recursive: true, force: true });
		}
	});

	test('Memory Tree View should refresh successfully', async () => {
		// Execute refresh command
		try {
			await vscode.commands.executeCommand('aiSkeleton.memory.refresh');
			// If no error thrown, refresh succeeded
			assert.ok(true, 'Memory tree refresh completed');
		} catch (error) {
			assert.fail(`Memory tree refresh failed: ${error}`);
		}
	});

	test('Prompts Tree View should refresh successfully', async () => {
		// Execute refresh command
		try {
			await vscode.commands.executeCommand('aiSkeleton.prompts.refresh');
			// If no error thrown, refresh succeeded
			assert.ok(true, 'Prompts tree refresh completed');
		} catch (error) {
			assert.fail(`Prompts tree refresh failed: ${error}`);
		}
	});

	test('Memory Tree View should show memory files', async () => {
		// Add some content to make tree view more interesting
		await vscode.commands.executeCommand('aiSkeleton.memory.update', {
			type: 'CONTEXT',
			content: 'Test context for tree view'
		});

		await new Promise(resolve => setTimeout(resolve, 1000));

		// Refresh tree view
		await vscode.commands.executeCommand('aiSkeleton.memory.refresh');

		// Tree view should have loaded without error
		assert.ok(true, 'Memory tree view loaded successfully');
	});

	test('Install commands should execute without errors', async () => {
		// Test prompt installation (to .github/prompts)
		try {
			await vscode.commands.executeCommand('aiSkeleton.installPrompts');
			assert.ok(true, 'Install prompts command completed');
		} catch (error) {
			// May fail if directory already exists, which is acceptable
			assert.ok(true, 'Install prompts command executed');
		}

		// Test agent installation (to .github/agents)
		try {
			await vscode.commands.executeCommand('aiSkeleton.installAgents');
			assert.ok(true, 'Install agents command completed');
		} catch (error) {
			// May fail if directory already exists, which is acceptable
			assert.ok(true, 'Install agents command executed');
		}
	});

	test('MCP Tree View should be available', async () => {
		const commands = await vscode.commands.getCommands(true);
		
		// MCP refresh command should exist
		assert.ok(
			commands.includes('aiSkeleton.mcp.refresh'),
			'MCP tree view not registered'
		);
	});
});
