import { loadState, saveState } from '../state.js';
import { loadPhases, getCurrentSpot, advanceCursor } from '../phaseEngine.js';
import { runVerification } from '../verify.js';
import type { VerificationSpec } from '../schemas/phases.js';

export interface VerifySpotResult {
  pass: boolean;
  output?: string;
  advanced?: boolean;
  error?: string;
}

async function _verifySpot(args: { projectRoot: string }): Promise<VerifySpotResult> {
  const { projectRoot } = args;

  // Load state
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'corrupt') {
    return { pass: false, error: `State is corrupt: ${stateResult.message}` };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return { pass: false, error: `State schema mismatch: ${stateResult.message}` };
  }
  if (stateResult.kind === 'absent') {
    return { pass: false, error: 'No path selected. Call selectPath first.' };
  }

  const state = stateResult.state;

  if (!state.selected_path) {
    return { pass: false, error: 'No path selected. Call selectPath first.' };
  }

  // Load phases
  let phasesData;
  try {
    phasesData = await loadPhases(projectRoot, state.selected_path);
  } catch (err) {
    return { pass: false, error: `Failed to load phases: ${(err as Error).message}` };
  }

  const current = getCurrentSpot(state, phasesData);

  if (current.done) {
    return { pass: false, error: 'No active spot — path is complete.' };
  }

  const { spot } = current;

  // Get the verification spec — cast through unknown to satisfy strict TS
  // (spot.verification is typed as VerificationSpec from schemas/phases.ts,
  // but we cast to be explicit about the type boundary)
  const verificationSpec = spot.verification as unknown as VerificationSpec;

  // Run verification (runVerification internally checks the verify stub seam
  // set by harness.withVerifyStub, so no subprocess is spawned when stub is active)
  let verResult;
  try {
    verResult = await runVerification(verificationSpec, projectRoot);
  } catch (err) {
    return { pass: false, error: `Verification error: ${(err as Error).message}` };
  }

  if (verResult.pass) {
    // Advance cursor
    const advancedState = advanceCursor(state, phasesData);
    await saveState(projectRoot, advancedState);
    return {
      pass: true,
      advanced: true,
      ...(verResult.output !== undefined ? { output: verResult.output } : {}),
    };
  } else {
    // Leave cursor untouched
    return {
      pass: false,
      advanced: false,
      ...(verResult.output !== undefined ? { output: verResult.output } : {}),
    };
  }
}

// Public exports
export const verifySpot = _verifySpot;
export const runVerifySpot = _verifySpot;
