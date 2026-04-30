// Probe #3: pnpm-available
// Runs `pnpm --version`; non-zero exit or ENOENT → fail.

import { spawnSync } from 'node:child_process';
import type { ProbeOpts, ProbeResult, SpawnResult } from '../probeTypes.js';

export async function run(opts: ProbeOpts): Promise<ProbeResult> {
  const spawnFn = opts.spawn;

  let result: SpawnResult;
  try {
    if (spawnFn) {
      result = spawnFn();
    } else {
      const r = spawnSync('pnpm', ['--version'], {
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
      message: 'pnpm is not installed. Install it with: npm install -g pnpm',
    };
  }

  if (result.status !== 0) {
    return {
      pass: false,
      message: 'pnpm is not installed. Install it with: npm install -g pnpm',
    };
  }

  const version = result.stdout.trim();
  return {
    pass: true,
    message: `pnpm ${version} is available.`,
  };
}
