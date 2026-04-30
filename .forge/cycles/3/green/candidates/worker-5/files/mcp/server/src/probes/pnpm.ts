import { spawnSync } from 'node:child_process';
import type { ProbeResult, SpawnFn } from '../preflight.js';

export function probePnpmAvailable(spawnFn?: SpawnFn): ProbeResult {
  const spawn = spawnFn ?? defaultSpawn;
  try {
    const result = spawn('pnpm', ['--version'], { timeout: 5000 });
    if (result.status === 0) {
      const version = result.stdout.trim();
      return { pass: true, message: `pnpm ${version} is available.` };
    }
    return {
      pass: false,
      message: 'pnpm is not available. Install it with: npm install -g pnpm',
    };
  } catch (err) {
    return {
      pass: false,
      message: 'pnpm is not available. Install it with: npm install -g pnpm',
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
