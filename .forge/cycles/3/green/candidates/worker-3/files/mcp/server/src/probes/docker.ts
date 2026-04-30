// Probe #1: docker-running
// Runs `docker info`; non-zero exit or ENOENT → fail.
// No shell action — this is a "stop" class probe.

import { spawnSync } from 'node:child_process';
import type { ProbeOpts, ProbeResult, SpawnResult } from '../probeTypes.js';

export async function run(opts: ProbeOpts): Promise<ProbeResult> {
  const spawnFn = opts.spawn;

  let result: SpawnResult;
  try {
    if (spawnFn) {
      result = spawnFn();
    } else {
      const r = spawnSync('docker', ['info'], {
        encoding: 'utf8',
        timeout: 5000,
      });
      if (r.error) throw r.error;
      result = {
        status: r.status ?? 1,
        stdout: (r.stdout as string) ?? '',
        stderr: (r.stderr as string) ?? '',
      };
    }
  } catch (_err) {
    return {
      pass: false,
      message: 'Docker Desktop is not running. Please open Docker Desktop and re-run /start.',
    };
  }

  if (result.status === 0) {
    return { pass: true, message: 'Docker Desktop is running.' };
  }

  return {
    pass: false,
    message: 'Docker Desktop is not running. Please open Docker Desktop and re-run /start.',
  };
}
