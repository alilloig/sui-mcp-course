export interface SpotData {
  id: string;
  title?: string;
}

export interface PhaseData {
  id: string;
  spots: SpotData[];
}

export interface PhasesData {
  phases: PhaseData[];
}

type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function validatePhases(v: unknown): ValidateResult<PhasesData> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return { ok: false, error: 'phases.json must be an object' };
  }
  const obj = v as Record<string, unknown>;

  if (!Array.isArray(obj['phases'])) {
    return { ok: false, error: 'missing required field: phases (must be an array)' };
  }

  const phases = obj['phases'] as unknown[];
  if (phases.length === 0) {
    return { ok: false, error: 'phases array must have at least one phase' };
  }

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (typeof phase !== 'object' || phase === null || Array.isArray(phase)) {
      return { ok: false, error: `phase[${i}] must be an object` };
    }
    const phaseObj = phase as Record<string, unknown>;
    if (typeof phaseObj['id'] !== 'string') {
      return { ok: false, error: `phase[${i}] missing required field: id` };
    }
    if (!Array.isArray(phaseObj['spots'])) {
      return { ok: false, error: `phase[${i}] (id=${phaseObj['id']}) missing required field: spots` };
    }
    const spots = phaseObj['spots'] as unknown[];
    if (spots.length === 0) {
      return {
        ok: false,
        error: `phase ${phaseObj['id']} has zero spots; each phase must have at least one spot`,
      };
    }
    for (let j = 0; j < spots.length; j++) {
      const spot = spots[j];
      if (typeof spot !== 'object' || spot === null || Array.isArray(spot)) {
        return { ok: false, error: `phase[${i}].spots[${j}] must be an object` };
      }
      const spotObj = spot as Record<string, unknown>;
      if (typeof spotObj['id'] !== 'string') {
        return { ok: false, error: `phase[${i}].spots[${j}] missing required field: id` };
      }
    }
  }

  return {
    ok: true,
    value: {
      phases: phases as PhaseData[],
    },
  };
}
