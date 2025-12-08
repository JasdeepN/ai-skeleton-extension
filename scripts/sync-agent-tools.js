#!/usr/bin/env node

/**
 * sync-agent-tools.js
 * 
 * Automatically syncs aiSkeleton tool names from src/memoryTools.ts
 * to all agent configuration files in embeds/agents/*.md
 * 
 * Run after adding new memory tools to ensure agents have access.
 * 
 * Usage: node scripts/sync-agent-tools.js
 */

const fs = require('fs');
const path = require('path');

const MEMORY_TOOLS_PATH = path.join(__dirname, '../src/memoryTools.ts');
const AGENTS_DIR = path.join(__dirname, '../embeds/agents');

/**
 * Extract all registered tool names from memoryTools.ts
 */
function extractToolNames() {
  const content = fs.readFileSync(MEMORY_TOOLS_PATH, 'utf8');
  
  // Match all vscode.lm.registerTool('toolName', ...) calls
  const registerPattern = /vscode\.lm\.registerTool\('(aiSkeleton_\w+)'/g;
  const tools = [];
  let match;
  
  while ((match = registerPattern.exec(content)) !== null) {
    tools.push(match[1]);
  }
  
  return tools.sort(); // Alphabetical order
}

/**
 * Update tools array in agent markdown frontmatter
 */
function updateAgentTools(agentPath, toolNames) {
  let content = fs.readFileSync(agentPath, 'utf8');
  
  // Find the tools array in YAML frontmatter
  const toolsPattern = /^tools:\s*\[(.*?)\]$/m;
  const match = content.match(toolsPattern);
  
  if (!match) {
    console.warn(`⚠️  No tools array found in ${path.basename(agentPath)}`);
    return false;
  }
  
  const currentToolsLine = match[0];
  const currentTools = match[1].split(',').map(t => t.trim().replace(/^'|'$/g, ''));
  
  // Filter out old aiSkeleton tools
  const nonAiSkeletonTools = currentTools.filter(t => !t.startsWith('aiSkeleton_'));
  
  // Find where to insert aiSkeleton tools (after 'new' tool, before 'extensions')
  const newIndex = nonAiSkeletonTools.findIndex(t => t === 'new');
  const extensionsIndex = nonAiSkeletonTools.findIndex(t => t === 'extensions');
  
  let insertIndex = extensionsIndex !== -1 ? extensionsIndex : nonAiSkeletonTools.length;
  if (newIndex !== -1 && newIndex < insertIndex) {
    insertIndex = newIndex + 1;
  }
  
  // Insert aiSkeleton tools at the correct position
  const updatedTools = [
    ...nonAiSkeletonTools.slice(0, insertIndex),
    ...toolNames,
    ...nonAiSkeletonTools.slice(insertIndex)
  ];
  
  // Format as YAML array (single line)
  const formattedTools = updatedTools.map(t => `'${t}'`).join(', ');
  const newToolsLine = `tools: [${formattedTools}]`;
  
  // Replace in content
  const updatedContent = content.replace(currentToolsLine, newToolsLine);
  
  if (updatedContent !== content) {
    fs.writeFileSync(agentPath, updatedContent, 'utf8');
    console.log(`✅ Updated ${path.basename(agentPath)} with ${toolNames.length} aiSkeleton tools`);
    return true;
  }
  
  console.log(`ℹ️  ${path.basename(agentPath)} already up to date`);
  return false;
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Syncing aiSkeleton tool names to agent configurations...\n');
  
  // Extract tool names from memoryTools.ts
  const toolNames = extractToolNames();
  
  if (toolNames.length === 0) {
    console.error('❌ No aiSkeleton tools found in memoryTools.ts');
    process.exit(1);
  }
  
  console.log(`📋 Found ${toolNames.length} registered tools:`);
  toolNames.forEach(tool => console.log(`   - ${tool}`));
  console.log();
  
  // Update all agent files
  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.agent.md'))
    .map(f => path.join(AGENTS_DIR, f));
  
  if (agentFiles.length === 0) {
    console.error('❌ No agent files found in embeds/agents/');
    process.exit(1);
  }
  
  let updatedCount = 0;
  agentFiles.forEach(agentPath => {
    if (updateAgentTools(agentPath, toolNames)) {
      updatedCount++;
    }
  });
  
  console.log(`\n✅ Sync complete! Updated ${updatedCount}/${agentFiles.length} agent files`);
  console.log('\n💡 Run "npm run embed-agents" to propagate changes to src/agentStore.ts');
}

main();
