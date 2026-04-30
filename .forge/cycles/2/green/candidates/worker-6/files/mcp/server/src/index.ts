import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runStart } from './tools/start.js';

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

// Bin bootstrap — runs only when executed directly (not when imported).
// We check a well-known environment variable that vitest sets, or fall back
// to comparing argv[1] against this file. Either way, skipped during tests.
const runningUnderVitest =
  process.env['VITEST'] === 'true' || process.env['VITEST_WORKER_ID'] !== undefined;

if (!runningUnderVitest) {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const server = new McpServer({
    name: 'sui-deepbook-course',
    version: '1.0.0',
  });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
