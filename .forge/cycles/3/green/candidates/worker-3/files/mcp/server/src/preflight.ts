// Ordered probe registry for the preflight system.
// Each probe is a thin wrapper; logic lives in per-probe modules under probes/.

import type { ProbeId, ProbeOpts, ProbeResult, ShellAction } from './probeTypes.js';
export type { ProbeId, ProbeOpts, ProbeResult, ShellAction };

import { run as runDocker } from './probes/docker.js';
import { run as runNode } from './probes/node.js';
import { run as runPnpm } from './probes/pnpm.js';
import { run as runSuiCli } from './probes/suiCli.js';
import { run as runSuiPilot } from './probes/suiPilot.js';
import { run as runSandboxRepo } from './probes/sandboxRepo.js';
import { run as runManifest } from './probes/manifest.js';
import { run as runLearningOutputStyle } from './probes/learningOutputStyle.js';

// The ordered list of probe ids, matching spec.md ## Preflight Checks rows 1-8.
// Frozen at runtime to prevent mutation.
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

type ProbeRunner = (opts: ProbeOpts) => Promise<ProbeResult>;

const PROBE_REGISTRY: Record<ProbeId, ProbeRunner> = {
  'docker-running': (opts) => runDocker(opts),
  'node-version': (opts) => runNode(opts),
  'pnpm-available': (opts) => runPnpm(opts),
  'sui-cli-version': (opts) => runSuiCli(opts),
  'sui-pilot-enabled': (opts) => runSuiPilot(opts),
  'sandbox-repo-present': (opts) => runSandboxRepo(opts),
  'sandbox-manifest-reachable': (opts) => runManifest(opts),
  'learning-output-style-enabled': (opts) => runLearningOutputStyle(opts),
};

export async function runProbe(probeId: ProbeId, opts: ProbeOpts): Promise<ProbeResult> {
  const runner = PROBE_REGISTRY[probeId];
  if (!runner) {
    throw new Error(`Unknown probe id: '${String(probeId)}'. Valid probe ids are: ${PROBE_ORDER.join(', ')}`);
  }
  return runner(opts);
}
