import type { ProbeResult, SpawnFn } from '../preflight.js';

export async function probePnpm(opts: { spawn?: SpawnFn } = {}): Promise<ProbeResult> {
  const spawnFn = opts.spawn;
  try {
    let result: { status: number | null; stdout: string; stderr: string };
    if (spawnFn) {
      result = spawnFn('pnpm', ['--version']);
    } else {
      const { spawnSync } = await import('node:child_process');
      const r = spawnSync('pnpm', ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      });
      result = {
        status: r.status ?? 1,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? '',
      };
    }
    if (result.status === 0) {
      const version = result.stdout.trim();
      return { pass: true, message: `pnpm ${version} is available.` };
    }
    return {
      pass: false,
      message: 'pnpm is not available. Install it with: npm install -g pnpm',
    };
  } catch (_err) {
    // ENOENT or timeout
    return {
      pass: false,
      message: 'pnpm is not available. Install it with: npm install -g pnpm',
    };
  }
}
