import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';
import type { SpawnFn, ProbeId } from '../../mcp/server/src/preflight.js';
import { runProbe } from '../../mcp/server/src/preflight.js';
import { setVerifyOverride } from '../../mcp/server/src/verify.js';

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
  withVerifyStub(opts: { pass: boolean; output?: string }): Promise<void>;
  selectPath(args: Record<string, unknown>): Promise<unknown>;
  setPersonalization(args: Record<string, unknown>): Promise<unknown>;
  nextSpot(args: Record<string, unknown>): Promise<unknown>;
  verifySpot(args: Record<string, unknown>): Promise<unknown>;
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

  // Track all cleanup functions for shutdown.
  const overrideCleanups: Array<() => void> = [];

  // Harness-internal map: probe id → SpawnFn stub.
  // withDockerStub / withSuiCliStub populate this. callTool intercepts
  // runPreflightProbe calls and routes through runProbe with the stub injected
  // via ProbeOptions.spawn — no module-level setSpawnOverride in preflight.ts
  // (M005 carry-forward).
  const probeSpawnStubs = new Map<string, SpawnFn>();

  // Build the harness object with methods that can be replaced by spies.
  // runPreflightProbe and tool wrappers reference `harness.callTool` so that
  // when vi.spyOn(harness, 'callTool') replaces the method, the spy fires.
  const harness: HarnessInstance = {
    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
      // For runPreflightProbe calls: if there's a harness-side spawn stub for
      // the probe id, invoke runProbe directly with the stub so no global
      // state is mutated. This is the per-call ProbeOptions.spawn injection
      // pattern (A13).
      if (toolName === 'runPreflightProbe' && typeof args['probeId'] === 'string') {
        const probeId = args['probeId'] as ProbeId;
        const stubSpawn = probeSpawnStubs.get(probeId);
        if (stubSpawn !== undefined) {
          const remediate =
            typeof args['remediate'] === 'boolean' ? args['remediate'] : false;
          const probeResult = await runProbe(probeId, {
            spawn: stubSpawn,
            remediate,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(probeResult),
              },
            ],
          };
        }
      }
      // Delegate all other calls to the MCP client.
      return client.callTool({ name: toolName, arguments: args });
    },

    /**
     * Convenience wrapper: runs the runPreflightProbe tool via callTool.
     * Delegates to harness.callTool so that test spies on callTool are observed.
     */
    async runPreflightProbe(
      probeId: string,
      opts?: Record<string, unknown>,
    ): Promise<unknown> {
      return harness.callTool('runPreflightProbe', { probeId, ...opts });
    },

    /**
     * Fixture: installs a stub spawn function for the docker probe.
     * Stub is stored in harness-internal map; passed via ProbeOptions.spawn.
     */
    async withDockerStub(opts: { exitCode: number }): Promise<void> {
      const stubSpawn: SpawnFn = () => ({
        status: opts.exitCode,
        stdout: '',
        stderr: opts.exitCode !== 0 ? 'Cannot connect to the Docker daemon' : '',
      });
      probeSpawnStubs.set('docker-running', stubSpawn);
    },

    /**
     * Fixture: installs a stub spawn function for the sui-cli probe.
     */
    async withSuiCliStub(opts: { version: string }): Promise<void> {
      const stubSpawn: SpawnFn = () => ({
        status: 0,
        stdout: `sui ${opts.version}\n`,
        stderr: '',
      });
      probeSpawnStubs.set('sui-cli-version', stubSpawn);
    },

    /**
     * Fixture: simulate sandbox repo being absent.
     * The probe reads process.env.HOME / os.homedir() directly; the test
     * already sets HOME = tempHome which has no sandbox checkout.
     */
    async withSandboxRepoAbsent(): Promise<void> {
      // No-op: the test controls HOME via beforeEach.
    },

    /**
     * Fixture: sets E2E_DEPLOY_STUB=1 for the deploy-stub scenario.
     * Returns a cleanup function that restores the prior env state.
     */
    async withDeployStub(_opts: {
      exitCode: number;
      exposeManifest: boolean;
    }): Promise<{ cleanup: () => Promise<void> | void }> {
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
    },

    /**
     * Fixture: stubs verifySpot so it returns the given result without spawning
     * a subprocess. Used by E-001 / E-014 tests (T-286).
     * Calls setVerifyOverride from verify.ts (the module-level test seam for
     * the compile adapter, parallel to the preflight pattern pre-M005).
     */
    async withVerifyStub(opts: { pass: boolean; output?: string }): Promise<void> {
      const cleanup = setVerifyOverride(async (_adapter, _projectRoot) => ({
        pass: opts.pass,
        output: opts.output,
      }));
      overrideCleanups.push(cleanup);
    },

    /**
     * Fixture wrapper: selectPath delegates to callTool.
     */
    async selectPath(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('selectPath', args);
    },

    /**
     * Fixture wrapper: setPersonalization delegates to callTool.
     */
    async setPersonalization(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('setPersonalization', args);
    },

    /**
     * Fixture wrapper: nextSpot delegates to callTool.
     */
    async nextSpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('nextSpot', args);
    },

    /**
     * Fixture wrapper: verifySpot delegates to callTool.
     */
    async verifySpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('verifySpot', args);
    },

    async shutdown(): Promise<void> {
      // Remove all installed overrides.
      for (const cleanup of overrideCleanups) {
        cleanup();
      }
      overrideCleanups.length = 0;
      probeSpawnStubs.clear();
      await client.close();
      await server.close();
    },
  };

  return harness;
}

export default bootHarness;
