import { loadState, saveState } from '../state.js';
import { loadPhases, getCurrentSpot, advanceCursor } from '../phaseEngine.js';
import { runVerification } from '../verify.js';
import type { VerificationSpec } from '../verify.js';

export interface VerifySpotResult {
  pass: boolean;
  output?: string;
  advanced?: boolean;
  error?: string;
}

export async function runVerifySpot({
  projectRoot,
}: {
  projectRoot: string;
}): Promise<VerifySpotResult> {
  // Load state
  const stateResult = await loadState(projectRoot);

  if (stateResult.kind !== 'ok') {
    return {
      pass: false,
      advanced: false,
      error: stateResult.kind === 'absent'
        ? 'No state found. Call selectPath first.'
        : stateResult.kind === 'corrupt'
          ? `State is corrupt: ${stateResult.message}`
          : `State schema mismatch: ${stateResult.message}`,
    };
  }

  const state = stateResult.state;

  if (!state.selected_path) {
    return {
      pass: false,
      advanced: false,
      error: 'No path selected. Call selectPath first.',
    };
  }

  // Load phases
  let phases: Awaited<ReturnType<typeof loadPhases>>;
  try {
    phases = await loadPhases(projectRoot, state.selected_path);
  } catch (err) {
    return {
      pass: false,
      advanced: false,
      error: `Failed to load phases: ${(err as Error).message}`,
    };
  }

  // Get current spot
  const spotResult = getCurrentSpot(state, phases);

  if (spotResult.done) {
    return {
      pass: false,
      advanced: false,
      error: 'No active spot (path is complete).',
    };
  }

  const { spot } = spotResult;

  // Dispatch to runVerification.
  // spot.verification is typed as VerificationSpec in the schema — cast through
  // unknown to satisfy the strict union check without narrowing every branch here.
  const verificationSpec = spot.verification as unknown as VerificationSpec;

  let verifyResult: { pass: boolean; output?: string };
  try {
    verifyResult = await runVerification(verificationSpec, projectRoot);
  } catch (err) {
    return {
      pass: false,
      advanced: false,
      error: `Verification failed: ${(err as Error).message}`,
    };
  }

  if (verifyResult.pass) {
    // Advance cursor on pass
    try {
      const advancedState = advanceCursor(state, phases);
      await saveState(projectRoot, advancedState);
    } catch {
      // If already done, that's OK — the path may be exhausted
    }
    return {
      pass: true,
      output: verifyResult.output,
      advanced: true,
    };
  } else {
    // Leave cursor untouched on fail
    return {
      pass: false,
      output: verifyResult.output,
      advanced: false,
    };
  }
}
