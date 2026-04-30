// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShellAction {
  kind: 'shell';
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface ProbeResult {
  pass: boolean;
  message: string;
  action?: ShellAction;
}

/**
 * Injection seam for spawn-based probes.
 * The function may throw (e.g. ENOENT) or return a result object.
 */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { timeout?: number },
) => { status: number | null; stdout: string; stderr: string };

export interface RunProbeOptions {
  /** Only used by the manifest probe — triggers the deploy executor. */
  remediate?: boolean;
  /** Injection seam for the spawn function (used by tests). */
  spawn?: SpawnFn;
}

// ---------------------------------------------------------------------------
// Probe IDs
// ---------------------------------------------------------------------------

export type ProbeId =
  | 'docker-running'
  | 'node-version'
  | 'pnpm-available'
  | 'sui-cli-version'
  | 'sui-pilot-enabled'
  | 'sandbox-repo-present'
  | 'sandbox-manifest-reachable'
  | 'learning-output-style-enabled';

// ---------------------------------------------------------------------------
// PROBE_ORDER — immutable, literal-typed, frozen
// ---------------------------------------------------------------------------

export const PROBE_ORDER: readonly ProbeId[] = Object.freeze([
  'docker-running',
  'node-version',
  'pnpm-available',
  'sui-cli-version',
  'sui-pilot-enabled',
  'sandbox-repo-present',
  'sandbox-manifest-reachable',
  'learning-output-style-enabled',
] as const) as readonly ProbeId[];

// ---------------------------------------------------------------------------
// Harness stub registry
// Used by tests/harness to inject stub spawn functions without touching
// the real probe code. The harness (same process, in-memory transport) sets
// entries here; runProbe checks before calling the real probe.
// ---------------------------------------------------------------------------

type ProbeStubEntry =
  | { kind: 'spawn'; fn: SpawnFn }
  | { kind: 'result'; result: ProbeResult };

const _stubRegistry = new Map<ProbeId, ProbeStubEntry>();

/**
 * Register a stub spawn function for a given probe id.
 * Used by the e2e harness fixtures (withDockerStub, withSuiCliStub, etc.).
 * The deploy-branch stub gating lives exclusively in probes/manifest.ts.
 */
export function _registerProbeSpawnStub(probeId: ProbeId, fn: SpawnFn): void {
  _stubRegistry.set(probeId, { kind: 'spawn', fn });
}

/**
 * Register a full result stub for a given probe id.
 */
export function _registerProbeResultStub(probeId: ProbeId, result: ProbeResult): void {
  _stubRegistry.set(probeId, { kind: 'result', result });
}

/**
 * Clear all probe stubs (call this in test teardown).
 */
export function _clearProbeStubs(): void {
  _stubRegistry.clear();
}

// ---------------------------------------------------------------------------
// runProbe — dispatches to per-probe modules
// ---------------------------------------------------------------------------

export async function runProbe(probeId: ProbeId, opts: RunProbeOptions): Promise<ProbeResult> {
  // Check stub registry first.
  const stub = _stubRegistry.get(probeId);

  switch (probeId) {
    case 'docker-running': {
      const { probeDockerRunning } = await import('./probes/docker.js');
      const spawnFn = opts.spawn ?? (stub?.kind === 'spawn' ? stub.fn : undefined);
      return probeDockerRunning(spawnFn);
    }

    case 'node-version': {
      if (stub?.kind === 'result') return stub.result;
      const { probeNodeVersion } = await import('./probes/node.js');
      return probeNodeVersion();
    }

    case 'pnpm-available': {
      const { probePnpmAvailable } = await import('./probes/pnpm.js');
      const spawnFn = opts.spawn ?? (stub?.kind === 'spawn' ? stub.fn : undefined);
      return probePnpmAvailable(spawnFn);
    }

    case 'sui-cli-version': {
      const { probeSuiCliVersion } = await import('./probes/suiCli.js');
      const spawnFn = opts.spawn ?? (stub?.kind === 'spawn' ? stub.fn : undefined);
      return probeSuiCliVersion(spawnFn);
    }

    case 'sui-pilot-enabled': {
      if (stub?.kind === 'result') return stub.result;
      const { probeSuiPilotEnabled } = await import('./probes/suiPilot.js');
      return probeSuiPilotEnabled();
    }

    case 'sandbox-repo-present': {
      if (stub?.kind === 'result') return stub.result;
      const { probeSandboxRepoPresent } = await import('./probes/sandboxRepo.js');
      return probeSandboxRepoPresent();
    }

    case 'sandbox-manifest-reachable': {
      if (stub?.kind === 'result') return stub.result;
      const { probeSandboxManifestReachable } = await import('./probes/manifest.js');
      return probeSandboxManifestReachable();
    }

    case 'learning-output-style-enabled': {
      if (stub?.kind === 'result') return stub.result;
      const { probeLearningOutputStyleEnabled } = await import('./probes/learningOutputStyle.js');
      return probeLearningOutputStyleEnabled();
    }

    default: {
      // TypeScript narrowing exhausts ProbeId above; this handles
      // runtime calls with invalid ids (e.g. from JS code or tests).
      const unknownId = probeId as string;
      throw new Error(`Unknown probe id: '${unknownId}'`);
    }
  }
}
