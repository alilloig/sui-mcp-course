import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';
import type { SpawnFn, ProbeId } from '../../mcp/server/src/preflight.js';
import { installHarnessSpawnStub } from '../../mcp/server/src/preflight.js';
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

  // Track all installed override cleanup functions for shutdown.
  const overrideCleanups: Array<() => void> = [];

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
     * Fixture: installs a stub spawn function on the docker probe via
     * the harness-internal map in preflight.ts (installHarnessSpawnStub).
     * No module-level setSpawnOverride — M005 carry-forward.
     */
    async withDockerStub(opts: { exitCode: number }): Promise<void> {
      const stubSpawn: SpawnFn = () => ({
        status: opts.exitCode,
        stdout: '',
        stderr: opts.exitCode !== 0 ? 'Cannot connect to the Docker daemon' : '',
      });
      const cleanup = installHarnessSpawnStub('docker-running' as ProbeId, stubSpawn);
      overrideCleanups.push(cleanup);
    },

    /**
     * Fixture: installs a stub spawn function on the sui-cli probe via
     * the harness-internal map in preflight.ts (installHarnessSpawnStub).
     * No module-level setSpawnOverride — M005 carry-forward.
     */
    async withSuiCliStub(opts: { version: string }): Promise<void> {
      const stubSpawn: SpawnFn = () => ({
        status: 0,
        stdout: `sui ${opts.version}\n`,
        stderr: '',
      });
      const cleanup = installHarnessSpawnStub('sui-cli-version' as ProbeId, stubSpawn);
      overrideCleanups.push(cleanup);
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
     * Fixture: installs a verify stub so subsequent verifySpot calls
     * return the given result without spawning a real subprocess.
     * Wire seam: calls setVerifyStub from verify.ts.
     * T-286: harness.withVerifyStub({ pass, output }) API.
     */
    async withVerifyStub(opts: { pass: boolean; output?: string }): Promise<void> {
      const stubResult: VerificationResult = {
        pass: opts.pass,
        ...(opts.output !== undefined ? { output: opts.output } : {}),
      };
      setVerifyStub(stubResult);
      overrideCleanups.push(() => setVerifyStub(null));
    },

    /**
     * Convenience wrapper: calls selectPath tool via callTool.
     * Asserts no shell action sneaks in per AC-11.
     */
    async selectPath(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('selectPath', args);
    },

    /**
     * Convenience wrapper: calls setPersonalization tool via callTool.
     */
    async setPersonalization(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('setPersonalization', args);
    },

    /**
     * Convenience wrapper: calls nextSpot tool via callTool.
     */
    async nextSpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('nextSpot', args);
    },

    /**
     * Convenience wrapper: calls verifySpot tool via callTool.
     */
    async verifySpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('verifySpot', args);
    },

    async shutdown(): Promise<void> {
      // Remove all spawn overrides and verify stubs.
      for (const cleanup of overrideCleanups) {
        cleanup();
      }
      overrideCleanups.length = 0;
      await client.close();
      await server.close();
    },
  };

  return harness;
}

export default bootHarness;
