import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { fileURLToPath } from 'node:url';
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

// Only start the stdio server when this file is run directly as the main
// entry point, not when it is imported as a module (e.g. by the harness).
function isMainModule(): boolean {
  try {
    const scriptPath = process.argv[1];
    if (!scriptPath) return false;
    const selfPath = fileURLToPath(import.meta.url);
    return selfPath === scriptPath || selfPath.replace(/\.ts$/, '.js') === scriptPath;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const server = new McpServer({
    name: 'sui-deepbook-course',
    version: '1.0.0',
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
