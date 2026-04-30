/**
 * In-process test harness factory.
 *
 * This module is intentionally separate from index.ts so that the bin
 * entrypoint (bin.ts) can stay minimal and harness.ts (in scripts/e2e) can
 * import this without directly depending on the SDK. The SDK lives in
 * mcp/server/node_modules and is only resolvable from within that package.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools } from './index.js';

export interface InMemoryHarness {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  shutdown(): Promise<void>;
}

export async function createInMemoryHarness(): Promise<InMemoryHarness> {
  const server = new McpServer({
    name: 'sui-deepbook-course-test',
    version: '1.0.0',
  });

  registerTools(server);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: 'sui-deepbook-course-test-client', version: '1.0.0' },
    { capabilities: {} },
  );

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return client.callTool({ name, arguments: args });
  }

  async function shutdown(): Promise<void> {
    await client.close();
    await server.close();
  }

  return { callTool, shutdown };
}
