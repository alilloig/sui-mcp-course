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
  doc_links?: string[];
  rungs?: SpotRungs;
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

function validateVerification(v: unknown, phaseId: string, spotId: string): ValidationResult<VerificationSpec> {
  if (typeof v !== 'object' || v === null) {
    return { ok: false, error: `Phase ${phaseId} spot ${spotId}: verification must be an object` };
  }
  const obj = v as Record<string, unknown>;
  const mode = obj['mode'];

  if (typeof mode !== 'string' || !['compile', 'test', 'simulate', 'custom'].includes(mode)) {
    return { ok: false, error: `Phase ${phaseId} spot ${spotId}: verification.mode must be one of compile|test|simulate|custom` };
  }

  if (mode === 'compile') {
    if (typeof obj['command'] !== 'string') {
      return { ok: false, error: `Phase ${phaseId} spot ${spotId}: verification.command is required for compile mode` };
    }
    return { ok: true, value: { mode: 'compile', command: obj['command'] as string } };
  }

  if (mode === 'test') {
    if (typeof obj['command'] !== 'string') {
      return { ok: false, error: `Phase ${phaseId} spot ${spotId}: verification.command is required for test mode` };
    }
    return {
      ok: true,
      value: {
        mode: 'test',
        command: obj['command'] as string,
        ...(typeof obj['expected_pass'] === 'number' ? { expected_pass: obj['expected_pass'] as number } : {}),
      },
    };
  }

  if (mode === 'simulate') {
    if (typeof obj['endpoint'] !== 'string') {
      return { ok: false, error: `Phase ${phaseId} spot ${spotId}: verification.endpoint is required for simulate mode` };
    }
    if (typeof obj['expected_status'] !== 'number') {
      return { ok: false, error: `Phase ${phaseId} spot ${spotId}: verification.expected_status is required for simulate mode` };
    }
    return {
      ok: true,
      value: {
        mode: 'simulate',
        endpoint: obj['endpoint'] as string,
        expected_status: obj['expected_status'] as number,
      },
    };
  }

  // mode === 'custom'
  if (typeof obj['command'] !== 'string') {
    return { ok: false, error: `Phase ${phaseId} spot ${spotId}: verification.command is required for custom mode` };
  }
  if (typeof obj['expected_stdout_regex'] !== 'string') {
    return { ok: false, error: `Phase ${phaseId} spot ${spotId}: verification.expected_stdout_regex is required for custom mode` };
  }
  return {
    ok: true,
    value: {
      mode: 'custom',
      command: obj['command'] as string,
      expected_stdout_regex: obj['expected_stdout_regex'] as string,
    },
  };
}

/**
 * Lightweight structural validation for registry scanning.
 * Only checks that phases is a non-empty array and each phase has spots.
 * Does NOT require target_file/target_range/prompt/verification (those are
 * enforced by the full validatePhases used at runtime via loadPhases).
 */
export function validatePhasesStructure(v: unknown): ValidationResult<PhasesData> {
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
    value: { phases: phases as PhaseData[] },
  };
}

/**
 * Full validation for phases.json.
 *
 * Spots that declare any execution fields (target_file, target_range, prompt,
 * verification) must declare ALL of them. A spot with only `id` (and optional
 * `title`) is a valid stub that passes this validator — this preserves
 * backward-compat with cycle-1/2/3 registry fixture helpers that create
 * minimal stub spots. The stricter "fully-populated spot" check is only
 * triggered when the spot itself opts into the execution shape.
 */
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

  const validatedPhases: PhaseData[] = [];

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

    const validatedSpots: SpotData[] = [];

    for (const spot of p['spots'] as unknown[]) {
      if (typeof spot !== 'object' || spot === null) {
        return { ok: false, error: `Phase ${phaseId}: each spot must be an object` };
      }
      const s = spot as Record<string, unknown>;
      if (typeof s['id'] !== 'string') {
        return { ok: false, error: `Phase ${phaseId}: each spot must have a string id` };
      }
      const spotId = s['id'] as string;

      // Determine whether this spot declares any execution fields.
      // A spot with only id (+title) is a valid stub that needs no further
      // validation. Once any execution field appears, all four are required.
      const hasExecFields =
        s['target_file'] !== undefined ||
        s['target_range'] !== undefined ||
        s['prompt'] !== undefined ||
        s['verification'] !== undefined;

      if (hasExecFields) {
        if (typeof s['target_file'] !== 'string') {
          return { ok: false, error: `Phase ${phaseId} spot ${spotId}: target_file must be a string` };
        }
        if (typeof s['target_range'] !== 'string') {
          return { ok: false, error: `Phase ${phaseId} spot ${spotId}: target_range must be a string` };
        }
        if (typeof s['prompt'] !== 'string') {
          return { ok: false, error: `Phase ${phaseId} spot ${spotId}: prompt must be a string` };
        }

        const verResult = validateVerification(s['verification'], phaseId, spotId);
        if (!verResult.ok) {
          return { ok: false, error: verResult.error };
        }

        // Validate rungs if present
        let rungs: SpotRungs | undefined;
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
          rungs = {
            hint_md: r['hint_md'] as string,
            reference_md: r['reference_md'] as string,
            auto_write_md: r['auto_write_md'] as string,
          };
        }

        const docLinks: string[] | undefined = Array.isArray(s['doc_links'])
          ? (s['doc_links'] as unknown[]).filter((d): d is string => typeof d === 'string')
          : undefined;

        validatedSpots.push({
          id: spotId,
          ...(typeof s['title'] === 'string' ? { title: s['title'] } : {}),
          target_file: s['target_file'] as string,
          target_range: s['target_range'] as string,
          prompt: s['prompt'] as string,
          verification: verResult.value,
          ...(docLinks !== undefined ? { doc_links: docLinks } : {}),
          ...(rungs !== undefined ? { rungs } : {}),
        });
      } else {
        // Stub spot: only id and optional title are present.
        // Cast to SpotData with empty-string placeholders — these stubs are
        // only used by registry scanning; loadPhases enforces full population
        // at runtime so stub spots never reach the phase engine.
        validatedSpots.push({
          id: spotId,
          ...(typeof s['title'] === 'string' ? { title: s['title'] } : {}),
          target_file: '',
          target_range: '',
          prompt: '',
          verification: { mode: 'compile', command: '' },
        });
      }
    }

    validatedPhases.push({
      id: phaseId,
      ...(typeof p['title'] === 'string' ? { title: p['title'] } : {}),
      ...(typeof p['explainer_md'] === 'string' ? { explainer_md: p['explainer_md'] } : {}),
      spots: validatedSpots,
    });
  }

  return {
    ok: true,
    value: {
      phases: validatedPhases,
    },
  };
}
