export interface SpawnResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type SpawnFn = (cmd: string, args: string[]) => SpawnResult;

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
