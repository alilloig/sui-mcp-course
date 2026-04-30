import { vi } from 'vitest';
import * as childProcess from 'node:child_process';
import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';

export interface DeployStubFixture {
  cleanup: () => Promise<void> | void;
}

interface HarnessInstance {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  runPreflightProbe(probeId: string, opts?: Record<string, unknown>): Promise<unknown>;
  withDockerStub(opts: { exitCode: number }): Promise<void>;
  withSuiCliStub(opts: { version: string }): Promise<void>;
  withSandboxRepoAbsent(): Promise<void>;
  withDeployStub(opts: { exitCode: number; exposeManifest: boolean }): Promise<DeployStubFixture>;
  shutdown(): Promise<void>;
}

interface BootOptions {
  projectRoot: string;
}

// Lazy-loaded real spawnSync to use as fallback in mocks.
let _realSpawnSync: typeof childProcess.spawnSync | null = null;

async function getRealSpawnSync(): Promise<typeof childProcess.spawnSync> {
  if (_realSpawnSync) return _realSpawnSync;
  const real = await vi.importActual<typeof childProcess>('node:child_process');
  _realSpawnSync = real.spawnSync;
  return _realSpawnSync;
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

  // Convenience wrapper: delegates to callTool('runPreflightProbe', ...).
  async function runPreflightProbe(
    probeId: string,
    opts?: Record<string, unknown>,
  ): Promise<unknown> {
    return callTool('runPreflightProbe', { probeId, ...opts });
  }

  // Fixture: force the docker probe to return a specific exit code.
  async function withDockerStub(opts: { exitCode: number }): Promise<void> {
    const realSpawn = await getRealSpawnSync();
    vi.spyOn(childProcess, 'spawnSync').mockImplementation(
      (cmd: any, args?: any, options?: any) => {
        if (String(cmd) === 'docker') {
          const encoding = typeof options === 'object' && options?.encoding;
          return {
            pid: 0,
            output: [null, encoding ? '' : Buffer.from(''), encoding ? '' : Buffer.from('')],
            stdout: encoding ? '' : Buffer.from(''),
            stderr:
              opts.exitCode !== 0
                ? encoding
                  ? 'Cannot connect to the Docker daemon'
                  : Buffer.from('Cannot connect to the Docker daemon')
                : encoding
                  ? ''
                  : Buffer.from(''),
            status: opts.exitCode,
            signal: null,
          } as ReturnType<typeof childProcess.spawnSync>;
        }
        return realSpawn(cmd, args, options);
      },
    );
  }

  // Fixture: stub Sui CLI version.
  async function withSuiCliStub(opts: { version: string }): Promise<void> {
    const realSpawn = await getRealSpawnSync();
    vi.spyOn(childProcess, 'spawnSync').mockImplementation(
      (cmd: any, args?: any, options?: any) => {
        if (String(cmd) === 'sui') {
          const encoding = typeof options === 'object' && options?.encoding;
          const stdout = `sui ${opts.version}\n`;
          return {
            pid: 0,
            output: [null, encoding ? stdout : Buffer.from(stdout), encoding ? '' : Buffer.from('')],
            stdout: encoding ? stdout : Buffer.from(stdout),
            stderr: encoding ? '' : Buffer.from(''),
            status: 0,
            signal: null,
          } as ReturnType<typeof childProcess.spawnSync>;
        }
        return realSpawn(cmd, args, options);
      },
    );
  }

  // Fixture: sandbox repo absent (HOME is already set to tempHome in tests).
  async function withSandboxRepoAbsent(): Promise<void> {
    // No-op: tests already point HOME at a tempHome without workspace/deepbook-sandbox.
  }

  // Fixture: sets E2E_DEPLOY_STUB=1 for the duration and returns a cleanup handle.
  // The E2E_DEPLOY_STUB env var is the SOLE entry to the stub branch (A14).
  // withDockerStub, withSuiCliStub, withSandboxRepoAbsent do NOT set E2E_DEPLOY_STUB.
  async function withDeployStub(
    _opts: { exitCode: number; exposeManifest: boolean },
  ): Promise<DeployStubFixture> {
    const prior = process.env.E2E_DEPLOY_STUB;
    process.env.E2E_DEPLOY_STUB = '1';

    return {
      cleanup: () => {
        if (prior === undefined) {
          delete process.env.E2E_DEPLOY_STUB;
        } else {
          process.env.E2E_DEPLOY_STUB = prior;
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
