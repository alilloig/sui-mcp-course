import { spawnSync } from 'node:child_process';
import type { ProbeResult, SpawnFn } from './types.js';
import { getProbeSpawnStub } from './stubStore.js';

const SUI_MIN = '1.63.2';
const SUI_MAX = '1.64.1';

function parseVersion(v: string): [number, number, number] {
  const parts = v.trim().split('.').map((p) => parseInt(p, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function defaultSpawn(cmd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, { timeout: 5000, encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function classifyVersion(detectedVersion: string): ProbeResult {
  const detected = parseVersion(detectedVersion);
  const min = parseVersion(SUI_MIN);
  const max = parseVersion(SUI_MAX);

  if (compareVersions(detected, min) < 0 || compareVersions(detected, max) > 0) {
    return {
      pass: false,
      message: `sui CLI version ${detectedVersion} is outside the required range (${SUI_MIN}–${SUI_MAX}). Update with: brew install sui`,
    };
  }

  return {
    pass: true,
    message: `sui CLI ${detectedVersion} detected (in required range ${SUI_MIN}–${SUI_MAX}).`,
  };
}

export async function runSuiCliProbe(opts?: { spawn?: SpawnFn }): Promise<ProbeResult> {
  // opts.spawn takes priority (unit test injection), then stub store, then real spawn
  const spawn = opts?.spawn ?? getProbeSpawnStub('sui-cli-version') ?? defaultSpawn;
  let result: { status: number; stdout: string; stderr: string };
  try {
    result = spawn('sui', ['--version']);
  } catch {
    return {
      pass: false,
      message: `sui CLI not found. Install the required version with: brew install sui`,
    };
  }

  if (result.status !== 0) {
    return {
      pass: false,
      message: `sui CLI exited with non-zero status. Install the required version (${SUI_MIN}–${SUI_MAX}) with: brew install sui`,
    };
  }

  // Parse version from stdout — format: "sui 1.63.2-abc" or "sui 1.63.2"
  const stdout = result.stdout.trim();
  const versionMatch = stdout.match(/sui\s+(\d+\.\d+\.\d+)/);
  if (!versionMatch) {
    return {
      pass: false,
      message: `Could not parse sui CLI version from: ${stdout}. Install with: brew install sui`,
    };
  }

  return classifyVersion(versionMatch[1]);
}
