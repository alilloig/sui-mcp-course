export interface VerificationSpec {
  mode: 'compile' | 'test' | 'simulate' | 'custom';
  command?: string;
  expected_pass?: number;
  endpoint?: string;
  expected_status?: number;
  expected_stdout_regex?: string;
}

export interface RunsData {
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
  rungs?: RunsData;
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
      // Cycle-4 schema tightening: require target_file, target_range, prompt, verification
      if (typeof s['target_file'] !== 'string') {
        return { ok: false, error: `Phase ${p['id'] as string}, spot ${s['id'] as string}: target_file must be a string` };
      }
      if (typeof s['target_range'] !== 'string') {
        return { ok: false, error: `Phase ${p['id'] as string}, spot ${s['id'] as string}: target_range must be a string` };
      }
      if (typeof s['prompt'] !== 'string') {
        return { ok: false, error: `Phase ${p['id'] as string}, spot ${s['id'] as string}: prompt must be a string` };
      }
      // Validate verification block
      const verificationErr = validateVerification(s['verification'], p['id'] as string, s['id'] as string);
      if (verificationErr !== null) {
        return { ok: false, error: verificationErr };
      }
      // Validate rungs if present
      if (s['rungs'] !== undefined) {
        const rungsErr = validateRungs(s['rungs'], p['id'] as string, s['id'] as string);
        if (rungsErr !== null) {
          return { ok: false, error: rungsErr };
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

function validateVerification(v: unknown, phaseId: string, spotId: string): string | null {
  if (typeof v !== 'object' || v === null) {
    return `Phase ${phaseId}, spot ${spotId}: verification must be an object`;
  }
  const ver = v as Record<string, unknown>;
  const validModes = ['compile', 'test', 'simulate', 'custom'];
  if (!validModes.includes(ver['mode'] as string)) {
    return `Phase ${phaseId}, spot ${spotId}: verification.mode must be one of ${validModes.join(', ')}`;
  }
  const mode = ver['mode'] as string;
  if (mode === 'compile') {
    if (typeof ver['command'] !== 'string') {
      return `Phase ${phaseId}, spot ${spotId}: verification.command must be a string for compile mode`;
    }
  } else if (mode === 'test') {
    if (typeof ver['command'] !== 'string') {
      return `Phase ${phaseId}, spot ${spotId}: verification.command must be a string for test mode`;
    }
  } else if (mode === 'simulate') {
    if (typeof ver['endpoint'] !== 'string') {
      return `Phase ${phaseId}, spot ${spotId}: verification.endpoint must be a string for simulate mode`;
    }
    if (typeof ver['expected_status'] !== 'number') {
      return `Phase ${phaseId}, spot ${spotId}: verification.expected_status must be a number for simulate mode`;
    }
  } else if (mode === 'custom') {
    if (typeof ver['command'] !== 'string') {
      return `Phase ${phaseId}, spot ${spotId}: verification.command must be a string for custom mode`;
    }
    if (typeof ver['expected_stdout_regex'] !== 'string') {
      return `Phase ${phaseId}, spot ${spotId}: verification.expected_stdout_regex must be a string for custom mode`;
    }
  }
  return null;
}

function validateRungs(v: unknown, phaseId: string, spotId: string): string | null {
  if (typeof v !== 'object' || v === null) {
    return `Phase ${phaseId}, spot ${spotId}: rungs must be an object`;
  }
  const r = v as Record<string, unknown>;
  if (typeof r['hint_md'] !== 'string') {
    return `Phase ${phaseId}, spot ${spotId}: rungs.hint_md must be a string`;
  }
  if (typeof r['reference_md'] !== 'string') {
    return `Phase ${phaseId}, spot ${spotId}: rungs.reference_md must be a string`;
  }
  if (typeof r['auto_write_md'] !== 'string') {
    return `Phase ${phaseId}, spot ${spotId}: rungs.auto_write_md must be a string`;
  }
  return null;
}
