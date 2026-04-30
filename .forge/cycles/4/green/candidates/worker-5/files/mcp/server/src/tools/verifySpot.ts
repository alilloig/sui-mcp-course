import { loadState, saveState } from '../state.js';
import { loadPhases, getCurrentSpot, advanceCursor } from '../phaseEngine.js';
import { runVerification } from '../verify.js';
import type { VerificationSpec } from '../verify.js';

export interface VerifySpotArgs {
  projectRoot: string;
}

export type VerifySpotResult =
  | { pass: boolean; output?: string; advanced: boolean }
  | { pass: false; error: string; advanced: false };

export async function verifySpot(args: VerifySpotArgs): Promise<VerifySpotResult> {
  const { projectRoot } = args;

  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'absent') {
    return { pass: false, error: 'No path selected. Call selectPath first.', advanced: false };
  }
  if (stateResult.kind === 'corrupt' || stateResult.kind === 'schema-mismatch') {
    return { pass: false, error: `State recovery required (${stateResult.kind})`, advanced: false };
  }

  const state = stateResult.state;

  if (!state.selected_path) {
    return { pass: false, error: 'No path selected. Call selectPath first.', advanced: false };
  }

  let phases;
  try {
    phases = await loadPhases(projectRoot, state.selected_path);
  } catch (err) {
    return { pass: false, error: `Failed to load phases: ${(err as Error).message ?? String(err)}`, advanced: false };
  }

  const spotResult = getCurrentSpot(state, phases);

  if (spotResult.done) {
    return { pass: false, error: 'Path is already complete (done).', advanced: false };
  }

  const { spot } = spotResult;

  // Cast via unknown to VerificationSpec — the spot's verification field shape
  // matches VerificationSpec but TypeScript's structural check requires the cast
  // because SpotData.verification is typed differently in the schema.
  const verificationSpec = spot.verification as unknown as VerificationSpec;

  let verifyResult;
  try {
    verifyResult = await runVerification(verificationSpec, projectRoot);
  } catch (err) {
    return {
      pass: false,
      output: (err as Error).message ?? String(err),
      advanced: false,
    };
  }

  if (verifyResult.pass) {
    // Advance cursor and save.
    const advancedState = advanceCursor(state, phases);
    await saveState(projectRoot, advancedState);
    return {
      pass: true,
      ...(verifyResult.output !== undefined ? { output: verifyResult.output } : {}),
      advanced: true,
    };
  }

  // Fail — leave cursor unchanged, no save.
  return {
    pass: false,
    ...(verifyResult.output !== undefined ? { output: verifyResult.output } : {}),
    advanced: false,
  };
}
