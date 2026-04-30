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

export async function runVerifySpot({
  projectRoot,
}: {
  projectRoot: string;
}): Promise<VerifySpotResult> {
  // Load state
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'corrupt') {
    return { pass: false, error: `State corrupt: ${stateResult.message}` };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return { pass: false, error: `State schema mismatch: ${stateResult.message}` };
  }
  if (stateResult.kind === 'absent' || !stateResult.state.selected_path) {
    return { pass: false, error: 'No path selected. Call selectPath first.' };
  }

  const state = stateResult.state;
  const slug = state.selected_path;

  // Load phases
  let phasesData: Awaited<ReturnType<typeof loadPhases>>;
  try {
    phasesData = await loadPhases(projectRoot, slug);
  } catch (err) {
    return { pass: false, error: `Failed to load phases: ${String(err)}` };
  }

  // Get current spot
  const current = getCurrentSpot(state, phasesData);
  if (current.done) {
    return { pass: false, error: 'No active spot (path is done)' };
  }

  const { spot } = current;

  // Ensure the spot has a verification block (full spot, not a stub)
  if (spot.verification === undefined) {
    return { pass: false, error: `Spot ${spot.id} has no verification block; cannot verify` };
  }

  // Cast through unknown to satisfy TS strict — spot.verification is a VerificationSpec
  // as validated by the schema (validatePhases runtime check above)
  const verSpec = (spot.verification as unknown) as VerificationSpec;

  const verResult = await runVerification(verSpec, projectRoot);

  if (verResult.pass) {
    // Advance cursor
    const advancedState = advanceCursor(state, phasesData);
    await saveState(projectRoot, advancedState);
    return { pass: true, output: verResult.output, advanced: true };
  } else {
    // Leave cursor untouched
    return { pass: false, output: verResult.output, advanced: false };
  }
}

// Alias export expected by tests
export const verifySpot = runVerifySpot;
