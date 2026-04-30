export interface VerificationSpec {
  mode: 'compile' | 'test' | 'simulate' | 'custom';
  command?: string;
  expected_pass?: number;
  endpoint?: string;
  expected_status?: number;
  expected_stdout_regex?: string;
}

export interface SpotRungs {
  hint_md: string;
  reference_md: string;
  auto_write_md: string;
}

export interface SpotData {
  id: string;
  title?: string;
  target_file: string;
  target_range: string;
  prompt: string;
  verification: VerificationSpec;
  rungs?: SpotRungs;
  doc_links?: string[];
}

export interface PhaseData {
  id: string;
  title?: string;
  explainer_md?: string;
  spots: SpotData[];
}

export interface PhasesData {
  phases: PhaseData[];
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const VALID_MODES = new Set(['compile', 'test', 'simulate', 'custom']);

function validateVerification(v: unknown, phaseId: string, spotId: string): string | null {
  if (typeof v !== 'object' || v === null) {
    return `Phase ${phaseId} spot ${spotId}: verification must be an object`;
  }
  const obj = v as Record<string, unknown>;
  if (typeof obj['mode'] !== 'string' || !VALID_MODES.has(obj['mode'] as string)) {
    return `Phase ${phaseId} spot ${spotId}: verification.mode must be one of compile|test|simulate|custom`;
  }
  const mode = obj['mode'] as string;
  if (mode === 'compile' || mode === 'test') {
    if (typeof obj['command'] !== 'string') {
      return `Phase ${phaseId} spot ${spotId}: verification.command is required for mode '${mode}'`;
    }
  }
  if (mode === 'simulate') {
    if (typeof obj['endpoint'] !== 'string') {
      return `Phase ${phaseId} spot ${spotId}: verification.endpoint is required for simulate mode`;
    }
    if (typeof obj['expected_status'] !== 'number') {
      return `Phase ${phaseId} spot ${spotId}: verification.expected_status is required for simulate mode`;
    }
  }
  if (mode === 'custom') {
    if (typeof obj['command'] !== 'string') {
      return `Phase ${phaseId} spot ${spotId}: verification.command is required for custom mode`;
    }
    if (typeof obj['expected_stdout_regex'] !== 'string') {
      return `Phase ${phaseId} spot ${spotId}: verification.expected_stdout_regex is required for custom mode`;
    }
  }
  return null;
}

function validateRungs(v: unknown, phaseId: string, spotId: string): string | null {
  if (typeof v !== 'object' || v === null) {
    return `Phase ${phaseId} spot ${spotId}: rungs must be an object`;
  }
  const obj = v as Record<string, unknown>;
  if (typeof obj['hint_md'] !== 'string') {
    return `Phase ${phaseId} spot ${spotId}: rungs.hint_md must be a string`;
  }
  if (typeof obj['reference_md'] !== 'string') {
    return `Phase ${phaseId} spot ${spotId}: rungs.reference_md must be a string`;
  }
  if (typeof obj['auto_write_md'] !== 'string') {
    return `Phase ${phaseId} spot ${spotId}: rungs.auto_write_md must be a string`;
  }
  return null;
}

/**
 * Lenient structural validator used by scanRegistry.
 * Only checks: non-empty array, each phase has a string id and non-empty spots.
 * Does NOT require target_file / target_range / prompt / verification on spots —
 * those are cycle-4 phase-engine requirements enforced by validatePhases.
 * This lenience lets cycle-1 fixtures (minimal { id, title } spots) pass
 * the registry scan while T-043 (empty spots) is still caught.
 */
export function validatePhasesStructure(v: unknown): ValidationResult<{ phases: unknown[] }> {
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
    const phaseId = p['id'] as string;
    if (!Array.isArray(p['spots'])) {
      return { ok: false, error: `Phase ${phaseId}: spots must be an array` };
    }
    if ((p['spots'] as unknown[]).length === 0) {
      return { ok: false, error: `Phase ${phaseId}: spots array must have at least one spot` };
    }
  }
  return { ok: true, value: { phases } };
}

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
    const phaseId = p['id'] as string;
    if (!Array.isArray(p['spots'])) {
      return { ok: false, error: `Phase ${phaseId}: spots must be an array` };
    }
    if ((p['spots'] as unknown[]).length === 0) {
      return { ok: false, error: `Phase ${phaseId}: spots array must have at least one spot` };
    }
    for (const spot of p['spots'] as unknown[]) {
      if (typeof spot !== 'object' || spot === null) {
        return { ok: false, error: `Phase ${phaseId}: each spot must be an object` };
      }
      const s = spot as Record<string, unknown>;
      if (typeof s['id'] !== 'string') {
        return { ok: false, error: `Phase ${phaseId}: each spot must have a string id` };
      }
      const spotId = s['id'] as string;

      if (typeof s['target_file'] !== 'string') {
        return { ok: false, error: `Phase ${phaseId} spot ${spotId}: target_file must be a string` };
      }
      if (typeof s['target_range'] !== 'string') {
        return { ok: false, error: `Phase ${phaseId} spot ${spotId}: target_range must be a string` };
      }
      if (typeof s['prompt'] !== 'string') {
        return { ok: false, error: `Phase ${phaseId} spot ${spotId}: prompt must be a string` };
      }
      if (s['verification'] === undefined || s['verification'] === null) {
        return { ok: false, error: `Phase ${phaseId} spot ${spotId}: verification is required` };
      }
      const verifError = validateVerification(s['verification'], phaseId, spotId);
      if (verifError) {
        return { ok: false, error: verifError };
      }
      if (s['rungs'] !== undefined && s['rungs'] !== null) {
        const rungsError = validateRungs(s['rungs'], phaseId, spotId);
        if (rungsError) {
          return { ok: false, error: rungsError };
        }
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
