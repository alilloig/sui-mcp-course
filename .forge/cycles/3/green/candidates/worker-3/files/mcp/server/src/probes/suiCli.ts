// Probe #4: sui-cli-version
// Runs `sui --version`, parses the version, fails outside 1.63.2–1.64.1.
// This is a "guided stop" (not a hard stop) — returns pass: false without throwing.
// No shell action on fail.

import { spawnSync } from 'node:child_process';
import type { ProbeOpts, ProbeResult, SpawnResult } from '../probeTypes.js';

const MIN_VERSION = [1, 63, 2] as const;
const MAX_VERSION = [1, 64, 1] as const;

function parseVersion(str: string): [number, number, number] | null {
  // Matches patterns like "sui 1.63.2-abc" or "1.63.2" or "1.64.1"
  const match = str.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function cmpVersion(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

export async function run(opts: ProbeOpts): Promise<ProbeResult> {
  const spawnFn = opts.spawn;

  let result: SpawnResult;
  try {
    if (spawnFn) {
      result = spawnFn();
    } else {
      const r = spawnSync('sui', ['--version'], {
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
      message: 'Sui CLI is not installed or not in PATH. Install with: brew install sui',
    };
  }

  if (result.status !== 0) {
    return {
      pass: false,
      message: 'Sui CLI is not installed or not in PATH. Install with: brew install sui',
    };
  }

  const combined = result.stdout + ' ' + result.stderr;
  const parsed = parseVersion(combined);

  if (!parsed) {
    return {
      pass: false,
      message: `Could not parse Sui CLI version from output: "${result.stdout.trim()}". Install the supported version with: brew install sui`,
    };
  }

  const versionStr = parsed.join('.');
  const belowMin = cmpVersion(parsed, [...MIN_VERSION] as [number, number, number]) < 0;
  const aboveMax = cmpVersion(parsed, [...MAX_VERSION] as [number, number, number]) > 0;

  if (belowMin || aboveMax) {
    return {
      pass: false,
      message: `Sui CLI version ${versionStr} is outside the supported range 1.63.2–1.64.1. Install the correct version with: brew install sui`,
    };
  }

  return {
    pass: true,
    message: `Sui CLI version ${versionStr} is within the supported range.`,
  };
}
