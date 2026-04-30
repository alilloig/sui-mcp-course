import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { validatePhases } from './schemas/phases.js';
import type { PhasesData, PhaseData, SpotData } from './schemas/phases.js';
import type { State } from './schemas/state.js';

export type { PhasesData, PhaseData, SpotData };

export class LoadPhasesError extends Error {
  public readonly slug: string;

  constructor(slug: string, message: string) {
    super(message);
    this.name = 'LoadPhasesError';
    this.slug = slug;
  }
}

/**
 * Load and validate phases.json for the given slug from projectRoot/paths/<slug>/phases.json.
 * Throws LoadPhasesError for missing, malformed, or schema-invalid files.
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
  } catch (err) {
    throw new LoadPhasesError(
      slug,
      `Failed to parse phases.json for slug '${slug}': ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const validation = validatePhases(parsed);
  if (!validation.ok) {
    throw new LoadPhasesError(
      slug,
      `phases.json schema validation failed for slug '${slug}': ${validation.error}`,
    );
  }

  return validation.value;
}

export type GetCurrentSpotResult =
  | { done: false; phase: PhaseData; spot: SpotData }
  | { done: true };

/**
 * Resolve the current phase and spot from state.cursor against the phases manifest.
 * Returns { done: true } when the cursor references a phase/spot not in the manifest
 * (including when cursor.phase_id === '__done__' after advanceCursor walks off the end).
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
 * Advance the cursor to the next spot. Returns a new state (immutable update).
 * Throws if called when already past the end (done state).
 * When advancing past the last spot of the last phase, sets cursor to a
 * sentinel { phase_id: '__done__', spot_id: '__done__' } so getCurrentSpot
 * returns { done: true } on the next call.
 */
export function advanceCursor(state: State, phases: PhasesData): State {
  const { phase_id, spot_id } = state.cursor;

  // Check if already in done position
  if (phase_id === '__done__' && spot_id === '__done__') {
    throw new Error('Cannot advance cursor: already past the end of the path (done)');
  }

  const phaseIndex = phases.phases.findIndex((p) => p.id === phase_id);
  if (phaseIndex === -1) {
    throw new Error(`Cannot advance cursor: current phase '${phase_id}' not found in manifest`);
  }

  const phase = phases.phases[phaseIndex]!;
  const spotIndex = phase.spots.findIndex((s) => s.id === spot_id);
  if (spotIndex === -1) {
    throw new Error(`Cannot advance cursor: current spot '${spot_id}' not found in phase '${phase_id}'`);
  }

  let newCursor: { phase_id: string; spot_id: string };

  // Try next spot in same phase
  if (spotIndex + 1 < phase.spots.length) {
    newCursor = {
      phase_id,
      spot_id: phase.spots[spotIndex + 1]!.id,
    };
  } else if (phaseIndex + 1 < phases.phases.length) {
    // Advance to first spot of next phase
    const nextPhase = phases.phases[phaseIndex + 1]!;
    newCursor = {
      phase_id: nextPhase.id,
      spot_id: nextPhase.spots[0]!.id,
    };
  } else {
    // Past the end — mark done with sentinel
    newCursor = { phase_id: '__done__', spot_id: '__done__' };
  }

  return {
    ...state,
    cursor: newCursor,
  };
}
