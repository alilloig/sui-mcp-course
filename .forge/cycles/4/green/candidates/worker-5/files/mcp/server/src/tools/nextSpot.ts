import { loadState } from '../state.js';
import { loadPhases, getCurrentSpot } from '../phaseEngine.js';
import { substitutePromptOnly } from '../personalization.js';

export interface NextSpotArgs {
  projectRoot: string;
}

export interface DocLinkEntry {
  path: string;
}

export interface SpotView {
  id: string;
  target_file: string;
  target_range: string;
  prompt: string;
  verification: unknown;
  doc_links?: DocLinkEntry[];
  rungs?: unknown;
}

export interface LadderState {
  hint_used: boolean;
  reference_shown: boolean;
  auto_completed: boolean;
  auto_write_attempted: boolean;
}

export interface PhaseView {
  id: string;
  title?: string;
  explainer_md?: string;
}

export type NextSpotResult =
  | { done: true; spot?: undefined; phase?: undefined; ladder?: undefined }
  | { done?: false; phase: PhaseView; spot: SpotView; ladder: LadderState };

const DEFAULT_LADDER: LadderState = {
  hint_used: false,
  reference_shown: false,
  auto_completed: false,
  auto_write_attempted: false,
};

export async function nextSpot(args: NextSpotArgs): Promise<NextSpotResult | { error: string }> {
  const { projectRoot } = args;

  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'absent') {
    return { error: 'No path selected. Call selectPath first.' };
  }
  if (stateResult.kind === 'corrupt' || stateResult.kind === 'schema-mismatch') {
    return { error: `State recovery required (${stateResult.kind})` };
  }

  const state = stateResult.state;

  if (!state.selected_path) {
    return { error: 'No path selected. Call selectPath first.' };
  }

  let phases;
  try {
    phases = await loadPhases(projectRoot, state.selected_path);
  } catch (err) {
    return { error: `Failed to load phases: ${(err as Error).message ?? String(err)}` };
  }

  const spotResult = getCurrentSpot(state, phases);

  if (spotResult.done) {
    return { done: true };
  }

  const { phase, spot } = spotResult;

  // Substitute prompt ONLY — never substitute target_file, target_range, or verification fields.
  const personalization = state.personalization as Record<string, unknown>;
  const substitutedPrompt = substitutePromptOnly(spot.prompt, personalization);

  // Build doc_links as { path } entries — verbatim from manifest, no inline-fetch.
  const docLinks: DocLinkEntry[] | undefined = spot.doc_links
    ? spot.doc_links.map((p) => ({ path: p }))
    : undefined;

  const spotView: SpotView = {
    id: spot.id,
    // target_file and target_range are byte-for-byte from manifest (NO substitution).
    target_file: spot.target_file,
    target_range: spot.target_range,
    prompt: substitutedPrompt,
    // verification is verbatim from manifest (NO substitution).
    verification: spot.verification,
    ...(docLinks !== undefined ? { doc_links: docLinks } : {}),
    ...(spot.rungs !== undefined ? { rungs: spot.rungs } : {}),
  };

  const ladderRung = state.ladder[spot.id] ?? DEFAULT_LADDER;
  const rawAwa = (ladderRung as Record<string, unknown>)['auto_write_attempted'];
  const ladderState: LadderState = {
    hint_used: typeof ladderRung.hint_used === 'boolean' ? ladderRung.hint_used : false,
    reference_shown: typeof ladderRung.reference_shown === 'boolean' ? ladderRung.reference_shown : false,
    auto_completed: typeof ladderRung.auto_completed === 'boolean' ? ladderRung.auto_completed : false,
    auto_write_attempted: typeof rawAwa === 'boolean' ? rawAwa : false,
  };

  return {
    phase: {
      id: phase.id,
      ...(phase.title !== undefined ? { title: phase.title } : {}),
      ...(phase.explainer_md !== undefined ? { explainer_md: phase.explainer_md } : {}),
    },
    spot: spotView,
    ladder: ladderState,
  };
}
