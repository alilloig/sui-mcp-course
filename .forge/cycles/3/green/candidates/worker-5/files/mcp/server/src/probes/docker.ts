import { spawnSync } from 'node:child_process';
import type { ProbeResult, SpawnFn } from '../preflight.js';

export function probeDockerRunning(spawnFn?: SpawnFn): ProbeResult {
  const spawn = spawnFn ?? defaultSpawn;
  try {
    const result = spawn('docker', ['info'], { timeout: 5000 });
    if (result.status === 0) {
      return { pass: true, message: 'Docker is running.' };
    }
    return {
      pass: false,
      message: 'Docker Desktop is not running. Please open Docker Desktop and re-run /start.',
    };
  } catch (err) {
    return {
      pass: false,
      message: 'Docker Desktop is not running. Please open Docker Desktop and re-run /start.',
    };
  }
}

function defaultSpawn(
  cmd: string,
  args: string[],
  opts: { timeout?: number },
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout ?? 5000,
    stdio: 'pipe',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
