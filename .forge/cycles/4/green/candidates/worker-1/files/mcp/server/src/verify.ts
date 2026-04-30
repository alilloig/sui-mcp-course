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
  spawn?: SpawnFnSync;
}

export type SpawnFnSync = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number },
) => { status: number | null; stdout: string; stderr: string };

/**
 * Module-level verify stub for test injection via withVerifyStub.
 * When set, runVerification returns this result instead of spawning.
 * This is the seam used by the harness's withVerifyStub fixture.
 */
let verifyStub: VerificationResult | null = null;

/**
 * Install a verification stub. While set, runVerification returns the stub
 * result without invoking any spawn. Returns a cleanup function.
 * Used by the harness's withVerifyStub fixture.
 */
export function setVerifyStub(result: VerificationResult | null): () => void {
  verifyStub = result;
  return () => {
    verifyStub = null;
  };
}

export class VerificationModeUnsupportedError extends Error {
  mode: string;
  constructor(mode: string) {
    super(`Verification mode '${mode}' is not yet supported in cycle 4. It will be enabled in a future cycle.`);
    this.name = 'VerificationModeUnsupportedError';
    this.mode = mode;
  }
}

export class LoadPhasesError extends Error {
  slug: string;
  constructor(slug: string, message: string) {
    super(message);
    this.name = 'LoadPhasesError';
    this.slug = slug;
  }
}

/**
 * Run verification for the given spec against the project root.
 * The compile adapter is the only spawning branch in cycle 4.
 * test/simulate/custom throw VerificationModeUnsupportedError.
 */
export async function runVerification(
  spec: VerificationSpec,
  projectRoot: string,
  opts?: VerifyOptions,
): Promise<VerificationResult> {
  // Check stub first (harness inject seam)
  if (verifyStub !== null) {
    return verifyStub;
  }

  if (spec.mode === 'compile') {
    return runCompileAdapter(spec.command, projectRoot, opts?.spawn);
  } else if (spec.mode === 'test') {
    throw new VerificationModeUnsupportedError('test');
  } else if (spec.mode === 'simulate') {
    throw new VerificationModeUnsupportedError('simulate');
  } else if (spec.mode === 'custom') {
    throw new VerificationModeUnsupportedError('custom');
  }

  // TypeScript exhaustiveness (unreachable at runtime)
  const exhausted: never = spec;
  throw new Error(`Unhandled verification mode: ${JSON.stringify(exhausted)}`);
}

function runCompileAdapter(
  command: string,
  projectRoot: string,
  spawnFn?: SpawnFnSync,
): VerificationResult {
  // Split the command into cmd + args (simple space split)
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  const effectiveSpawn: SpawnFnSync = spawnFn ?? defaultSpawnSync;

  try {
    const result = effectiveSpawn(cmd, args, { cwd: projectRoot });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    return {
      pass: result.status === 0,
      output: output || undefined,
    };
  } catch (err) {
    const e = err as Error;
    return {
      pass: false,
      output: e.message ?? String(err),
    };
  }
}

function defaultSpawnSync(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number },
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, {
    cwd: opts?.cwd,
    timeout: opts?.timeout,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}
