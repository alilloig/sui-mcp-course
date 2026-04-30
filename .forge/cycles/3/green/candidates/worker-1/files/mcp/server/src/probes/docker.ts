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

export async function runDockerProbe(opts?: { spawn?: SpawnFn }): Promise<ProbeResult> {
  // opts.spawn takes priority (unit test injection), then stub store, then real spawn
  const spawn = opts?.spawn ?? getProbeSpawnStub('docker-running') ?? defaultSpawn;
  let result: { status: number; stdout: string; stderr: string };
  try {
    result = spawn('docker', ['info']);
  } catch {
    return {
      pass: false,
      message: 'Docker Desktop is not running. Open Docker Desktop and re-run /start.',
    };
  }

  if (result.status !== 0) {
    return {
      pass: false,
      message: 'Docker Desktop is not running. Open Docker Desktop and re-run /start.',
    };
  }

  return {
    pass: true,
    message: 'Docker is running.',
  };
}
