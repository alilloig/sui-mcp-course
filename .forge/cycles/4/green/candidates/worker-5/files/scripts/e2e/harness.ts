import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';
import type { SpawnFn, ProbeId, ProbeOptions } from '../../mcp/server/src/preflight.js';
import { runProbe as _runProbe } from '../../mcp/server/src/preflight.js';
import { _setVerifyStub } from '../../mcp/server/src/verify.js';

// Harness-internal map for per-probe spawn stubs — keyed on probe id.
// Replaces the removed module-level setSpawnOverride seam (A13 carry-forward).
const internalProbeSpawnMap = new Map<string, SpawnFn>();

// Track cleanup functions for verify stubs.
const stubCleanups: Array<() => void> = [];

interface HarnessInstance {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  runPreflightProbe(probeId: string, opts?: Record<string, unknown>): Promise<unknown>;
  selectPath(args: Record<string, unknown>): Promise<unknown>;
  setPersonalization(args: Record<string, unknown>): Promise<unknown>;
  nextSpot(args: Record<string, unknown>): Promise<unknown>;
  verifySpot(args: Record<string, unknown>): Promise<unknown>;
  withDockerStub(opts: { exitCode: number }): Promise<void>;
  withSuiCliStub(opts: { version: string }): Promise<void>;
  withSandboxRepoAbsent(): Promise<void>;
  withDeployStub(opts: {
    exitCode: number;
    exposeManifest: boolean;
  }): Promise<{ cleanup: () => Promise<void> | void }>;
  withVerifyStub(opts: { pass: boolean; output?: string }): Promise<void>;
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

  const harness: HarnessInstance = {
    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
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

    async selectPath(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('selectPath', args);
    },

    async setPersonalization(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('setPersonalization', args);
    },

    async nextSpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('nextSpot', args);
    },

    async verifySpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('verifySpot', args);
    },

    /**
     * Fixture: installs a stub spawn function on the docker probe so that
     * probeDockerRunning returns the given exit code deterministically.
     * Uses harness-internal map passed through ProbeOptions.spawn (A13).
     */
    async withDockerStub(opts: { exitCode: number }): Promise<void> {
      const stubSpawn: SpawnFn = () => ({
        status: opts.exitCode,
        stdout: '',
        stderr: opts.exitCode !== 0 ? 'Cannot connect to the Docker daemon' : '',
      });
      internalProbeSpawnMap.set('docker-running', stubSpawn);
    },

    /**
     * Fixture: installs a stub spawn function on the sui-cli probe so that
     * probeSuiCliVersion returns the given version string deterministically.
     * Uses harness-internal map passed through ProbeOptions.spawn (A13).
     */
    async withSuiCliStub(opts: { version: string }): Promise<void> {
      const stubSpawn: SpawnFn = () => ({
        status: 0,
        stdout: `sui ${opts.version}\n`,
        stderr: '',
      });
      internalProbeSpawnMap.set('sui-cli-version', stubSpawn);
    },

    /**
     * Fixture: simulate sandbox repo being absent.
     * No actual state change needed — the probe reads HOME directly.
     */
    async withSandboxRepoAbsent(): Promise<void> {
      // No-op — test already sets HOME = tempHome with no sandbox.
    },

    /**
     * Fixture: sets E2E_DEPLOY_STUB=1 for the deploy-stub scenario.
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
     * Fixture: stubs runVerification to return the given result without
     * spawning a subprocess. Used by E-001 / E-014 harness integration tests.
     */
    async withVerifyStub(opts: { pass: boolean; output?: string }): Promise<void> {
      const cleanup = _setVerifyStub({ pass: opts.pass, output: opts.output });
      stubCleanups.push(cleanup);
    },

    async shutdown(): Promise<void> {
      // Remove all probe spawn stubs.
      internalProbeSpawnMap.clear();
      // Remove all verify stubs.
      for (const cleanup of stubCleanups) {
        cleanup();
      }
      stubCleanups.length = 0;
      await client.close();
      await server.close();
    },
  };

  // Patch the preflight module's runProbe at the server level so that
  // internalProbeSpawnMap stubs are injected via ProbeOptions.spawn.
  // We do this by wrapping the runPreflightProbe tool handler's runProbe call.
  // Since the MCP server already registered the tool, we need to intercept
  // at the probe execution level. We achieve this by patching the runProbe
  // import used by runPreflightProbe.ts at module load time.
  //
  // The cleanest approach: monkey-patch the preflight module's runProbe export.
  // In Node.js ESM with vitest, modules are cached and their exports are mutable
  // through the module namespace object in test environments.
  const preflightModule = await import('../../mcp/server/src/preflight.js');
  const _origRunProbe = preflightModule.runProbe;

  (preflightModule as Record<string, unknown>)['runProbe'] = async (
    probeId: ProbeId,
    opts: ProbeOptions,
  ) => {
    const stubSpawn = internalProbeSpawnMap.get(probeId as string);
    const effectiveOpts: ProbeOptions = stubSpawn
      ? { ...opts, spawn: opts.spawn ?? stubSpawn }
      : opts;
    return _origRunProbe(probeId, effectiveOpts);
  };

  // Register cleanup of the runProbe patch in shutdown.
  const _origShutdown = harness.shutdown.bind(harness);
  (harness as { shutdown: () => Promise<void> }).shutdown = async () => {
    // Restore original runProbe.
    (preflightModule as Record<string, unknown>)['runProbe'] = _origRunProbe;
    await _origShutdown();
  };

  return harness;
}

export default bootHarness;
