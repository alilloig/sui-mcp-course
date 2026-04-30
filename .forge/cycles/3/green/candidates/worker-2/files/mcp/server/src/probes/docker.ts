import { spawnSync } from 'node:child_process';
import { getDockerStub } from './stubs.js';

export interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type SpawnFn = () => SpawnResult;

export interface ProbeResult {
  pass: boolean;
  message: string;
  action?: {
    kind: 'shell';
    command: string;
    cwd?: string;
    timeoutMs?: number;
  };
}

function defaultSpawn(): SpawnResult {
  // Check for in-process harness stub first.
  const stub = getDockerStub();
  if (stub !== null) {
    return {
      status: stub.exitCode,
      stdout: '',
      stderr: stub.exitCode !== 0 ? 'stubbed docker failure' : '',
    };
  }

  const r = spawnSync('docker', ['info'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

export async function probe(opts: { spawn?: SpawnFn } = {}): Promise<ProbeResult> {
  const spawnFn = opts.spawn ?? defaultSpawn;

  let result: SpawnResult;
  try {
    result = spawnFn();
  } catch (_err) {
    return {
      pass: false,
      message: 'Docker Desktop is not running. Please open Docker Desktop and re-run /start.',
    };
  }

  if (result.status !== 0) {
    return {
      pass: false,
      message: 'Docker Desktop is not running. Please open Docker Desktop and re-run /start.',
    };
  }

  return {
    pass: true,
    message: 'Docker is running.',
  };
}
