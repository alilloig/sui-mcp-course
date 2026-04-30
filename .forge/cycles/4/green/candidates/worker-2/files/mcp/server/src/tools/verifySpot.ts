import { loadState, saveState } from '../state.js';
import { loadPhases, getCurrentSpot, advanceCursor } from '../phaseEngine.js';
import { runVerification } from '../verify.js';
import type { VerificationSpec } from '../schemas/phases.js';

export interface VerifySpotResult {
  pass: boolean;
  output?: string;
  advanced?: boolean;
  errors?: string[];
}

export interface VerifySpotArgs {
  projectRoot: string;
}

export async function verifySpot(args: VerifySpotArgs): Promise<VerifySpotResult> {
  const { projectRoot } = args;

  // Load state
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'absent') {
    return { pass: false, errors: ['No path selected. Call selectPath first.'] };
  }
  if (stateResult.kind === 'corrupt' || stateResult.kind === 'schema-mismatch') {
    return { pass: false, errors: [`State recovery required: ${stateResult.message}`] };
  }

  const state = stateResult.state;
  if (!state.selected_path) {
    return { pass: false, errors: ['selected_path is not set. Call selectPath first.'] };
  }

  // Load phases
  let phasesData;
  try {
    phasesData = await loadPhases(projectRoot, state.selected_path);
  } catch (err) {
    return { pass: false, errors: [`Failed to load phases: ${err instanceof Error ? err.message : String(err)}`] };
  }

  // Get current spot
  const current = getCurrentSpot(state, phasesData);
  if (current.done) {
    return { pass: false, errors: ['Path is already complete.'] };
  }

  const { spot } = current;

  // Use a type-safe cast through unknown to satisfy TypeScript strict mode (T-003/T-178/T-282)
  const verificationSpec = (spot as unknown as { verification: VerificationSpec }).verification;

  // Run verification
  let verResult: { pass: boolean; output?: string };
  try {
    verResult = await runVerification(verificationSpec, projectRoot);
  } catch (err) {
    return {
      pass: false,
      output: err instanceof Error ? err.message : String(err),
      advanced: false,
    };
  }

  if (verResult.pass) {
    // Advance cursor
    const advancedState = advanceCursor(state, phasesData);
    await saveState(projectRoot, advancedState);
    return { pass: true, output: verResult.output, advanced: true };
  } else {
    // Leave cursor untouched (do not save state with cursor changed)
    return { pass: false, output: verResult.output, advanced: false };
  }
}
