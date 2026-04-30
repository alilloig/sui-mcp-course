import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runStart } from './tools/start.js';
import { fileURLToPath } from 'node:url';

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

// Only start the stdio MCP server when this file is the process entry point.
// When imported as a library (e.g. by tests via registerTools or by the harness),
// the block below is skipped.
const _thisFile = (() => {
  try {
    return fileURLToPath(import.meta.url);
  } catch (_e: unknown) {
    return '';
  }
})();

const _argv1 = process.argv[1] ?? '';
const _isMain = _argv1 === _thisFile || _argv1.endsWith('/dist/index.js');

if (_isMain) {
  const server = new McpServer({
    name: 'sui-deepbook-course',
    version: '1.0.0',
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
