import { probeDocker } from './probes/docker.js';
import { probeNode } from './probes/node.js';
import { probePnpm } from './probes/pnpm.js';
import { probeSuiCli } from './probes/suiCli.js';
import { probeSuiPilot } from './probes/suiPilot.js';
import { probeSandboxRepo } from './probes/sandboxRepo.js';
import { probeManifest } from './probes/manifest.js';
import { probeLearningOutputStyle } from './probes/learningOutputStyle.js';

// ---------------------------------------------------------------------------
// Public types
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
 * Injection seam: a synchronous spawn function used in tests to stub out
 * the real child_process.spawnSync call.
 */
export type SpawnFn = (
  cmd: string,
  args: string[],
) => { status: number | null; stdout: string; stderr: string };

export type ProbeOptions = {
  spawn?: SpawnFn;
  remediate?: boolean;
};

// ---------------------------------------------------------------------------
// PROBE_ORDER — spec-table order, frozen
// ---------------------------------------------------------------------------

export const PROBE_ORDER: readonly [
  'docker-running',
  'node-version',
  'pnpm-available',
  'sui-cli-version',
  'sui-pilot-enabled',
  'sandbox-repo-present',
  'sandbox-manifest-reachable',
  'learning-output-style-enabled',
] = Object.freeze([
  'docker-running',
  'node-version',
  'pnpm-available',
  'sui-cli-version',
  'sui-pilot-enabled',
  'sandbox-repo-present',
  'sandbox-manifest-reachable',
  'learning-output-style-enabled',
] as const);

export type ProbeId = (typeof PROBE_ORDER)[number];

// ---------------------------------------------------------------------------
// Probe registry
// ---------------------------------------------------------------------------

type Probe = (opts: ProbeOptions) => Promise<ProbeResult>;

const PROBES: Record<ProbeId, Probe> = {
  'docker-running': (opts) => probeDocker({ spawn: opts.spawn }),
  'node-version': (opts) => probeNode(opts),
  'pnpm-available': (opts) => probePnpm({ spawn: opts.spawn }),
  'sui-cli-version': (opts) => probeSuiCli({ spawn: opts.spawn }),
  'sui-pilot-enabled': (opts) => probeSuiPilot(opts),
  'sandbox-repo-present': (opts) => probeSandboxRepo(opts),
  'sandbox-manifest-reachable': (opts) => probeManifest({ remediate: opts.remediate }),
  'learning-output-style-enabled': (opts) => probeLearningOutputStyle(opts),
};

// ---------------------------------------------------------------------------
// runProbe — public entry point
// ---------------------------------------------------------------------------

export async function runProbe(
  probeId: ProbeId | string,
  opts: ProbeOptions,
): Promise<ProbeResult> {
  if (!((PROBES as Record<string, Probe>)[probeId])) {
    throw new Error(`Unknown probe id: '${probeId}'. Valid ids are: ${PROBE_ORDER.join(', ')}`);
  }
  const probe = (PROBES as Record<string, Probe>)[probeId];
  return probe(opts);
}
