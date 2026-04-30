import type { ProbeResult, SpawnFn } from '../preflight.js';

const MIN_VERSION = [1, 63, 2] as const;
const MAX_VERSION = [1, 64, 1] as const;

function parseVersion(vstr: string): [number, number, number] | null {
  // Match e.g. "sui 1.63.2-abc" or "sui 1.64.1"
  const m = vstr.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function compareVersion(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export async function probeSuiCli(opts: { spawn?: SpawnFn } = {}): Promise<ProbeResult> {
  const spawnFn = opts.spawn;
  let versionOutput = '';
  try {
    let result: { status: number | null; stdout: string; stderr: string };
    if (spawnFn) {
      result = spawnFn('sui', ['--version']);
    } else {
      const { spawnSync } = await import('node:child_process');
      const r = spawnSync('sui', ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      });
      result = {
        status: r.status ?? 1,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? '',
      };
    }
    if (result.status !== 0) {
      return {
        pass: false,
        message: `Sui CLI is not available or exited with error. Install with: brew install sui`,
      };
    }
    versionOutput = result.stdout.trim();
  } catch (_err) {
    return {
      pass: false,
      message: `Sui CLI is not available. Install with: brew install sui`,
    };
  }

  const parsed = parseVersion(versionOutput);
  if (!parsed) {
    return {
      pass: false,
      message: `Could not parse Sui CLI version from output: "${versionOutput}". Install with: brew install sui`,
    };
  }

  const tooLow = compareVersion(parsed, MIN_VERSION) < 0;
  const tooHigh = compareVersion(parsed, MAX_VERSION) > 0;

  if (tooLow || tooHigh) {
    const detected = `${parsed[0]}.${parsed[1]}.${parsed[2]}`;
    return {
      pass: false,
      message: `Sui CLI version ${detected} is outside the required range (${MIN_VERSION.join('.')}–${MAX_VERSION.join('.')}). Update with: brew install sui`,
    };
  }

  const detected = `${parsed[0]}.${parsed[1]}.${parsed[2]}`;
  return { pass: true, message: `Sui CLI ${detected} is in the required range.` };
}
