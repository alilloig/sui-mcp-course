import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';
import {
  _registerProbeSpawnStub,
  _clearProbeStubs,
} from '../../mcp/server/src/preflight.js';
import type { ProbeId } from '../../mcp/server/src/preflight.js';

interface HarnessInstance {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  runPreflightProbe(probeId: string, opts?: Record<string, unknown>): Promise<unknown>;
  withDockerStub(opts: { exitCode: number }): Promise<void>;
  withSuiCliStub(opts: { version: string }): Promise<void>;
  withSandboxRepoAbsent(): Promise<void>;
  withDeployStub(opts: { exitCode: number; exposeManifest: boolean }): Promise<{ cleanup: () => void }>;
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

  async function runPreflightProbe(probeId: string, opts?: Record<string, unknown>): Promise<unknown> {
    return callTool('runPreflightProbe', { probeId, ...opts });
  }

  /**
   * Stub the docker probe so it reports the given exit code.
   * This fixture does NOT set E2E_DEPLOY_STUB.
   */
  async function withDockerStub(opts: { exitCode: number }): Promise<void> {
    const exitCode = opts.exitCode;
    _registerProbeSpawnStub('docker-running' as ProbeId, () => ({
      status: exitCode,
      stdout: '',
      stderr: exitCode !== 0 ? 'Cannot connect to the Docker daemon' : '',
    }));
  }

  /**
   * Stub the Sui CLI probe so it reports the given version.
   * This fixture does NOT set E2E_DEPLOY_STUB.
   */
  async function withSuiCliStub(opts: { version: string }): Promise<void> {
    const version = opts.version;
    _registerProbeSpawnStub('sui-cli-version' as ProbeId, () => ({
      status: 0,
      stdout: `sui ${version}\n`,
      stderr: '',
    }));
  }

  /**
   * Fixture: pretend the sandbox repo is absent.
   * This fixture does NOT set E2E_DEPLOY_STUB.
   */
  async function withSandboxRepoAbsent(): Promise<void> {
    // No-op: the test already sets HOME to an empty tempHome so the real
    // sandbox repo probe will fail naturally (ENOENT at ~/workspace/deepbook-sandbox).
    // No stub needed and no E2E_DEPLOY_STUB must be set.
  }

  /**
   * Fixture: activate the E2E_DEPLOY_STUB=1 branch within its lifecycle.
   * Returns a cleanup handle to restore the env var.
   *
   * E2E_DEPLOY_STUB is the SOLE entry point to the stub branch per A14.
   */
  async function withDeployStub(_opts: {
    exitCode: number;
    exposeManifest: boolean;
  }): Promise<{ cleanup: () => void }> {
    const prior = process.env.E2E_DEPLOY_STUB;
    process.env.E2E_DEPLOY_STUB = '1';

    function cleanup(): void {
      if (prior === undefined) {
        delete process.env.E2E_DEPLOY_STUB;
      } else {
        process.env.E2E_DEPLOY_STUB = prior;
      }
    }

    return { cleanup };
  }

  async function shutdown(): Promise<void> {
    // Clean up any registered stubs on shutdown.
    _clearProbeStubs();
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
