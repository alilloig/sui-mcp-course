import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';
import {
  setProbeSpawnStub,
  clearProbeSpawnStub,
  clearAllProbeSpawnStubs,
} from '../../mcp/server/src/probes/stubStore.js';

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
   * Convenience wrapper: delegates to callTool('runPreflightProbe', ...)
   */
  async function runPreflightProbe(
    probeId: string,
    opts?: Record<string, unknown>,
  ): Promise<unknown> {
    return callTool('runPreflightProbe', { probeId, ...opts });
  }

  /**
   * Fixture: simulates a Docker daemon with the given exit code.
   * Uses the probe stub store — does NOT set E2E_DEPLOY_STUB.
   */
  async function withDockerStub(opts: { exitCode: number }): Promise<void> {
    const exitCode = opts.exitCode;
    setProbeSpawnStub('docker-running', (_cmd: string, _args: string[]) => {
      if (exitCode !== 0) {
        return { status: exitCode, stdout: '', stderr: 'Cannot connect to Docker daemon' };
      }
      return { status: 0, stdout: 'Docker is running', stderr: '' };
    });
  }

  /**
   * Fixture: simulates a specific Sui CLI version.
   * Uses the probe stub store — does NOT set E2E_DEPLOY_STUB.
   */
  async function withSuiCliStub(opts: { version: string }): Promise<void> {
    const version = opts.version;
    setProbeSpawnStub('sui-cli-version', (_cmd: string, _args: string[]) => {
      return { status: 0, stdout: `sui ${version}\n`, stderr: '' };
    });
  }

  /**
   * Fixture: simulates sandbox repo absent (via stub store).
   * Does NOT set E2E_DEPLOY_STUB.
   * Note: the sandbox-repo-present probe reads the filesystem directly.
   * This fixture clears any docker/suiCli stubs but cannot intercept stat().
   * Tests relying on this should control HOME via process.env.HOME in beforeEach.
   */
  async function withSandboxRepoAbsent(): Promise<void> {
    // The sandboxRepo probe uses fsPromises.stat; it reads HOME-relative path.
    // Callers control this by setting process.env.HOME to an empty temp dir
    // in their test's beforeEach (the harness test scaffolding already does this).
    // This fixture is a no-op stub as the HOME-based approach is sufficient.
  }

  /**
   * Fixture: sets E2E_DEPLOY_STUB=1 for the duration of the fixture lifecycle.
   * Returns a cleanup function that restores the prior env value.
   * This is the SOLE mechanism to enter the stub branch.
   */
  async function withDeployStub(_opts: {
    exitCode: number;
    exposeManifest: boolean;
  }): Promise<{ cleanup: () => Promise<void> }> {
    const prior = process.env.E2E_DEPLOY_STUB;
    process.env.E2E_DEPLOY_STUB = '1';

    return {
      cleanup: async () => {
        if (prior === undefined) {
          delete process.env.E2E_DEPLOY_STUB;
        } else {
          process.env.E2E_DEPLOY_STUB = prior;
        }
      },
    };
  }

  async function shutdown(): Promise<void> {
    clearAllProbeSpawnStubs();
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
