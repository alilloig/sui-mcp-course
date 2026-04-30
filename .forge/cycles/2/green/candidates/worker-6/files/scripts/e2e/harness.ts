import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools } from '../../mcp/server/src/index.js';

interface HarnessInstance {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  shutdown(): Promise<void>;
}

interface BootOptions {
  projectRoot: string;
}

export async function bootHarness(_options: BootOptions): Promise<HarnessInstance> {
  const server = new McpServer({
    name: 'sui-deepbook-course-test',
    version: '1.0.0',
  });

  registerTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });

  // Connect server to server-side transport
  await server.connect(serverTransport);

  // Connect client to client-side transport
  await client.connect(clientTransport);

  async function callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return client.callTool({ name: toolName, arguments: args });
  }

  async function shutdown(): Promise<void> {
    await client.close();
    await server.close();
  }

  return { callTool, shutdown };
}

export default bootHarness;
