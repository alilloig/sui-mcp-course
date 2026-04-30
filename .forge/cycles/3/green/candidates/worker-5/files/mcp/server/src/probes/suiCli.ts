import { spawnSync } from 'node:child_process';
import type { ProbeResult, SpawnFn } from '../preflight.js';

// Inclusive range: 1.63.2 – 1.64.1
const MIN_VERSION = [1, 63, 2] as const;
const MAX_VERSION = [1, 64, 1] as const;

function parseVersion(s: string): [number, number, number] | null {
  // Accepts forms like '1.63.2', '1.63.2-abc', 'sui 1.63.2-abc'
  const match = s.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function compareVersion(a: [number, number, number], b: readonly [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const diff = a[i] - b[i];
    if (diff !== 0) return diff;
  }
  return 0;
}

export function probeSuiCliVersion(spawnFn?: SpawnFn): ProbeResult {
  const spawn = spawnFn ?? defaultSpawn;
  try {
    const result = spawn('sui', ['--version'], { timeout: 5000 });
    const output = (result.stdout + result.stderr).trim();
    const parsed = parseVersion(output);

    if (!parsed) {
      return {
        pass: false,
        message: `Could not parse Sui CLI version from: "${output}". Please install Sui CLI with: brew install sui`,
      };
    }

    const vStr = parsed.join('.');

    if (
      compareVersion(parsed, MIN_VERSION) >= 0 &&
      compareVersion(parsed, MAX_VERSION) <= 0
    ) {
      return { pass: true, message: `Sui CLI version ${vStr} is in the supported range.` };
    }

    return {
      pass: false,
      message: `Sui CLI version ${vStr} is outside the supported range (1.63.2–1.64.1). Please update with: brew install sui`,
    };
  } catch (err) {
    return {
      pass: false,
      message: `Sui CLI is not available or errored. Please install it with: brew install sui`,
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
