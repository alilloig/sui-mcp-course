import {
  McpServer,
  Client,
  InMemoryTransport,
  registerTools,
} from '../../mcp/server/src/index.js';
import type { SpawnFn, ProbeId } from '../../mcp/server/src/preflight.js';
import { installProbeSpawn } from '../../mcp/server/src/tools/runPreflightProbe.js';
import { setVerifyStub } from '../../mcp/server/src/tools/verifySpot.js';

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
  withVerifyStub(opts: { pass: boolean; output?: string }): Promise<() => void>;
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

  // Track all installed override cleanup functions for shutdown.
  const overrideCleanups: Array<() => void> = [];

  // Build the harness object with methods that can be replaced by spies.
  const harness: HarnessInstance = {
    /**
     * Call a tool through the MCP transport. Returns the raw SDK result
     * (content[0].text shape) so callers can use parseTextResult on it.
     */
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
     * Convenience wrapper: calls selectPath tool.
     */
    async selectPath(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('selectPath', args);
    },

    /**
     * Convenience wrapper: calls setPersonalization tool.
     */
    async setPersonalization(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('setPersonalization', args);
    },

    /**
     * Convenience wrapper: calls nextSpot tool.
     */
    async nextSpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('nextSpot', args);
    },

    /**
     * Convenience wrapper: calls verifySpot tool.
     */
    async verifySpot(args: Record<string, unknown>): Promise<unknown> {
      return harness.callTool('verifySpot', args);
    },

    /**
     * Fixture: installs a stub spawn function on the docker probe.
     * Uses installProbeSpawn from runPreflightProbe.ts so that MCP-transport
     * calls to runPreflightProbe('docker-running') consult the stub via
     * ProbeOptions.spawn injected at the call site (no global preflight.ts mutation).
     */
    async withDockerStub(opts: { exitCode: number }): Promise<void> {
      const stubSpawn: SpawnFn = () => ({
        status: opts.exitCode,
        stdout: '',
        stderr: opts.exitCode !== 0 ? 'Cannot connect to the Docker daemon' : '',
      });
      const cleanup = installProbeSpawn('docker-running' as ProbeId, stubSpawn);
      overrideCleanups.push(cleanup);
    },

    /**
     * Fixture: installs a stub spawn function on the sui-cli probe.
     */
    async withSuiCliStub(opts: { version: string }): Promise<void> {
      const stubSpawn: SpawnFn = () => ({
        status: 0,
        stdout: `sui ${opts.version}\n`,
        stderr: '',
      });
      const cleanup = installProbeSpawn('sui-cli-version' as ProbeId, stubSpawn);
      overrideCleanups.push(cleanup);
    },

    /**
     * Fixture: simulate sandbox repo being absent.
     */
    async withSandboxRepoAbsent(): Promise<void> {
      // The probe reads process.env.HOME / os.homedir() directly.
    },

    /**
     * Fixture: installs a stub for runVerification so verifySpot tests do not
     * shell out to real pnpm. Wired through the setVerifyStub seam in verify.ts.
     * Returns a cleanup function.
     */
    async withVerifyStub(opts: { pass: boolean; output?: string }): Promise<() => void> {
      const stub = async (_projectRoot: string) => ({
        pass: opts.pass,
        output: opts.output,
      });
      const cleanup = setVerifyStub(stub);
      overrideCleanups.push(cleanup);
      return cleanup;
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

    async shutdown(): Promise<void> {
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
