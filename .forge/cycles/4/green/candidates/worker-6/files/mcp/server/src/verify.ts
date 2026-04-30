import { spawnSync } from 'node:child_process';
import type { VerificationSpec } from './schemas/phases.js';

export type { VerificationSpec };

export interface VerificationResult {
  pass: boolean;
  output?: string;
}

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number },
) => { status: number | null; stdout: string; stderr: string };

export interface VerifyOptions {
  spawn?: SpawnFn;
}

export class VerificationModeUnsupportedError extends Error {
  public readonly mode: string;

  constructor(mode: string) {
    super(`Verification mode '${mode}' is not yet supported in cycle 4`);
    this.name = 'VerificationModeUnsupportedError';
    this.mode = mode;
  }
}

function defaultSpawn(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number },
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    cwd: opts?.cwd,
    timeout: opts?.timeout ?? 60000,
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

/**
 * Run a verification adapter against the student's working tree.
 * The `compile` adapter is the only live implementation in cycle 4.
 * `test`, `simulate`, and `custom` throw VerificationModeUnsupportedError.
 */
export async function runVerification(
  spec: VerificationSpec,
  projectRoot: string,
  opts: VerifyOptions = {},
): Promise<VerificationResult> {
  if (spec.mode === 'compile') {
    const spawnFn = opts.spawn ?? defaultSpawn;
    const parts = spec.command.split(/\s+/);
    const cmd = parts[0] ?? spec.command;
    const args = parts.slice(1);

    try {
      const result = spawnFn(cmd, args, { cwd: projectRoot });
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      return {
        pass: result.status === 0,
        output: output || undefined,
      };
    } catch (err) {
      const e = err as Error & { code?: string };
      const output = e.code ? `${e.code}: ${e.message}` : e.message;
      return {
        pass: false,
        output,
      };
    }
  }

  // test, simulate, custom — typed stubs that throw structured error
  throw new VerificationModeUnsupportedError(spec.mode);
}
