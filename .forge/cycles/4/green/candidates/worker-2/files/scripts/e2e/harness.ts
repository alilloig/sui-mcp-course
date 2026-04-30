import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';
import { runProbe } from '../../mcp/server/src/preflight.js';
import type { SpawnFn, ProbeId } from '../../mcp/server/src/preflight.js';
import { setVerifyStub } from '../../mcp/server/src/verify.js';
import type { VerificationResult } from '../../mcp/server/src/verify.js';

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

  // Harness-internal spawn stub map — keyed on probe id.
  // M005: no module-level setSpawnOverride; stubs are held here and passed
  // through ProbeOptions at the call site when the harness intercepts the call.
  const spawnStubs = new Map<ProbeId, SpawnFn>();

  // Track verify stub cleanup.
  const verifyStubCleanups: Array<() => void> = [];

  /**
   * Core MCP client call. When a spawn stub is installed for a runPreflightProbe
   * call, the harness intercepts and calls runProbe directly with the stub
   * (passing it via ProbeOptions.spawn at the call site), bypassing the MCP
   * transport. This is the "per-call ProbeOptions injection" seam (M005).
   */
  async function callToolImpl(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    // Intercept runPreflightProbe when a spawn stub is active for this probe.
    if (toolName === 'runPreflightProbe' && typeof args['probeId'] === 'string') {
      const probeId = args['probeId'] as ProbeId;
      const stub = spawnStubs.get(probeId);
      if (stub) {
        // Pass spawn via ProbeOptions at the runProbe call site (M005 seam).
        const result = await runProbe(probeId, { spawn: stub });
        // Wrap in MCP-style content envelope so parseTextResult works.
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
    }
    return client.callTool({ name: toolName, arguments: args });
  }

  // Build the harness object with methods that can be replaced by spies.
  // runPreflightProbe references `harness.callTool` (through the object)
  // so that when vi.spyOn(harness, 'callTool') replaces the method,
  // runPreflightProbe will call the spy rather than the original closure.
  const harness: HarnessInstance = {
    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
      return callToolImpl(toolName, args);
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
     * Stubs are passed via ProbeOptions at the call site — no global mutation.
     */
    async withDockerStub(opts: { exitCode: number }): Promise<void> {
      const stubSpawn: SpawnFn = () => ({
        status: opts.exitCode,
        stdout: '',
        stderr: opts.exitCode !== 0 ? 'Cannot connect to the Docker daemon' : '',
      });
      spawnStubs.set('docker-running', stubSpawn);
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
      spawnStubs.set('sui-cli-version', stubSpawn);
    },

    /**
     * Fixture: simulate sandbox repo being absent by overriding HOME to an
     * empty temp directory (relies on the test already having set HOME to tempHome
     * which has no workspace/deepbook-sandbox).
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
     * Fixture: install a verify stub so that verifySpot calls return the given
     * result without spawning a subprocess (T-286).
     * Uses setVerifyStub from verify.ts as the injection seam.
     */
    async withVerifyStub(opts: { pass: boolean; output?: string }): Promise<void> {
      const result: VerificationResult = { pass: opts.pass, output: opts.output };
      setVerifyStub(result);
      verifyStubCleanups.push(() => {
        setVerifyStub(null);
      });
    },

    /**
     * Convenience wrapper: selectPath tool via callTool.
     */
    async selectPath(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('selectPath', args);
    },

    /**
     * Convenience wrapper: setPersonalization tool via callTool.
     */
    async setPersonalization(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('setPersonalization', args);
    },

    /**
     * Convenience wrapper: nextSpot tool via callTool.
     */
    async nextSpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('nextSpot', args);
    },

    /**
     * Convenience wrapper: verifySpot tool via callTool.
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
      // Clear spawn stubs.
      spawnStubs.clear();
      await client.close();
      await server.close();
    },
  };

  return harness;
}

export default bootHarness;
