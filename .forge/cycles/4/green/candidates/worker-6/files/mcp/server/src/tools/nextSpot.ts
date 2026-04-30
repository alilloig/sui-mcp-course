import { loadState } from '../state.js';
import { loadPhases, getCurrentSpot } from '../phaseEngine.js';
import { substitutePromptOnly } from '../personalization.js';
import type { SpotData, PhaseData, VerificationSpec } from '../schemas/phases.js';
import type { LadderRung } from '../schemas/state.js';

export interface NextSpotArgs {
  projectRoot: string;
}

export interface DocLinkEntry {
  path: string;
}

export interface SpotView {
  id: string;
  title?: string;
  prompt: string;
  target_file: string;
  target_range: string;
  verification: VerificationSpec;
  rungs?: { hint_md: string; reference_md: string; auto_write_md: string };
  doc_links?: DocLinkEntry[];
}

export interface PhaseView {
  id: string;
  title?: string;
  explainer_md?: string;
}

export interface NextSpotResult {
  done: boolean;
  phase?: PhaseView;
  spot?: SpotView;
  ladder?: LadderRung;
  error?: string;
}

const DEFAULT_LADDER_RUNG: LadderRung = {
  hint_used: false,
  reference_shown: false,
  auto_completed: false,
  auto_write_attempted: false,
};

function buildSpotView(spot: SpotData, personalization: Record<string, unknown>): SpotView {
  // Only substitute the prompt — target_file, target_range, verification fields are copied verbatim
  const substitutedPrompt = substitutePromptOnly(spot.prompt, personalization);

  const view: SpotView = {
    id: spot.id,
    prompt: substitutedPrompt,
    target_file: spot.target_file,
    target_range: spot.target_range,
    verification: spot.verification,
  };

  if (spot.title !== undefined) {
    view.title = spot.title;
  }

  if (spot.rungs !== undefined) {
    view.rungs = spot.rungs;
  }

  if (spot.doc_links !== undefined) {
    view.doc_links = spot.doc_links.map((p) => ({ path: p }));
  }

  return view;
}

function buildPhaseView(phase: PhaseData): PhaseView {
  const view: PhaseView = { id: phase.id };
  if (phase.title !== undefined) view.title = phase.title;
  if (phase.explainer_md !== undefined) view.explainer_md = phase.explainer_md;
  return view;
}

export async function nextSpot(args: NextSpotArgs): Promise<NextSpotResult> {
  const { projectRoot } = args;

  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'absent') {
    return { done: false, error: 'No state found. No path selected — call selectPath first.' };
  }
  if (stateResult.kind === 'corrupt') {
    return { done: false, error: `State is corrupt: ${stateResult.message}` };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return { done: false, error: `State schema mismatch: ${stateResult.message}` };
  }

  const state = stateResult.state;

  if (!state.selected_path) {
    return { done: false, error: 'No path selected. Call selectPath before nextSpot.' };
  }

  let phases;
  try {
    phases = await loadPhases(projectRoot, state.selected_path);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { done: false, error: `Failed to load phases: ${message}` };
  }

  const currentResult = getCurrentSpot(state, phases);
  if (currentResult.done) {
    return { done: true };
  }

  const { phase, spot } = currentResult;
  const personalization = state.personalization as Record<string, unknown>;

  const spotView = buildSpotView(spot, personalization);
  const phaseView = buildPhaseView(phase);

  const ladder = state.ladder[spot.id] ?? { ...DEFAULT_LADDER_RUNG };

  return {
    done: false,
    phase: phaseView,
    spot: spotView,
    ladder,
  };
}
