import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';

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

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} },
  );

  await server.connect(serverTransport);
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
