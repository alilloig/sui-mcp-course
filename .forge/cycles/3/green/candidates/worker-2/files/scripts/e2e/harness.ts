import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';
import { setDockerStub, setSuiCliStub, clearAllStubs } from '../../mcp/server/src/probes/stubs.js';

interface HarnessInstance {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  runPreflightProbe(probeId: string, opts?: Record<string, unknown>): Promise<unknown>;
  withDockerStub(opts: { exitCode: number }): Promise<void>;
  withSuiCliStub(opts: { version: string }): Promise<void>;
  withSandboxRepoAbsent(): Promise<void>;
  withDeployStub(opts: { exitCode: number; exposeManifest: boolean }): Promise<{
    cleanup: () => Promise<void>;
  }>;
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

  /**
   * Convenience wrapper: calls runPreflightProbe tool via callTool.
   */
  async function runPreflightProbe(
    probeId: string,
    opts?: Record<string, unknown>,
  ): Promise<unknown> {
    return callTool('runPreflightProbe', { probeId, ...opts });
  }

  /**
   * Fixture: injects a docker stub so the docker-running probe returns the given exit code.
   * Does NOT set E2E_DEPLOY_STUB.
   */
  async function withDockerStub(opts: { exitCode: number }): Promise<void> {
    setDockerStub({ exitCode: opts.exitCode });
  }

  /**
   * Fixture: injects a Sui CLI version stub.
   * Does NOT set E2E_DEPLOY_STUB.
   */
  async function withSuiCliStub(opts: { version: string }): Promise<void> {
    setSuiCliStub({ version: opts.version });
  }

  /**
   * Fixture: simulates absent sandbox repo (relies on tempHome not having the dir).
   * Does NOT set E2E_DEPLOY_STUB.
   */
  async function withSandboxRepoAbsent(): Promise<void> {
    // The test controls HOME env var to point at an empty temp dir.
    // No module state change needed — probe reads from HOME at call time.
  }

  /**
   * Fixture: sets E2E_DEPLOY_STUB=1 and returns a cleanup function to restore it.
   * This is the SOLE entry point that sets E2E_DEPLOY_STUB.
   */
  async function withDeployStub(_opts: {
    exitCode: number;
    exposeManifest: boolean;
  }): Promise<{ cleanup: () => Promise<void> }> {
    const prior = process.env['E2E_DEPLOY_STUB'];
    process.env['E2E_DEPLOY_STUB'] = '1';

    const cleanup = async (): Promise<void> => {
      if (prior === undefined) {
        delete process.env['E2E_DEPLOY_STUB'];
      } else {
        process.env['E2E_DEPLOY_STUB'] = prior;
      }
    };

    return { cleanup };
  }

  async function shutdown(): Promise<void> {
    clearAllStubs();
    await client.close();
    await server.close();
  }

  return {
    callTool,
    runPreflightProbe,
    withDockerStub,
    withSuiCliStub,
    withSandboxRepoAbsent,
    withDeployStub,
    shutdown,
  };
}

export default bootHarness;
