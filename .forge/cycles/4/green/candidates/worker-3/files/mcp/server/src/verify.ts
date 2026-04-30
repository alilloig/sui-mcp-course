import { spawnSync } from 'node:child_process';
import type { SpawnFn } from './preflight.js';
import type { VerificationSpec } from './schemas/phases.js';

export type { VerificationSpec };

export interface VerificationResult {
  pass: boolean;
  output?: string;
}

export interface VerifyOptions {
  spawn?: SpawnFn;
}

/**
 * Error thrown when a verification mode is not yet supported in cycle 4.
 * Cycle 5+ will replace the stub bodies without touching call sites.
 */
export class VerificationModeUnsupportedError extends Error {
  readonly mode: string;

  constructor(mode: string) {
    super(`Verification mode '${mode}' is not yet supported in cycle 4`);
    this.name = 'VerificationModeUnsupportedError';
    this.mode = mode;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, VerificationModeUnsupportedError.prototype);
  }
}

// Verify stub seam — used by harness.withVerifyStub.
// When set, runVerification returns this result directly without spawning.
let _verifyStub: VerificationResult | null = null;

export function setVerifyStub(result: VerificationResult | null): void {
  _verifyStub = result;
}

export function getVerifyStub(): VerificationResult | null {
  return _verifyStub;
}

/**
 * Run verification for a spot. The compile adapter spawns the command with
 * cwd=projectRoot. test/simulate/custom throw VerificationModeUnsupportedError.
 *
 * If a verify stub is installed (via setVerifyStub), returns the stub result
 * immediately without spawning any subprocess.
 *
 * Only the compile adapter invokes spawn; test/simulate/custom do not.
 */
export async function runVerification(
  adapter: VerificationSpec,
  projectRoot: string,
  opts?: VerifyOptions,
): Promise<VerificationResult> {
  // Stub seam: short-circuit for test harness
  if (_verifyStub !== null) {
    return _verifyStub;
  }

  if (adapter.mode === 'compile') {
    const parts = adapter.command.split(/\s+/);
    const cmd = parts[0] ?? adapter.command;
    const args = parts.slice(1);

    try {
      let result: { status: number | null; stdout: string; stderr: string };

      if (opts?.spawn) {
        result = opts.spawn(cmd, args, { cwd: projectRoot });
      } else {
        const raw = spawnSync(cmd, args, {
          cwd: projectRoot,
          encoding: 'utf8',
        });
        result = {
          status: raw.status,
          stdout: typeof raw.stdout === 'string' ? raw.stdout : '',
          stderr: typeof raw.stderr === 'string' ? raw.stderr : '',
        };
      }

      const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
      return {
        pass: result.status === 0,
        output: combined || undefined,
      };
    } catch (err) {
      const error = err as Error & { code?: string };
      const output = error.message ?? String(err);
      return {
        pass: false,
        output,
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

  // Exhaustive check
  const _exhaustive: never = adapter;
  throw new Error(`Unhandled verification mode: ${String((_exhaustive as VerificationSpec).mode)}`);
}
