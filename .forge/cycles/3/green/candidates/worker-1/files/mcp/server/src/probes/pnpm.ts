import { spawnSync } from 'node:child_process';
import type { ProbeResult, SpawnFn } from './types.js';
import { getProbeSpawnStub } from './stubStore.js';

function defaultSpawn(cmd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, { timeout: 5000, encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export async function runPnpmProbe(opts?: { spawn?: SpawnFn }): Promise<ProbeResult> {
  const spawn = opts?.spawn ?? getProbeSpawnStub('pnpm-available') ?? defaultSpawn;
  let result: { status: number; stdout: string; stderr: string };
  try {
    result = spawn('pnpm', ['--version']);
  } catch {
    return {
      pass: false,
      message: 'pnpm is not available on PATH. Install it with: npm install -g pnpm',
    };
  }

  if (result.status !== 0) {
    return {
      pass: false,
      message: 'pnpm is not available on PATH. Install it with: npm install -g pnpm',
    };
  }

  const version = result.stdout.trim();
  return {
    pass: true,
    message: `pnpm ${version} detected.`,
  };
}
