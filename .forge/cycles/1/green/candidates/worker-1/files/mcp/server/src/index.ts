import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runStart } from './tools/start.js';

const server = new McpServer({
  name: 'sui-deepbook-course',
  version: '1.0.0',
});

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

const transport = new StdioServerTransport();
await server.connect(transport);
