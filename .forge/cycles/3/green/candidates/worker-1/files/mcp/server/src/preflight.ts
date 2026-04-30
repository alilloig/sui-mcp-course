import { runDockerProbe } from './probes/docker.js';
import { runNodeProbe } from './probes/node.js';
import { runPnpmProbe } from './probes/pnpm.js';
import { runSuiCliProbe } from './probes/suiCli.js';
import { runSuiPilotProbe } from './probes/suiPilot.js';
import { runSandboxRepoProbe } from './probes/sandboxRepo.js';
import { runManifestProbe } from './probes/manifest.js';
import { runLearningOutputStyleProbe } from './probes/learningOutputStyle.js';
import type { ProbeResult, SpawnFn } from './probes/types.js';

export type { ProbeResult };

export type ProbeId =
  | 'docker-running'
  | 'node-version'
  | 'pnpm-available'
  | 'sui-cli-version'
  | 'sui-pilot-enabled'
  | 'sandbox-repo-present'
  | 'sandbox-manifest-reachable'
  | 'learning-output-style-enabled';

// Immutable, literal-typed array of probe ids in spec-table order.
// Must match spec.md ## Preflight Checks (ordered) exactly.
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

export interface ProbeOpts {
  spawn?: SpawnFn;
  remediate?: boolean;
}

export async function runProbe(probeId: ProbeId, opts: ProbeOpts): Promise<ProbeResult> {
  switch (probeId) {
    case 'docker-running':
      return runDockerProbe(opts);
    case 'node-version':
      return runNodeProbe();
    case 'pnpm-available':
      return runPnpmProbe(opts);
    case 'sui-cli-version':
      return runSuiCliProbe(opts);
    case 'sui-pilot-enabled':
      return runSuiPilotProbe();
    case 'sandbox-repo-present':
      return runSandboxRepoProbe();
    case 'sandbox-manifest-reachable':
      return runManifestProbe();
    case 'learning-output-style-enabled':
      return runLearningOutputStyleProbe();
    default: {
      // TypeScript exhaustiveness — but we need runtime protection too
      const unknownId: string = probeId;
      throw new Error(`Unknown probe id: '${unknownId}'`);
    }
  }
}

export interface RunProbesResult {
  results: Array<{ probeId: ProbeId; result: ProbeResult }>;
  stoppedAt?: ProbeId;
}

/**
 * Run all probes in PROBE_ORDER. Stops early when a probe fails and is
 * classified as a hard stop (currently probe #1 docker-running).
 */
export async function runProbes(opts: ProbeOpts = {}): Promise<RunProbesResult> {
  const results: Array<{ probeId: ProbeId; result: ProbeResult }> = [];

  for (const probeId of PROBE_ORDER) {
    const result = await runProbe(probeId, opts);
    results.push({ probeId, result });

    // docker-running is a hard stop
    if (probeId === 'docker-running' && !result.pass) {
      return { results, stoppedAt: probeId };
    }
  }

  return { results };
}
