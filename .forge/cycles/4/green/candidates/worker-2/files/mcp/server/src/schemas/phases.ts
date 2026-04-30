export interface VerificationCompile {
  mode: 'compile';
  command: string;
}

export interface VerificationTest {
  mode: 'test';
  command: string;
  expected_pass?: number;
}

export interface VerificationSimulate {
  mode: 'simulate';
  endpoint: string;
  expected_status: number;
}

export interface VerificationCustom {
  mode: 'custom';
  command: string;
  expected_stdout_regex: string;
}

export type VerificationSpec =
  | VerificationCompile
  | VerificationTest
  | VerificationSimulate
  | VerificationCustom;

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
  [key: string]: unknown;
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

function validateVerification(v: unknown, phaseId: string, spotId: string): string | null {
  if (typeof v !== 'object' || v === null) {
    return `Phase ${phaseId} spot ${spotId}: verification must be an object`;
  }
  const vObj = v as Record<string, unknown>;
  const mode = vObj['mode'];
  if (mode !== 'compile' && mode !== 'test' && mode !== 'simulate' && mode !== 'custom') {
    return `Phase ${phaseId} spot ${spotId}: verification mode must be one of compile|test|simulate|custom (got: ${String(mode)})`;
  }
  if (mode === 'compile' || mode === 'test') {
    if (typeof vObj['command'] !== 'string') {
      return `Phase ${phaseId} spot ${spotId}: verification.command is required for mode '${mode}'`;
    }
  }
  if (mode === 'simulate') {
    if (typeof vObj['endpoint'] !== 'string') {
      return `Phase ${phaseId} spot ${spotId}: verification.endpoint is required for mode 'simulate'`;
    }
    if (typeof vObj['expected_status'] !== 'number') {
      return `Phase ${phaseId} spot ${spotId}: verification.expected_status is required for mode 'simulate'`;
    }
  }
  if (mode === 'custom') {
    if (typeof vObj['command'] !== 'string') {
      return `Phase ${phaseId} spot ${spotId}: verification.command is required for mode 'custom'`;
    }
    if (typeof vObj['expected_stdout_regex'] !== 'string') {
      return `Phase ${phaseId} spot ${spotId}: verification.expected_stdout_regex is required for mode 'custom'`;
    }
  }
  return null;
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

      // Cycle-4 tightening: if any of the new required fields is present, all must be present.
      // If none are present, the spot is a valid stub (backward-compat with cycle-1/2/3 fixtures).
      const hasAnyNewField =
        s['target_file'] !== undefined ||
        s['target_range'] !== undefined ||
        s['prompt'] !== undefined ||
        s['verification'] !== undefined;

      if (hasAnyNewField) {
        if (typeof s['target_file'] !== 'string') {
          return { ok: false, error: `Phase ${phaseId} spot ${spotId}: target_file must be a string` };
        }
        if (typeof s['target_range'] !== 'string') {
          return { ok: false, error: `Phase ${phaseId} spot ${spotId}: target_range must be a string` };
        }
        if (typeof s['prompt'] !== 'string') {
          return { ok: false, error: `Phase ${phaseId} spot ${spotId}: prompt must be a string` };
        }
        // Validate verification block
        const verErr = validateVerification(s['verification'], phaseId, spotId);
        if (verErr) {
          return { ok: false, error: verErr };
        }
        // If rungs is present, all three fields required
        if (s['rungs'] !== undefined) {
          if (typeof s['rungs'] !== 'object' || s['rungs'] === null) {
            return { ok: false, error: `Phase ${phaseId} spot ${spotId}: rungs must be an object` };
          }
          const r = s['rungs'] as Record<string, unknown>;
          if (typeof r['hint_md'] !== 'string') {
            return { ok: false, error: `Phase ${phaseId} spot ${spotId}: rungs.hint_md must be a string` };
          }
          if (typeof r['reference_md'] !== 'string') {
            return { ok: false, error: `Phase ${phaseId} spot ${spotId}: rungs.reference_md must be a string` };
          }
          if (typeof r['auto_write_md'] !== 'string') {
            return { ok: false, error: `Phase ${phaseId} spot ${spotId}: rungs.auto_write_md must be a string` };
          }
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
