import { probeDockerRunning } from './probes/docker.js';
import { probeNodeVersion } from './probes/node.js';
import { probePnpmAvailable } from './probes/pnpm.js';
import { probeSuiCliVersion } from './probes/suiCli.js';
import { probeSuiPilotEnabled } from './probes/suiPilot.js';
import { probeSandboxRepoPresent } from './probes/sandboxRepo.js';
import { probeSandboxManifestReachable } from './probes/manifest.js';
import { probeLearningOutputStyleEnabled } from './probes/learningOutputStyle.js';

// Shared types used by probes and the tool handler.

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

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number },
) => { status: number | null; stdout: string; stderr: string };

export type ProbeId =
  | 'docker-running'
  | 'node-version'
  | 'pnpm-available'
  | 'sui-cli-version'
  | 'sui-pilot-enabled'
  | 'sandbox-repo-present'
  | 'sandbox-manifest-reachable'
  | 'learning-output-style-enabled';

export type ProbeOptions = {
  spawn?: SpawnFn;
  remediate?: boolean;
};

export type ProbeFn = (opts: ProbeOptions) => Promise<ProbeResult>;

// The eight probe ids in spec-table order — frozen for immutability.
export const PROBE_ORDER: readonly ProbeId[] = Object.freeze([
  'docker-running',
  'node-version',
  'pnpm-available',
  'sui-cli-version',
  'sui-pilot-enabled',
  'sandbox-repo-present',
  'sandbox-manifest-reachable',
  'learning-output-style-enabled',
] as const);

// Registry mapping probe ids to their implementations.
const PROBE_REGISTRY: Record<ProbeId, ProbeFn> = {
  'docker-running': probeDockerRunning,
  'node-version': probeNodeVersion,
  'pnpm-available': probePnpmAvailable,
  'sui-cli-version': probeSuiCliVersion,
  'sui-pilot-enabled': probeSuiPilotEnabled,
  'sandbox-repo-present': probeSandboxRepoPresent,
  'sandbox-manifest-reachable': probeSandboxManifestReachable,
  'learning-output-style-enabled': probeLearningOutputStyleEnabled,
};

// Harness-injectable spawn overrides. Keyed by probe id.
// The harness installs stubs here via installHarnessSpawnStub.
// This Map is internal to preflight.ts and not exported.
const _harnessSpawnStubs = new Map<ProbeId, SpawnFn>();

/**
 * Install a harness spawn stub for the given probe id.
 * Used by test harnesses to inject deterministic spawn behavior.
 * Returns a cleanup function.
 *
 * NOTE: This replaces the old setSpawnOverride pattern (M005 carry-forward).
 * The harness now calls this function and stores the cleanup itself.
 */
export function installHarnessSpawnStub(probeId: ProbeId, spawnFn: SpawnFn): () => void {
  _harnessSpawnStubs.set(probeId, spawnFn);
  return () => {
    _harnessSpawnStubs.delete(probeId);
  };
}

/**
 * Run the probe identified by probeId with the provided options.
 * opts.spawn takes precedence; if not provided, the harness stub (if any) is used.
 * Throws (or rejects) with a structured Error for unknown probe ids.
 */
export async function runProbe(probeId: ProbeId, opts: ProbeOptions): Promise<ProbeResult> {
  const probe = PROBE_REGISTRY[probeId as ProbeId];
  if (!probe) {
    throw new Error(`Unknown probe id: '${String(probeId)}'. Valid ids: ${PROBE_ORDER.join(', ')}`);
  }

  // Apply any harness stub if no explicit spawn was provided
  const harnessStub = _harnessSpawnStubs.get(probeId);
  const effectiveOpts: ProbeOptions = harnessStub && !opts.spawn
    ? { ...opts, spawn: harnessStub }
    : opts;

  return probe(effectiveOpts);
}
