export type PersonalizationOption = 'poll_interval_ms' | 'pool_subset';

const VALID_PERSONALIZATION_OPTIONS: ReadonlySet<string> = new Set([
  'poll_interval_ms',
  'pool_subset',
]);

export interface IntegerRange {
  min: number;
  max: number;
  default: number;
}

export interface EnumRange {
  values: string[];
  default: string;
}

export interface PersonalizationRanges {
  poll_interval_ms?: IntegerRange;
  pool_subset?: EnumRange;
}

export interface PathData {
  slug: string;
  title: string;
  summary: string;
  personalization_options: PersonalizationOption[];
  build_command: string;
  personalization_ranges?: PersonalizationRanges;
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function validatePath(v: unknown): ValidationResult<PathData> {
  if (typeof v !== 'object' || v === null) {
    return { ok: false, error: 'path.json must be an object' };
  }
  const obj = v as Record<string, unknown>;

  if (typeof obj['slug'] !== 'string' || obj['slug'].length === 0) {
    return { ok: false, error: 'Missing required field: slug' };
  }
  if (typeof obj['title'] !== 'string') {
    return { ok: false, error: 'Missing required field: title' };
  }
  if (typeof obj['summary'] !== 'string') {
    return { ok: false, error: 'Missing required field: summary' };
  }
  if (typeof obj['build_command'] !== 'string') {
    return { ok: false, error: 'Missing required field: build_command' };
  }
  if (!Array.isArray(obj['personalization_options'])) {
    return { ok: false, error: 'personalization_options must be an array' };
  }
  for (const opt of obj['personalization_options'] as unknown[]) {
    if (typeof opt !== 'string' || !VALID_PERSONALIZATION_OPTIONS.has(opt)) {
      return {
        ok: false,
        error: `Invalid personalization_options value: ${String(opt)}. Allowed: ${[...VALID_PERSONALIZATION_OPTIONS].join(', ')}`,
      };
    }
  }

  // Validate optional personalization_ranges
  let personalization_ranges: PersonalizationRanges | undefined;
  if (obj['personalization_ranges'] !== undefined && obj['personalization_ranges'] !== null) {
    const pr = obj['personalization_ranges'];
    if (typeof pr !== 'object' || Array.isArray(pr)) {
      return { ok: false, error: 'personalization_ranges must be an object' };
    }
    const prObj = pr as Record<string, unknown>;
    personalization_ranges = {};

    if (prObj['poll_interval_ms'] !== undefined) {
      const r = prObj['poll_interval_ms'];
      if (typeof r !== 'object' || r === null || Array.isArray(r)) {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms must be an object' };
      }
      const rObj = r as Record<string, unknown>;
      if (typeof rObj['min'] !== 'number' || typeof rObj['max'] !== 'number' || typeof rObj['default'] !== 'number') {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms.{min,max,default} must be numbers' };
      }
      if (rObj['min'] > rObj['max']) {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms.min must not exceed max' };
      }
      personalization_ranges.poll_interval_ms = {
        min: rObj['min'] as number,
        max: rObj['max'] as number,
        default: rObj['default'] as number,
      };
    }

    if (prObj['pool_subset'] !== undefined) {
      const r = prObj['pool_subset'];
      if (typeof r !== 'object' || r === null || Array.isArray(r)) {
        return { ok: false, error: 'personalization_ranges.pool_subset must be an object' };
      }
      const rObj = r as Record<string, unknown>;
      if (!Array.isArray(rObj['values'])) {
        return { ok: false, error: 'personalization_ranges.pool_subset.values must be an array' };
      }
      if (typeof rObj['default'] !== 'string') {
        return { ok: false, error: 'personalization_ranges.pool_subset.default must be a string' };
      }
      personalization_ranges.pool_subset = {
        values: rObj['values'] as string[],
        default: rObj['default'] as string,
      };
    }
  }

  return {
    ok: true,
    value: {
      slug: obj['slug'] as string,
      title: obj['title'] as string,
      summary: obj['summary'] as string,
      personalization_options: obj['personalization_options'] as PersonalizationOption[],
      build_command: obj['build_command'] as string,
      ...(personalization_ranges !== undefined ? { personalization_ranges } : {}),
    },
  };
}
