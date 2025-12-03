// MCP Configuration Store
// Provides embedded MCP server configurations for AI agent workflows

export interface MCPConfig {
  $schema?: string;
  inputs?: Array<{
    id: string;
    type: string;
    description: string;
    password?: boolean;
  }>;
  servers: Record<string, any>;
}

/**
 * Get the embedded MCP configuration
 */
export function getMCPConfig(): MCPConfig {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "inputs": [
      {
        "id": "context7_api_key",
        "type": "promptString",
        "description": "Context7 API key (optional; increases rate limits). Get one at https://context7.com/dashboard",
        "password": true
      }
    ],
    "servers": {
      "upstash/context7": {
        "type": "http",
        "url": "https://mcp.context7.com/mcp",
        "headers": {
          "CONTEXT7_API_KEY": "${input:context7_api_key}"
        },
        "gallery": "https://api.mcp.github.com/2025-09-15/v0/servers/dcec7705-b81b-4e0f-8615-8032604be7ad",
        "version": "1.0.0"
      },
      "sequential-thinking": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
      },
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}"]
      },
      "fetch": {
        "command": "uvx",
        "args": ["mcp-server-fetch"]
      },
      "git": {
        "command": "uvx",
        "args": ["mcp-server-git"]
      }
    }
  };
}

/**
 * Get MCP config as formatted JSON string for writing to file
 */
export function getMCPConfigString(): string {
  const config = getMCPConfig();
  return JSON.stringify(config, null, '\t');
}

/**
 * Get list of MCP servers with descriptions
 */
export function getMCPServerList(): Array<{ id: string; description: string }> {
  return [
    { id: 'upstash/context7', description: 'Context7 - Up-to-date library documentation' },
    { id: 'sequential-thinking', description: 'Sequential Thinking - Deep reasoning and planning' },
    { id: 'filesystem', description: 'Filesystem - File operations in workspace' },
    { id: 'fetch', description: 'Fetch - HTTP requests and web content' },
    { id: 'git', description: 'Git - Repository operations' }
  ];
}
