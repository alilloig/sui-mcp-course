import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './index.js';

const server = new McpServer({
  name: 'sui-deepbook-course',
  version: '1.0.0',
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
