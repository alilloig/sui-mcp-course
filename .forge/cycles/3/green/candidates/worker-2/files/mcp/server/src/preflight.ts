import * as dockerProbe from './probes/docker.js';
import * as nodeProbe from './probes/node.js';
import * as pnpmProbe from './probes/pnpm.js';
import * as suiCliProbe from './probes/suiCli.js';
import * as suiPilotProbe from './probes/suiPilot.js';
import * as sandboxRepoProbe from './probes/sandboxRepo.js';
import * as manifestProbe from './probes/manifest.js';
import * as learningOutputStyleProbe from './probes/learningOutputStyle.js';
import type { SpawnFn } from './probes/docker.js';

export type ProbeId =
  | 'docker-running'
  | 'node-version'
  | 'pnpm-available'
  | 'sui-cli-version'
  | 'sui-pilot-enabled'
  | 'sandbox-repo-present'
  | 'sandbox-manifest-reachable'
  | 'learning-output-style-enabled';

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

export interface ProbeOpts {
  spawn?: SpawnFn;
  remediate?: boolean;
}

/**
 * Ordered probe ids — spec table order, rows 1-8.
 * Immutable and frozen at runtime.
 */
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

export async function runProbe(probeId: ProbeId, opts: ProbeOpts): Promise<ProbeResult> {
  switch (probeId) {
    case 'docker-running':
      return dockerProbe.probe(opts);
    case 'node-version':
      return nodeProbe.probe();
    case 'pnpm-available':
      return pnpmProbe.probe(opts);
    case 'sui-cli-version':
      return suiCliProbe.probe(opts);
    case 'sui-pilot-enabled':
      return suiPilotProbe.probe();
    case 'sandbox-repo-present':
      return sandboxRepoProbe.probe();
    case 'sandbox-manifest-reachable':
      return manifestProbe.probe();
    case 'learning-output-style-enabled':
      return learningOutputStyleProbe.probe();
    default: {
      // TypeScript exhaustiveness check — this branch is unreachable for valid ProbeId
      const _exhaustive: never = probeId;
      throw new Error(`Unknown probe id: "${_exhaustive}"`);
    }
  }
}
