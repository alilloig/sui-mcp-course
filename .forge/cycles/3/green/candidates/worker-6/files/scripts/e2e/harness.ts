import { vi } from 'vitest';
import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';

interface HarnessInstance {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  runPreflightProbe(probeId: string, opts?: Record<string, unknown>): Promise<unknown>;
  withDockerStub(opts: { exitCode: number }): Promise<void>;
  withSuiCliStub(opts: { version: string }): Promise<void>;
  withSandboxRepoAbsent(): Promise<void>;
  withDeployStub(opts: {
    exitCode: number;
    exposeManifest: boolean;
  }): Promise<{ cleanup: () => Promise<void> | void }>;
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
   * Convenience wrapper: delegates to callTool('runPreflightProbe', ...).
   * Satisfies T-161: typeof harness.runPreflightProbe === 'function',
   * and the wrapper calls callTool('runPreflightProbe', { probeId, ...opts }).
   */
  async function runPreflightProbe(
    probeId: string,
    opts: Record<string, unknown> = {},
  ): Promise<unknown> {
    return callTool('runPreflightProbe', { probeId, ...opts });
  }

  /**
   * Fixture: stub Docker probe to return a given exit code.
   * Spies on child_process.spawnSync so the docker probe (which uses spawnSync
   * internally when no inject seam is provided) sees the stubbed result.
   * Does NOT set E2E_DEPLOY_STUB.
   */
  async function withDockerStub(opts: { exitCode: number }): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cp: any = await import('node:child_process');
    const realSpawnSync = cp.spawnSync as Function;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(cp, 'spawnSync').mockImplementation(function (cmd: string, args: any, spawnOpts: any) {
      if (cmd === 'docker') {
        const useString = spawnOpts?.encoding === 'utf8';
        return {
          status: opts.exitCode,
          stdout: useString ? '' : Buffer.from(''),
          stderr: useString ? '' : Buffer.from(''),
          pid: 0,
          output: [],
          signal: null,
        };
      }
      return realSpawnSync(cmd, args, spawnOpts);
    });
  }

  /**
   * Fixture: stub Sui CLI probe to report a specific version string.
   * Spies on child_process.spawnSync so the sui-cli probe sees the stubbed output.
   * Does NOT set E2E_DEPLOY_STUB.
   */
  async function withSuiCliStub(opts: { version: string }): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cp: any = await import('node:child_process');
    const realSpawnSync = cp.spawnSync as Function;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(cp, 'spawnSync').mockImplementation(function (cmd: string, args: any, spawnOpts: any) {
      if (cmd === 'sui') {
        const useString = spawnOpts?.encoding === 'utf8';
        const out = `sui ${opts.version}\n`;
        return {
          status: 0,
          stdout: useString ? out : Buffer.from(out),
          stderr: useString ? '' : Buffer.from(''),
          pid: 0,
          output: [],
          signal: null,
        };
      }
      return realSpawnSync(cmd, args, spawnOpts);
    });
  }

  /**
   * Fixture: make sandbox repo absent.
   * The calling test sets process.env.HOME = tempHome (without workspace dir).
   * This fixture is a no-op at the harness level.
   * Does NOT set E2E_DEPLOY_STUB.
   */
  async function withSandboxRepoAbsent(): Promise<void> {
    // No-op: the test already sets process.env.HOME = tempHome, which has no workspace.
  }

  /**
   * Fixture: set E2E_DEPLOY_STUB='1' within its lifecycle and restore it on cleanup.
   * Returns a cleanup function that restores the prior value.
   */
  async function withDeployStub(_opts: {
    exitCode: number;
    exposeManifest: boolean;
  }): Promise<{ cleanup: () => Promise<void> | void }> {
    const priorValue = process.env.E2E_DEPLOY_STUB;
    process.env.E2E_DEPLOY_STUB = '1';

    return {
      cleanup: () => {
        if (priorValue === undefined) {
          delete process.env.E2E_DEPLOY_STUB;
        } else {
          process.env.E2E_DEPLOY_STUB = priorValue;
        }
      },
    };
  }

  async function shutdown(): Promise<void> {
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
