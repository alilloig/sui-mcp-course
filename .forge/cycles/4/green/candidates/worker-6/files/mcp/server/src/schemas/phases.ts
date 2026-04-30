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
  prompt: string;
  target_file: string;
  target_range: string;
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

function validateVerification(v: unknown, spotId: string): ValidationResult<VerificationSpec> {
  if (typeof v !== 'object' || v === null) {
    return { ok: false, error: `Spot ${spotId}: verification must be an object` };
  }
  const obj = v as Record<string, unknown>;

  const mode = obj['mode'];
  if (typeof mode !== 'string') {
    return { ok: false, error: `Spot ${spotId}: verification.mode must be a string` };
  }

  if (mode === 'compile') {
    if (typeof obj['command'] !== 'string') {
      return { ok: false, error: `Spot ${spotId}: verification.command is required for compile mode` };
    }
    return { ok: true, value: { mode: 'compile', command: obj['command'] as string } };
  }

  if (mode === 'test') {
    if (typeof obj['command'] !== 'string') {
      return { ok: false, error: `Spot ${spotId}: verification.command is required for test mode` };
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
      return { ok: false, error: `Spot ${spotId}: verification.endpoint is required for simulate mode` };
    }
    if (typeof obj['expected_status'] !== 'number') {
      return { ok: false, error: `Spot ${spotId}: verification.expected_status is required for simulate mode` };
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

  if (mode === 'custom') {
    if (typeof obj['command'] !== 'string') {
      return { ok: false, error: `Spot ${spotId}: verification.command is required for custom mode` };
    }
    if (typeof obj['expected_stdout_regex'] !== 'string') {
      return { ok: false, error: `Spot ${spotId}: verification.expected_stdout_regex is required for custom mode` };
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

  return { ok: false, error: `Spot ${spotId}: verification.mode must be one of compile|test|simulate|custom, got '${mode}'` };
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

      if (typeof s['target_file'] !== 'string') {
        return { ok: false, error: `Spot ${spotId}: target_file must be a string` };
      }
      if (typeof s['target_range'] !== 'string') {
        return { ok: false, error: `Spot ${spotId}: target_range must be a string` };
      }
      if (typeof s['prompt'] !== 'string') {
        return { ok: false, error: `Spot ${spotId}: prompt must be a string` };
      }

      const verResult = validateVerification(s['verification'], spotId);
      if (!verResult.ok) {
        return { ok: false, error: verResult.error };
      }

      // Validate rungs if present
      let rungs: SpotRungs | undefined;
      if (s['rungs'] !== undefined) {
        if (typeof s['rungs'] !== 'object' || s['rungs'] === null) {
          return { ok: false, error: `Spot ${spotId}: rungs must be an object` };
        }
        const r = s['rungs'] as Record<string, unknown>;
        if (typeof r['hint_md'] !== 'string') {
          return { ok: false, error: `Spot ${spotId}: rungs.hint_md must be a string` };
        }
        if (typeof r['reference_md'] !== 'string') {
          return { ok: false, error: `Spot ${spotId}: rungs.reference_md must be a string` };
        }
        if (typeof r['auto_write_md'] !== 'string') {
          return { ok: false, error: `Spot ${spotId}: rungs.auto_write_md must be a string` };
        }
        rungs = {
          hint_md: r['hint_md'] as string,
          reference_md: r['reference_md'] as string,
          auto_write_md: r['auto_write_md'] as string,
        };
      }

      // doc_links optional
      const doc_links = Array.isArray(s['doc_links'])
        ? (s['doc_links'] as string[])
        : undefined;

      validatedSpots.push({
        id: spotId,
        ...(typeof s['title'] === 'string' ? { title: s['title'] } : {}),
        prompt: s['prompt'] as string,
        target_file: s['target_file'] as string,
        target_range: s['target_range'] as string,
        verification: verResult.value,
        ...(rungs !== undefined ? { rungs } : {}),
        ...(doc_links !== undefined ? { doc_links } : {}),
      });
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
    value: { phases: validatedPhases },
  };
}
