import { spawnSync as nodeSpawnSync } from 'node:child_process';
import type { VerificationSpec } from './schemas/phases.js';

export type { VerificationSpec };

export interface VerificationResult {
  pass: boolean;
  output?: string;
}

// SpawnFn for verification includes cwd (unlike preflight's SpawnFn which only has timeout).
export type VerifySpawnFn = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number },
) => { status: number | null; stdout: string; stderr: string };

export interface VerifyOptions {
  spawn?: VerifySpawnFn;
}

/**
 * Error thrown when a verification mode is not yet supported in cycle 4.
 * Cycle 5+ will replace the stub bodies for test/simulate/custom.
 */
export class VerificationModeUnsupportedError extends Error {
  public readonly mode: string;
  constructor(mode: string) {
    super(`Verification mode '${mode}' is not yet supported in cycle 4`);
    this.name = 'VerificationModeUnsupportedError';
    this.mode = mode;
  }
}

// Module-level test seam: harness fixtures set this to stub runVerification
// without spawning a subprocess. The harness calls setVerifyOverride to install
// and the returned cleanup removes it.
type VerifyOverrideFn = (
  adapter: VerificationSpec,
  projectRoot: string,
) => Promise<VerificationResult>;

let _verifyOverride: VerifyOverrideFn | undefined;

export function setVerifyOverride(fn: VerifyOverrideFn): () => void {
  _verifyOverride = fn;
  return () => {
    if (_verifyOverride === fn) {
      _verifyOverride = undefined;
    }
  };
}

/**
 * Run verification against the student's working tree.
 * Only the compile adapter is implemented in cycle 4.
 * test/simulate/custom throw VerificationModeUnsupportedError.
 */
export async function runVerification(
  adapter: VerificationSpec,
  projectRoot: string,
  opts?: VerifyOptions,
): Promise<VerificationResult> {
  // Check module-level test override first (harness withVerifyStub fixture).
  if (_verifyOverride !== undefined) {
    return _verifyOverride(adapter, projectRoot);
  }

  if (adapter.mode === 'compile') {
    const parts = adapter.command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    const spawnFn: VerifySpawnFn = opts?.spawn ?? ((c, a, o) => {
      const syncResult = nodeSpawnSync(c, a, {
        encoding: 'utf8',
        cwd: o?.cwd,
        timeout: o?.timeout,
      });
      return {
        status: syncResult.status,
        stdout: (syncResult.stdout as string) ?? '',
        stderr: (syncResult.stderr as string) ?? '',
      };
    });

    try {
      const result = spawnFn(cmd, args, { cwd: projectRoot });
      const output = (result.stdout ?? '') + (result.stderr ?? '');
      return {
        pass: result.status === 0,
        output,
      };
    } catch (err) {
      const e = err as Error & { code?: string };
      return {
        pass: false,
        output: e.code ?? e.message ?? String(err),
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

  // TypeScript exhaustiveness — unreachable
  const _exhaustive: never = adapter;
  throw new Error(`Unknown verification mode: ${JSON.stringify(_exhaustive)}`);
}
