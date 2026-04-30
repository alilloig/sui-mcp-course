import type { SpawnFn } from './preflight.js';

export type { SpawnFn };

export interface VerificationCompileSpec {
  mode: 'compile';
  command: string;
}

export interface VerificationTestSpec {
  mode: 'test';
  command: string;
  expected_pass?: number;
}

export interface VerificationSimulateSpec {
  mode: 'simulate';
  endpoint: string;
  expected_status: number;
}

export interface VerificationCustomSpec {
  mode: 'custom';
  command: string;
  expected_stdout_regex: string;
}

export type VerificationSpec =
  | VerificationCompileSpec
  | VerificationTestSpec
  | VerificationSimulateSpec
  | VerificationCustomSpec;

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
    super(`Verification mode '${mode}' is not yet supported in cycle 4.`);
    this.name = 'VerificationModeUnsupportedError';
    this.mode = mode;
  }
}

// Module-level stub for test injection via setVerifyStub.
// This allows the harness to stub verifySpot without spawning subprocesses.
let _verifyStub: VerificationResult | null = null;

/**
 * Install a test-only stub result for runVerification. When set, any call to
 * runVerification returns the stub result instead of spawning a subprocess.
 * Pass null to clear the stub.
 */
export function setVerifyStub(stub: VerificationResult | null): void {
  _verifyStub = stub;
}

/**
 * Run the verification adapter for the given spec and projectRoot.
 * The `compile` adapter is fully implemented; `test`, `simulate`, and `custom`
 * throw VerificationModeUnsupportedError (cycle 5+ will implement them).
 */
export async function runVerification(
  spec: VerificationSpec,
  projectRoot: string,
  opts: VerifyOptions = {},
): Promise<VerificationResult> {
  // If a test stub is installed, return it immediately without spawning.
  if (_verifyStub !== null) {
    return _verifyStub;
  }

  if (spec.mode === 'compile') {
    const parts = spec.command.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    const spawnFn = opts.spawn;

    if (spawnFn) {
      try {
        const result = spawnFn(cmd, args, { cwd: projectRoot });
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
        return {
          pass: result.status === 0,
          output,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { pass: false, output: msg };
      }
    }

    // No spawn fn provided — use spawnSync from child_process
    const { spawnSync } = await import('node:child_process');
    try {
      const result = spawnSync(cmd, args, {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      const output = [result.stdout ?? '', result.stderr ?? ''].filter(Boolean).join('\n');
      return {
        pass: result.status === 0,
        output,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { pass: false, output: msg };
    }
  }

  if (spec.mode === 'test') {
    throw new VerificationModeUnsupportedError('test');
  }

  if (spec.mode === 'simulate') {
    throw new VerificationModeUnsupportedError('simulate');
  }

  if (spec.mode === 'custom') {
    throw new VerificationModeUnsupportedError('custom');
  }

  // TypeScript exhaustive check
  const _exhaustive: never = spec;
  throw new VerificationModeUnsupportedError((_exhaustive as VerificationSpec).mode);
}
