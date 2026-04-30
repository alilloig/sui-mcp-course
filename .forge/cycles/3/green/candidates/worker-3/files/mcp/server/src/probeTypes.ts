// Shared types for the preflight probe system.

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

// Synchronous spawn return type used by injection seam.
export interface SpawnResult {
  status: number;
  stdout: string;
  stderr: string;
}

// Injection seam: tests supply a stub; probes use real spawnSync by default.
export type SpawnFn = () => SpawnResult;

// Options passed to runProbe — all fields optional.
export interface ProbeOpts {
  spawn?: SpawnFn;
  remediate?: boolean;
}
