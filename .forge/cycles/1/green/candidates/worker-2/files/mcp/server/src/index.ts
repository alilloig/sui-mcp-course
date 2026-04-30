import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runStart } from './tools/start.js';

const server = new McpServer({
  name: 'sui-deepbook-course',
  version: '0.1.0',
});

server.tool(
  'start',
  {
    projectRoot: z.string().describe('Absolute path to the project root'),
  },
  async (args) => {
    const result = await runStart({ projectRoot: args.projectRoot });
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
