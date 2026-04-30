import { spawnSync } from 'node:child_process';
import type { SpawnFn } from './docker.js';

export interface ProbeResult {
  pass: boolean;
  message: string;
  action?: undefined;
}

function defaultSpawn() {
  const r = spawnSync('pnpm', ['--version'], {
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

  let result: { status: number | null; stdout: string; stderr: string };
  try {
    result = spawnFn();
  } catch (_err) {
    return {
      pass: false,
      message: 'pnpm is not installed. Install it with: npm install -g pnpm',
    };
  }

  if (result.status !== 0) {
    return {
      pass: false,
      message: 'pnpm is not available. Install it with: npm install -g pnpm',
    };
  }

  const version = result.stdout.trim();
  return {
    pass: true,
    message: `pnpm ${version} is available.`,
  };
}
