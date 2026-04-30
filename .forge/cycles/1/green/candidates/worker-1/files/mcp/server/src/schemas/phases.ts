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

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function validatePhases(v: unknown): ValidationResult<PhasesData> {
  if (typeof v !== 'object' || v === null) {
    return { ok: false, error: 'phases.json must be an object' };
  }
  const obj = v as Record<string, unknown>;

  if (!Array.isArray(obj['phases'])) {
    return { ok: false, error: 'Missing required field: phases (must be an array)' };
  }

  const phases = obj['phases'] as unknown[];
  if (phases.length === 0) {
    return { ok: false, error: 'phases array must have at least one phase' };
  }

  for (const phase of phases) {
    if (typeof phase !== 'object' || phase === null) {
      return { ok: false, error: 'Each phase must be an object' };
    }
    const p = phase as Record<string, unknown>;
    if (typeof p['id'] !== 'string') {
      return { ok: false, error: 'Each phase must have a string id' };
    }
    if (!Array.isArray(p['spots'])) {
      return { ok: false, error: `Phase ${p['id']}: spots must be an array` };
    }
    if ((p['spots'] as unknown[]).length === 0) {
      return { ok: false, error: `Phase ${p['id'] as string}: spots array must have at least one spot` };
    }
    for (const spot of p['spots'] as unknown[]) {
      if (typeof spot !== 'object' || spot === null) {
        return { ok: false, error: `Phase ${p['id'] as string}: each spot must be an object` };
      }
      const s = spot as Record<string, unknown>;
      if (typeof s['id'] !== 'string') {
        return { ok: false, error: `Phase ${p['id'] as string}: each spot must have a string id` };
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
