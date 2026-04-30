import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { validatePhases } from './schemas/phases.js';
import type { PhasesData, PhaseData, SpotData } from './schemas/phases.js';
import type { State } from './schemas/state.js';

export type { PhasesData, PhaseData, SpotData };

export class LoadPhasesError extends Error {
  slug: string;
  constructor(slug: string, message: string) {
    super(message);
    this.name = 'LoadPhasesError';
    this.slug = slug;
  }
}

/**
 * Load and validate phases.json for the given slug from projectRoot.
 * Throws LoadPhasesError on missing, malformed, or schema-invalid phases.json.
 */
export async function loadPhases(projectRoot: string, slug: string): Promise<PhasesData> {
  const phasesPath = path.join(projectRoot, 'paths', slug, 'phases.json');

  let raw: string;
  try {
    raw = await fsPromises.readFile(phasesPath, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    throw new LoadPhasesError(
      slug,
      `phases.json not found for slug '${slug}': ${e.message ?? String(e)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr) {
    throw new LoadPhasesError(
      slug,
      `phases.json for slug '${slug}' failed to parse: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    );
  }

  const validation = validatePhases(parsed);
  if (!validation.ok) {
    throw new LoadPhasesError(
      slug,
      `phases.json for slug '${slug}' is schema-invalid: ${validation.error}`,
    );
  }

  return validation.value;
}

export type GetCurrentSpotResult =
  | { done: false; phase: PhaseData; spot: SpotData }
  | { done: true };

/**
 * Returns the current phase and spot based on state.cursor.
 * Returns { done: true } if the cursor points outside the manifest (e.g. end-of-path).
 */
export function getCurrentSpot(state: State, phases: PhasesData): GetCurrentSpotResult {
  const { phase_id, spot_id } = state.cursor;

  const phase = phases.phases.find((p) => p.id === phase_id);
  if (!phase) {
    return { done: true };
  }

  const spot = phase.spots.find((s) => s.id === spot_id);
  if (!spot) {
    return { done: true };
  }

  return { done: false, phase, spot };
}

/**
 * Advance the cursor to the next spot (or next phase's first spot).
 * When the last spot of the last phase is advanced, the cursor is set to a
 * sentinel value whose phase_id is absent from the manifest so that
 * getCurrentSpot returns { done: true }.
 * Throws if called when already done.
 */
export function advanceCursor(state: State, phases: PhasesData): State {
  const current = getCurrentSpot(state, phases);
  if (current.done) {
    throw new Error('advanceCursor called past the end — path is already done.');
  }

  const { phase, spot } = current;
  const phaseIdx = phases.phases.findIndex((p) => p.id === phase.id);
  const spotIdx = phase.spots.findIndex((s) => s.id === spot.id);

  // Try to advance within the same phase
  if (spotIdx + 1 < phase.spots.length) {
    const nextSpot = phase.spots[spotIdx + 1];
    return {
      ...state,
      cursor: { phase_id: phase.id, spot_id: nextSpot.id },
    };
  }

  // Try to advance to the first spot of the next phase
  if (phaseIdx + 1 < phases.phases.length) {
    const nextPhase = phases.phases[phaseIdx + 1];
    const firstSpot = nextPhase.spots[0];
    return {
      ...state,
      cursor: { phase_id: nextPhase.id, spot_id: firstSpot.id },
    };
  }

  // End of path — set cursor to a done sentinel
  return {
    ...state,
    cursor: { phase_id: '__done__', spot_id: '__done__' },
  };
}
