import type { ProbeResult, SpawnFn } from '../preflight.js';

export async function probeDocker(opts: { spawn?: SpawnFn } = {}): Promise<ProbeResult> {
  const spawnFn = opts.spawn;
  try {
    let result: { status: number | null; stdout: string; stderr: string };
    if (spawnFn) {
      result = spawnFn('docker', ['info']);
    } else {
      // Real spawn via child_process.spawnSync
      const { spawnSync } = await import('node:child_process');
      const r = spawnSync('docker', ['info'], {
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
      return { pass: true, message: 'Docker is running.' };
    }
    return {
      pass: false,
      message: 'Docker Desktop is not running. Open Docker Desktop and re-run /start.',
    };
  } catch (_err) {
    // ENOENT or timeout
    return {
      pass: false,
      message: 'Docker Desktop is not running. Open Docker Desktop and re-run /start.',
    };
  }
}
