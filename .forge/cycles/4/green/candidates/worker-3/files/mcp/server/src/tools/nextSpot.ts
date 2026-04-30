import { loadState } from '../state.js';
import { loadPhases, getCurrentSpot } from '../phaseEngine.js';
import type { VerificationSpec } from '../schemas/phases.js';
import { substitutePromptOnly } from '../personalization.js';

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
  doc_links?: DocLink[];
  rungs?: {
    hint_md: string;
    reference_md: string;
    auto_write_md: string;
  };
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

async function _nextSpot(args: { projectRoot: string }): Promise<NextSpotResult> {
  const { projectRoot } = args;

  // Load state
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'corrupt') {
    return { done: false, error: `State is corrupt: ${stateResult.message}` };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return { done: false, error: `State schema mismatch: ${stateResult.message}` };
  }
  if (stateResult.kind === 'absent') {
    return { done: false, error: 'No path selected. Call selectPath first.' };
  }

  const state = stateResult.state;

  if (!state.selected_path) {
    return { done: false, error: 'No path selected. Call selectPath first.' };
  }

  // Load phases
  let phasesData;
  try {
    phasesData = await loadPhases(projectRoot, state.selected_path);
  } catch (err) {
    return { done: false, error: `Failed to load phases: ${(err as Error).message}` };
  }

  const current = getCurrentSpot(state, phasesData);

  if (current.done) {
    return { done: true };
  }

  const { phase, spot } = current;

  // Build substituted prompt — ONLY substitute prompt, never target_file/target_range/verification
  const personalization = state.personalization as Record<string, unknown>;
  const substitutedPrompt = substitutePromptOnly(spot.prompt, personalization);

  // Build doc_links as path-only entries (cycle-4 baseline, no inline fetch)
  const docLinks: DocLink[] | undefined = spot.doc_links
    ? spot.doc_links.map((p) => ({ path: p }))
    : undefined;

  // Build spot view — target_file, target_range, verification copied verbatim (no substitution)
  const spotView: SpotView = {
    id: spot.id,
    ...(spot.title !== undefined ? { title: spot.title } : {}),
    target_file: spot.target_file,
    target_range: spot.target_range,
    prompt: substitutedPrompt,
    verification: spot.verification,
    ...(docLinks !== undefined ? { doc_links: docLinks } : {}),
    ...(spot.rungs !== undefined ? { rungs: spot.rungs } : {}),
  };

  // Get ladder state for this spot
  const ladderRung = state.ladder[spot.id];
  const ladder: LadderState = ladderRung
    ? {
        hint_used: ladderRung.hint_used,
        reference_shown: ladderRung.reference_shown,
        auto_completed: ladderRung.auto_completed,
        auto_write_attempted: ladderRung.auto_write_attempted,
      }
    : { ...DEFAULT_LADDER };

  return {
    done: false,
    phase: {
      id: phase.id,
      ...(phase.title !== undefined ? { title: phase.title } : {}),
      ...(phase.explainer_md !== undefined ? { explainer_md: phase.explainer_md } : {}),
    },
    spot: spotView,
    ladder,
  };
}

// Public exports
export const nextSpot = _nextSpot;
export const runNextSpot = _nextSpot;
