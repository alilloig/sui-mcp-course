import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';
import type { SpawnFn, ProbeId } from '../../mcp/server/src/preflight.js';
import { runProbe } from '../../mcp/server/src/preflight.js';
import { setVerifyStub } from '../../mcp/server/src/verify.js';

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

  // Harness-internal map for probe spawn stubs (per-call injection).
  // A13 carry-forward: no module-level setSpawnOverride in preflight.ts;
  // stubs are stored here and passed through ProbeOptions.spawn at the call site.
  const probeSpawnStubs = new Map<ProbeId, SpawnFn>();

  // Track verify stub cleanup functions
  const verifyStubCleanups: Array<() => void> = [];

  // Build the harness object with methods that can be replaced by spies.
  // runPreflightProbe references `harness.callTool` (through the object)
  // so that when vi.spyOn(harness, 'callTool') replaces the method,
  // runPreflightProbe will call the spy rather than the original closure.
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

    /**
     * Fixture: installs a stub spawn function on the docker probe so that
     * probeDockerRunning returns the given exit code deterministically.
     * Per-call injection: the stub is stored in the harness-internal map and
     * passed through ProbeOptions.spawn to runProbe (no global mutation).
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
     * Fixture: installs a stub spawn function on the sui-cli probe so that
     * probeSuiCliVersion returns the given version string deterministically.
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
     * Fixture: simulate sandbox repo being absent by overriding HOME to an
     * empty temp directory (relies on the test already having set HOME to tempHome
     * which has no workspace/deepbook-sandbox).
     * No actual state change needed — the probe reads HOME directly.
     */
    async withSandboxRepoAbsent(): Promise<void> {
      // The probe reads process.env.HOME / os.homedir() directly. The test
      // already sets HOME = tempHome which has no sandbox checkout, so this
      // fixture is effectively a no-op — but it exists for API completeness
      // and to confirm E2E_DEPLOY_STUB is NOT set.
    },

    /**
     * Fixture: sets E2E_DEPLOY_STUB=1 for the deploy-stub scenario.
     * Returns a cleanup function that restores the prior env state.
     *
     * This is the SOLE place in the harness that sets E2E_DEPLOY_STUB.
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
     * Fixture: install a verify stub so that verifySpot calls do not spawn
     * real subprocesses. The stub result is returned instead of spawning.
     * Uses setVerifyStub seam in verify.ts.
     */
    async withVerifyStub(opts: { pass: boolean; output?: string }): Promise<void> {
      const cleanup = setVerifyStub({ pass: opts.pass, output: opts.output });
      verifyStubCleanups.push(cleanup);
    },

    /**
     * Fixture wrapper: calls selectPath tool via callTool.
     */
    async selectPath(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('selectPath', args);
    },

    /**
     * Fixture wrapper: calls setPersonalization tool via callTool.
     */
    async setPersonalization(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('setPersonalization', args);
    },

    /**
     * Fixture wrapper: calls nextSpot tool via callTool.
     */
    async nextSpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('nextSpot', args);
    },

    /**
     * Fixture wrapper: calls verifySpot tool via callTool.
     */
    async verifySpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('verifySpot', args);
    },

    async shutdown(): Promise<void> {
      // Remove all verify stubs.
      for (const cleanup of verifyStubCleanups) {
        cleanup();
      }
      verifyStubCleanups.length = 0;
      // Clear probe stubs.
      probeSpawnStubs.clear();
      await client.close();
      await server.close();
    },
  };

  // Wrap the tool handler to inject probe spawn stubs from the harness map.
  // The MCP server routes through callTool, which ultimately calls runProbe.
  // We patch runPreflightProbe's underlying behavior by overriding the
  // ProbeOptions at the harness level.
  //
  // Implementation: intercept callTool for 'runPreflightProbe' and inject
  // the stored spawn stub from probeSpawnStubs before passing to the real tool.
  // Since the tool is registered on the server, we need to hook at the harness
  // level rather than the server level.
  //
  // The simplest approach: override callTool to pass spawn stubs for probe calls.
  const originalCallTool = harness.callTool.bind(harness);
  (harness as any).callTool = async function callToolWithProbeStub(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (toolName === 'runPreflightProbe' && typeof args['probeId'] === 'string') {
      const probeId = args['probeId'] as ProbeId;
      const stubSpawn = probeSpawnStubs.get(probeId);
      if (stubSpawn) {
        // Run the probe directly with the injected spawn, bypassing the MCP layer
        const result = await runProbe(probeId, { spawn: stubSpawn, remediate: args['remediate'] as boolean | undefined });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result),
            },
          ],
        };
      }
    }
    return originalCallTool(toolName, args);
  };

  return harness;
}

export default bootHarness;
