import { loadState } from '../state.js';
import { loadPhases, getCurrentSpot } from '../phaseEngine.js';
import { substitutePromptOnly } from '../personalization.js';

export interface DocLink {
  path: string;
}

export interface SpotView {
  id: string;
  target_file: string;
  target_range: string;
  prompt: string;
  verification: unknown;
  doc_links?: DocLink[];
  rungs?: {
    hint_md: string;
    reference_md: string;
    auto_write_md: string;
  };
}

export interface PhaseView {
  id: string;
  title?: string;
  explainer_md?: string;
}

export interface LadderView {
  hint_used: boolean;
  reference_shown: boolean;
  auto_completed: boolean;
  auto_write_attempted?: boolean;
}

export type NextSpotResult =
  | { done: true }
  | { done: false; phase: PhaseView; spot: SpotView; ladder: LadderView }
  | { ok: false; errors: string[] };

export interface NextSpotArgs {
  projectRoot: string;
}

export async function nextSpot(args: NextSpotArgs): Promise<NextSpotResult> {
  const { projectRoot } = args;

  // Load state
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'absent') {
    return { ok: false, errors: ['No path selected. Call selectPath first.'] };
  }
  if (stateResult.kind === 'corrupt' || stateResult.kind === 'schema-mismatch') {
    return { ok: false, errors: [`State recovery required: ${stateResult.message}`] };
  }

  const state = stateResult.state;
  if (!state.selected_path) {
    return { ok: false, errors: ['selected_path is not set. Call selectPath first.'] };
  }

  // Load phases
  let phasesData;
  try {
    phasesData = await loadPhases(projectRoot, state.selected_path);
  } catch (err) {
    return { ok: false, errors: [`Failed to load phases: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const current = getCurrentSpot(state, phasesData);
  if (current.done) {
    return { done: true };
  }

  const { phase, spot } = current;

  // Build substituted spot view — only substitute prompt, NOT target_file/target_range/verification
  const substitutedPrompt = substitutePromptOnly(
    spot.prompt,
    state.personalization as unknown as Record<string, unknown>,
  );

  // Build doc_links as path-only entries (cycle-4 baseline)
  const docLinks: DocLink[] | undefined =
    Array.isArray(spot.doc_links) && spot.doc_links.length > 0
      ? (spot.doc_links as string[]).map((p) => ({ path: p }))
      : undefined;

  const spotView: SpotView = {
    id: spot.id,
    target_file: spot.target_file,
    target_range: spot.target_range,
    prompt: substitutedPrompt,
    verification: spot.verification,
    ...(docLinks ? { doc_links: docLinks } : {}),
    ...(spot.rungs ? { rungs: spot.rungs } : {}),
  };

  const phaseView: PhaseView = {
    id: phase.id,
    ...(phase.title ? { title: phase.title } : {}),
    ...(phase.explainer_md ? { explainer_md: phase.explainer_md } : {}),
  };

  // Build ladder view for this spot
  const existingRung = state.ladder[spot.id];
  const ladderView: LadderView = existingRung ?? {
    hint_used: false,
    reference_shown: false,
    auto_completed: false,
    auto_write_attempted: false,
  };

  return {
    done: false,
    phase: phaseView,
    spot: spotView,
    ladder: ladderView,
  };
}
