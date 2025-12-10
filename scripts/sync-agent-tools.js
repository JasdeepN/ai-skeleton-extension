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
const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json');
const AGENTS_DIR = path.join(__dirname, '../embeds/agents');

/**
 * Extract all registered tool names from memoryTools.ts and map to marketplace IDs
 * Returns object with both raw and qualified names to keep agents resilient to renames
 */
function extractToolNames() {
  const content = fs.readFileSync(MEMORY_TOOLS_PATH, 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

  // Match all vscode.lm.registerTool('toolName', ...) calls
  const registerPattern = /vscode\.lm\.registerTool\('(aiSkeleton_\w+)'/g;
  const rawTools = new Set();
  let match;

  while ((match = registerPattern.exec(content)) !== null) {
    rawTools.add(match[1]);
  }

  // Build mapping from package.json languageModelTools
  const toolMap = {};
  if (packageJson.contributes?.languageModelTools) {
    packageJson.contributes.languageModelTools.forEach(tool => {
      if (tool.name && tool.toolReferenceName) {
        // aiSkeleton_showMemory -> showMemory
        toolMap[tool.name] = tool.toolReferenceName;
      }
    });
  }

  // Generate qualified marketplace IDs alongside raw tool IDs for robustness
  const sortedRawTools = Array.from(rawTools).sort();
  const qualifiedTools = sortedRawTools.map(rawName => {
    const referenceName = toolMap[rawName] || rawName.replace('aiSkeleton_', '');
    return `jasdeepn.ai-skeleton-extension/${referenceName}`;
  });

  // Use ONLY qualified marketplace IDs (single source of truth)
  // Bare names (aiSkeleton_*) are internal implementation details, not for agent tools arrays
  
  return { rawTools: sortedRawTools, qualifiedTools };
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
  
  // Filter out ALL aiSkeleton tools (both old raw format and qualified format)
  const nonAiSkeletonTools = currentTools.filter(t => 
    !t.startsWith('jasdeepn.ai-skeleton-extension/') && 
    !t.startsWith('aiSkeleton_')
  );
  
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
    console.log(`✅ Updated ${path.basename(agentPath)} with ${toolNames.length} extension tools`);
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
  const { rawTools, qualifiedTools } = extractToolNames();
  
  if (qualifiedTools.length === 0) {
    console.error('❌ No aiSkeleton tools found in memoryTools.ts');
    process.exit(1);
  }
  
  console.log(`📋 Found ${rawTools.length} registered tools (internal implementation):`);
  rawTools.forEach(tool => console.log(`   - ${tool}`));
  console.log();

  console.log(`📦 Using ${qualifiedTools.length} qualified marketplace tool IDs in agent files:`);
  qualifiedTools.forEach(tool => console.log(`   - ${tool}`));
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
    if (updateAgentTools(agentPath, qualifiedTools)) {
      updatedCount++;
    }
  });
  
  console.log(`\n✅ Sync complete! Updated ${updatedCount}/${agentFiles.length} agent files`);
  console.log('\n💡 Run "npm run embed-agents" to propagate changes to src/agentStore.ts');
}

main();
