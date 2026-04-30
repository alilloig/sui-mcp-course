import { loadState } from '../state.js';
import { loadPhases, getCurrentSpot } from '../phaseEngine.js';
import { substitutePromptOnly } from '../personalization.js';
import type { SpotData } from '../schemas/phases.js';
import type { LadderRung } from '../schemas/state.js';

const DEFAULT_RUNG: LadderRung = {
  hint_used: false,
  reference_shown: false,
  auto_completed: false,
  auto_write_attempted: false,
};

export interface DocLink {
  path: string;
}

export interface SpotView {
  id: string;
  title?: string;
  target_file: string;
  target_range: string;
  prompt: string;
  verification: unknown;
  doc_links?: DocLink[];
  rungs?: unknown;
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
}

export async function runNextSpot({
  projectRoot,
}: {
  projectRoot: string;
}): Promise<NextSpotResult> {
  // Load state
  const stateResult = await loadState(projectRoot);

  if (stateResult.kind !== 'ok') {
    if (stateResult.kind === 'absent') {
      return { done: false, phase: undefined, spot: undefined, ladder: undefined };
    }
    return { done: false, phase: undefined, spot: undefined, ladder: undefined };
  }

  const state = stateResult.state;

  if (!state.selected_path) {
    return { done: false, phase: undefined, spot: undefined, ladder: undefined };
  }

  // Load phases
  let phases: Awaited<ReturnType<typeof loadPhases>>;
  try {
    phases = await loadPhases(projectRoot, state.selected_path);
  } catch {
    return { done: false, phase: undefined, spot: undefined, ladder: undefined };
  }

  // Get current spot
  const spotResult = getCurrentSpot(state, phases);

  if (spotResult.done) {
    return { done: true };
  }

  const { phase, spot } = spotResult;

  // Build substituted spot view — ONLY substitute the prompt.
  // target_file, target_range, verification are passed byte-for-byte.
  const personalization = state.personalization as Record<string, unknown>;
  const substitutedPrompt = substitutePromptOnly(spot.prompt, personalization);

  // Build doc_links: path-only entries (cycle-4 baseline; no inline-fetch)
  const docLinks: DocLink[] | undefined = spot.doc_links
    ? spot.doc_links.map((p: string) => ({ path: p }))
    : undefined;

  // Build the spot view
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

  // Get ladder state for current spot (or default rung)
  const ladder = state.ladder[spot.id] ?? { ...DEFAULT_RUNG };

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
