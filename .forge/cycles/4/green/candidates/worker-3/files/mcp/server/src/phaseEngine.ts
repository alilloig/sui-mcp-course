import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { validatePhases } from './schemas/phases.js';
import type { PhasesData, PhaseData, SpotData } from './schemas/phases.js';
import type { State } from './schemas/state.js';

export type { PhasesData, PhaseData, SpotData };

/**
 * Error thrown when phases.json is missing or invalid at runtime.
 * (The registry validates at scan time, but a path can disappear between scan and use.)
 */
export class LoadPhasesError extends Error {
  readonly slug: string;

  constructor(slug: string, message: string) {
    super(message);
    this.name = 'LoadPhasesError';
    this.slug = slug;
    Object.setPrototypeOf(this, LoadPhasesError.prototype);
  }
}

/**
 * Load and validate phases.json for a given path slug.
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
      `phases.json not found for path '${slug}': ${e.message ?? String(e)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new LoadPhasesError(
      slug,
      `phases.json for path '${slug}' is not valid JSON: parse failure — ${(err as Error).message}`,
    );
  }

  const validation = validatePhases(parsed);
  if (!validation.ok) {
    throw new LoadPhasesError(
      slug,
      `phases.json for path '${slug}' failed schema validation: ${validation.error}`,
    );
  }

  return validation.value;
}

export type CurrentSpotResult =
  | { done: false; phase: PhaseData; spot: SpotData }
  | { done: true };

/**
 * Resolve the current phase/spot from state.cursor.
 * Returns { done: true } when the cursor is past the end.
 */
export function getCurrentSpot(state: State, phases: PhasesData): CurrentSpotResult {
  const { phase_id, spot_id } = state.cursor;

  // Special sentinel for "done" — phase_id points to a non-existent phase
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
 * Advance the cursor to the next spot. Returns a new state (immutable).
 * Throws if the cursor is already past the end (done state).
 */
export function advanceCursor(state: State, phases: PhasesData): State {
  const current = getCurrentSpot(state, phases);
  if (current.done) {
    throw new Error('Cannot advance cursor: already done / past the end');
  }

  const { phase, spot } = current;
  const phaseIndex = phases.phases.findIndex((p) => p.id === phase.id);
  const spotIndex = phase.spots.findIndex((s) => s.id === spot.id);

  // Try next spot in same phase
  if (spotIndex < phase.spots.length - 1) {
    const nextSpot = phase.spots[spotIndex + 1]!;
    return {
      ...state,
      cursor: {
        phase_id: phase.id,
        spot_id: nextSpot.id,
      },
    };
  }

  // Move to first spot of next phase
  if (phaseIndex < phases.phases.length - 1) {
    const nextPhase = phases.phases[phaseIndex + 1]!;
    const firstSpot = nextPhase.spots[0]!;
    return {
      ...state,
      cursor: {
        phase_id: nextPhase.id,
        spot_id: firstSpot.id,
      },
    };
  }

  // We're at the last spot of the last phase — move to a done sentinel
  // Use a non-existent phase_id so getCurrentSpot returns { done: true }
  return {
    ...state,
    cursor: {
      phase_id: `${phase.id}__done`,
      spot_id: `${spot.id}__done`,
    },
  };
}
