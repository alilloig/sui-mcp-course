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

export async function loadPhases(projectRoot: string, slug: string): Promise<PhasesData> {
  const phasesPath = path.join(projectRoot, 'paths', slug, 'phases.json');

  let raw: string;
  try {
    raw = await fsPromises.readFile(phasesPath, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    throw new LoadPhasesError(slug, `phases.json not found for slug '${slug}': ${e.message ?? String(e)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr) {
    throw new LoadPhasesError(slug, `Failed to parse phases.json for slug '${slug}': ${(parseErr as Error).message ?? String(parseErr)}`);
  }

  const result = validatePhases(parsed);
  if (!result.ok) {
    throw new LoadPhasesError(slug, `phases.json schema validation failed for '${slug}': ${result.error}`);
  }

  return result.value;
}

export type GetCurrentSpotResult =
  | { done: true }
  | { done?: false; phase: PhaseData; spot: SpotData };

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

  return { phase, spot };
}

// Sentinel phase_id indicating the cursor has walked past the end.
const DONE_PHASE_ID = '__done__';

export function advanceCursor(state: State, phases: PhasesData): State {
  const { phase_id, spot_id } = state.cursor;

  // If already done, throw.
  if (phase_id === DONE_PHASE_ID) {
    throw new Error('Cursor is already past the end (done). Cannot advance further.');
  }

  const phaseIdx = phases.phases.findIndex((p) => p.id === phase_id);
  if (phaseIdx === -1) {
    throw new Error(`Cursor phase '${phase_id}' not found in phases manifest. Cannot advance.`);
  }

  const phase = phases.phases[phaseIdx];
  const spotIdx = phase.spots.findIndex((s) => s.id === spot_id);
  if (spotIdx === -1) {
    throw new Error(`Cursor spot '${spot_id}' not found in phase '${phase_id}'. Cannot advance.`);
  }

  // Next spot within same phase?
  if (spotIdx + 1 < phase.spots.length) {
    const nextSpot = phase.spots[spotIdx + 1];
    return {
      ...state,
      cursor: { phase_id, spot_id: nextSpot.id },
    };
  }

  // Move to first spot of next phase.
  if (phaseIdx + 1 < phases.phases.length) {
    const nextPhase = phases.phases[phaseIdx + 1];
    const nextSpot = nextPhase.spots[0];
    return {
      ...state,
      cursor: { phase_id: nextPhase.id, spot_id: nextSpot.id },
    };
  }

  // Past the last spot of last phase — mark as done.
  return {
    ...state,
    cursor: { phase_id: DONE_PHASE_ID, spot_id: '' },
  };
}
