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
export async function loadPhases(
  projectRoot: string,
  slug: string,
): Promise<PhasesData> {
  const phasesPath = path.join(projectRoot, 'paths', slug, 'phases.json');
  let raw: string;
  try {
    raw = await fsPromises.readFile(phasesPath, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    throw new LoadPhasesError(
      slug,
      `phases.json not found for '${slug}': ${e.message ?? String(e)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new LoadPhasesError(
      slug,
      `Failed to parse phases.json for '${slug}': ${(err as Error).message ?? String(err)}`,
    );
  }

  const validation = validatePhases(parsed);
  if (!validation.ok) {
    throw new LoadPhasesError(
      slug,
      `Invalid phases.json for '${slug}': ${validation.error}`,
    );
  }

  return validation.value;
}

export type GetCurrentSpotResult =
  | { done: false; phase: PhaseData; spot: SpotData }
  | { done: true };

/**
 * Resolve the current phase/spot from state.cursor against phases data.
 * Returns { done: true } when the cursor has walked off the end.
 */
export function getCurrentSpot(state: State, phases: PhasesData): GetCurrentSpotResult {
  const cursor = state.cursor;
  const phase = phases.phases.find((p) => p.id === cursor.phase_id);
  if (!phase) {
    return { done: true };
  }
  const spot = phase.spots.find((s) => s.id === cursor.spot_id);
  if (!spot) {
    return { done: true };
  }
  return { done: false, phase, spot };
}

/**
 * Advance the cursor to the next spot (across phase boundaries).
 * Returns a new State with the updated cursor.
 * Throws if already at done position.
 */
export function advanceCursor(state: State, phases: PhasesData): State {
  const cursor = state.cursor;
  const phaseIndex = phases.phases.findIndex((p) => p.id === cursor.phase_id);

  if (phaseIndex === -1) {
    throw new Error(
      `Cannot advance cursor: already past the end (phase '${cursor.phase_id}' not found in phases).`,
    );
  }

  const phase = phases.phases[phaseIndex];
  const spotIndex = phase.spots.findIndex((s) => s.id === cursor.spot_id);

  if (spotIndex === -1) {
    throw new Error(
      `Cannot advance cursor: already past the end (spot '${cursor.spot_id}' not found in phase '${cursor.phase_id}').`,
    );
  }

  // Move to next spot in same phase
  if (spotIndex < phase.spots.length - 1) {
    const nextSpot = phase.spots[spotIndex + 1];
    return {
      ...state,
      cursor: { phase_id: phase.id, spot_id: nextSpot.id },
    };
  }

  // Move to first spot of next phase
  if (phaseIndex < phases.phases.length - 1) {
    const nextPhase = phases.phases[phaseIndex + 1];
    const firstSpot = nextPhase.spots[0];
    return {
      ...state,
      cursor: { phase_id: nextPhase.id, spot_id: firstSpot.id },
    };
  }

  // Already at the last spot of the last phase — move to a "done" marker.
  // Use a sentinel phase_id that won't match any real phase, so
  // getCurrentSpot returns { done: true }.
  return {
    ...state,
    cursor: { phase_id: '__done__', spot_id: '__done__' },
  };
}
