import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runStart } from './tools/start.js';
import { fileURLToPath } from 'node:url';

// Re-export SDK seams for the in-process harness so it can resolve all
// classes from a single import without needing @modelcontextprotocol/sdk
// installed at the workspace root.
export { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export { Client } from '@modelcontextprotocol/sdk/client/index.js';
export { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

export function registerTools(server: McpServer): void {
  server.tool(
    'start',
    'Start the Sui DeepBook course — returns paths, output style status, and preflight info.',
    {
      projectRoot: z.string().describe('Absolute path to the project root'),
    },
    async ({ projectRoot }) => {
      const result = await runStart({ projectRoot });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );
}

// Only start the stdio transport when this file is executed directly as a script.
const _currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === _currentFile) {
  const server = new McpServer({
    name: 'sui-deepbook-course',
    version: '1.0.0',
  });
  registerTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err: unknown) => {
    process.stderr.write(String(err) + '\n');
    process.exit(1);
  });
}
