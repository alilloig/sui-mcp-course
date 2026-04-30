import type { SpawnFn } from './preflight.js';
import { spawnSync } from 'node:child_process';

export type VerificationSpec =
  | { mode: 'compile'; command: string }
  | { mode: 'test'; command: string; expected_pass?: number }
  | { mode: 'simulate'; endpoint: string; expected_status: number }
  | { mode: 'custom'; command: string; expected_stdout_regex: string };

export interface VerificationResult {
  pass: boolean;
  output?: string;
}

export interface VerifyOptions {
  spawn?: SpawnFn;
}

export class VerificationModeUnsupportedError extends Error {
  mode: string;
  constructor(mode: string) {
    super(`Verification mode '${mode}' is not yet supported in cycle 4`);
    this.name = 'VerificationModeUnsupportedError';
    this.mode = mode;
  }
}

// Harness-injectable stub for testing — null by default.
// The harness's withVerifyStub sets this; production code never touches it.
let _verifyStub: VerificationResult | null = null;

/**
 * Install a stub result for all runVerification calls. Used by the harness
 * fixture (withVerifyStub) so integration tests don't shell out to pnpm.
 * Returns a cleanup function.
 */
export function _setVerifyStub(result: VerificationResult | null): () => void {
  _verifyStub = result;
  return () => {
    _verifyStub = null;
  };
}

function defaultSpawn(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number },
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    cwd: opts?.cwd,
    timeout: opts?.timeout ?? 30000,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export async function runVerification(
  adapter: VerificationSpec,
  projectRoot: string,
  opts?: VerifyOptions,
): Promise<VerificationResult> {
  // Check harness stub first.
  if (_verifyStub !== null) {
    return _verifyStub;
  }

  if (adapter.mode === 'compile') {
    const spawnFn = (opts?.spawn ?? defaultSpawn) as (
      cmd: string,
      args: string[],
      opts?: { cwd?: string; timeout?: number }
    ) => { status: number | null; stdout: string; stderr: string };
    const parts = adapter.command.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    try {
      const result = spawnFn(cmd, args, { cwd: projectRoot });
      const output = ((result.stdout ?? '') + (result.stderr ?? '')).trimEnd();
      return {
        pass: result.status === 0,
        output: output.length > 0 ? output : undefined,
      };
    } catch (err) {
      const e = err as Error;
      return {
        pass: false,
        output: e.message ?? String(e),
      };
    }
  }

  if (adapter.mode === 'test') {
    throw new VerificationModeUnsupportedError('test');
  }

  if (adapter.mode === 'simulate') {
    throw new VerificationModeUnsupportedError('simulate');
  }

  if (adapter.mode === 'custom') {
    throw new VerificationModeUnsupportedError('custom');
  }

  // Exhaustive check.
  const _exhaustive: never = adapter;
  throw new Error(`Unknown verification mode: ${String((_exhaustive as VerificationSpec).mode)}`);
}
