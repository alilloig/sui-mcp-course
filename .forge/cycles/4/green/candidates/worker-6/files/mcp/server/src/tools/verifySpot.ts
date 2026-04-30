import { loadState, saveState } from '../state.js';
import { loadPhases, getCurrentSpot, advanceCursor } from '../phaseEngine.js';
import { runVerification } from '../verify.js';
import type { VerifyOptions } from '../verify.js';

export interface VerifySpotArgs {
  projectRoot: string;
}

export interface VerifySpotResult {
  pass: boolean;
  output?: string;
  advanced?: boolean;
  error?: string;
}

// Internal test seam for stubbing runVerification without spawning processes.
// Populated by setVerifyStub() below; consulted by verifySpot().
let _verifyStub: ((projectRoot: string) => Promise<{ pass: boolean; output?: string }>) | null = null;

/**
 * Install a stub for runVerification. Used by the test harness's withVerifyStub fixture.
 * Wires through this seam so tests do not spawn real pnpm.
 * Returns a cleanup function that removes the stub.
 */
export function setVerifyStub(
  stub: (projectRoot: string) => Promise<{ pass: boolean; output?: string }>,
): () => void {
  _verifyStub = stub;
  return () => {
    _verifyStub = null;
  };
}

export async function verifySpot(
  args: VerifySpotArgs,
  opts?: VerifyOptions,
): Promise<VerifySpotResult> {
  const { projectRoot } = args;

  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'absent') {
    return { pass: false, error: 'No state found. Call selectPath first.' };
  }
  if (stateResult.kind === 'corrupt') {
    return { pass: false, error: `State is corrupt: ${stateResult.message}` };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return { pass: false, error: `State schema mismatch: ${stateResult.message}` };
  }

  const state = stateResult.state;

  if (!state.selected_path) {
    return { pass: false, error: 'No path selected. Call selectPath before verifySpot.' };
  }

  let phases;
  try {
    phases = await loadPhases(projectRoot, state.selected_path);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      pass: false,
      error: `Failed to load phases: ${message}`,
    };
  }

  const currentResult = getCurrentSpot(state, phases);
  if (currentResult.done) {
    return { pass: false, error: 'Path is already complete (done).' };
  }

  const { spot } = currentResult;

  // Use stub if installed (test harness), otherwise use real runVerification
  let verifyResult: { pass: boolean; output?: string };
  if (_verifyStub !== null) {
    verifyResult = await _verifyStub(projectRoot);
  } else {
    verifyResult = await runVerification(spot.verification, projectRoot, opts ?? {});
  }

  if (verifyResult.pass) {
    // Advance cursor and persist
    const advancedState = advanceCursor(state, phases);
    await saveState(projectRoot, advancedState);

    return {
      pass: true,
      output: verifyResult.output,
      advanced: true,
    };
  } else {
    // Leave cursor untouched
    return {
      pass: false,
      output: verifyResult.output,
      advanced: false,
    };
  }
}
