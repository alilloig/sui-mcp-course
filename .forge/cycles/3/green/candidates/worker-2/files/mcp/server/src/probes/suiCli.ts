import { spawnSync } from 'node:child_process';
import type { SpawnFn } from './docker.js';
import { getSuiCliStub } from './stubs.js';

export interface ProbeResult {
  pass: boolean;
  message: string;
  action?: undefined;
}

// Inclusive range: 1.63.2 .. 1.64.1
const MIN_VERSION = [1, 63, 2] as const;
const MAX_VERSION = [1, 64, 1] as const;

function parseVersion(str: string): [number, number, number] | null {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(str);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function compareVersion(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function defaultSpawn() {
  // Check for in-process harness stub first.
  const stub = getSuiCliStub();
  if (stub !== null) {
    return {
      status: 0,
      stdout: `sui ${stub.version}\n`,
      stderr: '',
    };
  }

  const r = spawnSync('sui', ['--version'], { encoding: 'utf8', timeout: 5000 });
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
      message: 'Could not run sui --version. Install or update with: brew install sui',
    };
  }

  const output = result.stdout.trim() || result.stderr.trim();
  const parsed = parseVersion(output);

  if (!parsed) {
    return {
      pass: false,
      message: `Could not parse sui version from: "${output}". Install with: brew install sui`,
    };
  }

  const versionStr = parsed.join('.');

  if (
    compareVersion(parsed, MIN_VERSION) >= 0 &&
    compareVersion(parsed, MAX_VERSION) <= 0
  ) {
    return {
      pass: true,
      message: `Sui CLI version ${versionStr} is in the supported range (1.63.2-1.64.1).`,
    };
  }

  return {
    pass: false,
    message: `Sui CLI version ${versionStr} is outside the supported range (1.63.2-1.64.1). Update with: brew install sui`,
  };
}
