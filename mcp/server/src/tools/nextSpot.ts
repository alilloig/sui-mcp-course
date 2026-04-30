import { loadState } from '../state.js';
import { loadPhases, getCurrentSpot } from '../phaseEngine.js';
import { substitutePromptOnly } from '../personalization.js';
import { probeOutputStyle } from '../outputStyle.js';
import type { VerificationSpec } from '../schemas/phases.js';

export interface DocLink {
  path: string;
}

export interface SpotView {
  id: string;
  title?: string;
  target_file: string;
  target_range: string;
  prompt: string;
  verification: VerificationSpec;
  rungs?: {
    hint_md: string;
    reference_md: string;
    auto_write_md: string;
  };
  doc_links?: DocLink[];
}

export interface LadderState {
  hint_used: boolean;
  reference_shown: boolean;
  auto_completed: boolean;
  auto_write_attempted?: boolean;
}

export interface NextSpotResult {
  done: boolean;
  phase?: { id: string; title?: string; explainer_md?: string };
  spot?: SpotView;
  ladder?: LadderState;
  error?: string;
}

const DEFAULT_LADDER: LadderState = {
  hint_used: false,
  reference_shown: false,
  auto_completed: false,
  auto_write_attempted: false,
};

export async function runNextSpot({
  projectRoot,
}: {
  projectRoot: string;
}): Promise<NextSpotResult> {
  // L002 carry-forward: outputStyleOk gate runs BEFORE any state load
  const styleCheck = await probeOutputStyle();
  if (!styleCheck.ok) {
    return { done: false, error: 'output-style-disabled' };
  }

  // Load state
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'corrupt') {
    return { done: false, error: `State corrupt: ${stateResult.message}` };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return { done: false, error: `State schema mismatch: ${stateResult.message}` };
  }
  if (stateResult.kind === 'absent' || !stateResult.state.selected_path) {
    return { done: false, error: 'No path selected. Call selectPath first.' };
  }

  const state = stateResult.state;
  const slug = state.selected_path;

  // Load phases
  let phasesData: Awaited<ReturnType<typeof loadPhases>>;
  try {
    phasesData = await loadPhases(projectRoot, slug);
  } catch (err) {
    return { done: false, error: `Failed to load phases: ${String(err)}` };
  }

  // Get current spot
  const current = getCurrentSpot(state, phasesData);
  if (current.done) {
    return { done: true };
  }

  const { phase, spot } = current;

  // Ensure the spot has full fields (not a stub spot)
  if (
    spot.target_file === undefined ||
    spot.target_range === undefined ||
    spot.prompt === undefined ||
    spot.verification === undefined
  ) {
    return { done: false, error: `Spot ${spot.id} is a stub spot (incomplete fields); cannot render` };
  }

  const personalization = state.personalization as Record<string, unknown>;

  // Substitute prompt only — NOT target_file, target_range, or verification fields
  const substitutedPrompt = substitutePromptOnly(spot.prompt, personalization);

  // Build doc_links as path-only entries (cycle-4 baseline)
  const doc_links: DocLink[] | undefined = spot.doc_links
    ? spot.doc_links.map((p) => ({ path: p }))
    : undefined;

  const spotView: SpotView = {
    id: spot.id,
    target_file: spot.target_file,       // byte-for-byte from manifest
    target_range: spot.target_range,     // byte-for-byte from manifest
    prompt: substitutedPrompt,
    verification: spot.verification,      // byte-for-byte from manifest
  };
  if (spot.title !== undefined) spotView.title = spot.title;
  if (spot.rungs !== undefined) spotView.rungs = spot.rungs;
  if (doc_links !== undefined) spotView.doc_links = doc_links;

  // Ladder state for current spot
  const ladderRung = state.ladder[spot.id];
  const ladder: LadderState = ladderRung
    ? {
        hint_used: ladderRung.hint_used,
        reference_shown: ladderRung.reference_shown,
        auto_completed: ladderRung.auto_completed,
        auto_write_attempted: ladderRung.auto_write_attempted,
      }
    : { ...DEFAULT_LADDER };

  const phaseView: { id: string; title?: string; explainer_md?: string } = { id: phase.id };
  if (phase.title !== undefined) phaseView.title = phase.title;
  if (phase.explainer_md !== undefined) phaseView.explainer_md = phase.explainer_md;

  return {
    done: false,
    phase: phaseView,
    spot: spotView,
    ladder,
  };
}

// Alias export expected by tests
export const nextSpot = runNextSpot;
