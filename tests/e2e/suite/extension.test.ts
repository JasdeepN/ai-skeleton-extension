import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('AI Skeleton Extension E2E Tests', () => {
	vscode.window.showInformationMessage('Start E2E tests.');

	test('Extension should be present', () => {
		const extension = vscode.extensions.getExtension('JasdeepN.ai-skeleton-extension');
		assert.ok(extension, 'Extension not found');
	});

	test('Extension should activate', async () => {
		const extension = vscode.extensions.getExtension('JasdeepN.ai-skeleton-extension');
		assert.ok(extension);
		
		await extension.activate();
		assert.strictEqual(extension.isActive, true, 'Extension did not activate');
	});

	test('AI-Memory commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		
		const expectedCommands = [
			'aiSkeleton.memory.create',
			'aiSkeleton.memory.show',
			'aiSkeleton.memory.update',
			'aiSkeleton.memory.refresh',
		];

		expectedCommands.forEach(cmd => {
			assert.ok(
				commands.includes(cmd),
				`Command ${cmd} not registered`
			);
		});
	});

	test('Prompt commands should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		
		const expectedCommands = [
			'aiSkeleton.installPrompts',
			'aiSkeleton.installAgents',
			'aiSkeleton.installProtectedFiles',
			'aiSkeleton.installAll',
		];

		expectedCommands.forEach(cmd => {
			assert.ok(
				commands.includes(cmd),
				`Command ${cmd} not registered`
			);
		});
	});

	test('Tree views should be available', async () => {
		// Wait a bit for tree views to initialize
		await new Promise(resolve => setTimeout(resolve, 1000));

		const commands = await vscode.commands.getCommands(true);
		
		// Tree view refresh commands should exist
		assert.ok(
			commands.includes('aiSkeleton.memory.refresh'),
			'Memory tree view not registered'
		);
		assert.ok(
			commands.includes('aiSkeleton.prompts.refresh'),
			'Prompts tree view not registered'
		);
	});
});
