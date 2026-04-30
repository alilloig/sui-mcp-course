export type PersonalizationOption = 'poll_interval_ms' | 'pool_subset';

const VALID_PERSONALIZATION_OPTIONS: ReadonlySet<string> = new Set([
  'poll_interval_ms',
  'pool_subset',
]);

export interface PersonalizationRangeInteger {
  min: number;
  max: number;
  default: number;
}

export interface PersonalizationRangeEnum {
  values: string[];
  default: string;
}

export interface PersonalizationRanges {
  poll_interval_ms?: PersonalizationRangeInteger;
  pool_subset?: PersonalizationRangeEnum;
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

  // Validate optional personalization_ranges if present
  let personalization_ranges: PersonalizationRanges | undefined;
  if (obj['personalization_ranges'] !== undefined) {
    if (typeof obj['personalization_ranges'] !== 'object' || obj['personalization_ranges'] === null) {
      return { ok: false, error: 'personalization_ranges must be an object' };
    }
    const pr = obj['personalization_ranges'] as Record<string, unknown>;
    personalization_ranges = {};

    if (pr['poll_interval_ms'] !== undefined) {
      if (typeof pr['poll_interval_ms'] !== 'object' || pr['poll_interval_ms'] === null) {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms must be an object' };
      }
      const pim = pr['poll_interval_ms'] as Record<string, unknown>;
      if (typeof pim['min'] !== 'number' || typeof pim['max'] !== 'number' || typeof pim['default'] !== 'number') {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms requires min, max, default as numbers' };
      }
      if (pim['min'] > pim['max']) {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms: min must not exceed max' };
      }
      personalization_ranges.poll_interval_ms = {
        min: pim['min'] as number,
        max: pim['max'] as number,
        default: pim['default'] as number,
      };
    }

    if (pr['pool_subset'] !== undefined) {
      if (typeof pr['pool_subset'] !== 'object' || pr['pool_subset'] === null) {
        return { ok: false, error: 'personalization_ranges.pool_subset must be an object' };
      }
      const ps = pr['pool_subset'] as Record<string, unknown>;
      if (!Array.isArray(ps['values'])) {
        return { ok: false, error: 'personalization_ranges.pool_subset.values must be an array' };
      }
      if (typeof ps['default'] !== 'string') {
        return { ok: false, error: 'personalization_ranges.pool_subset.default must be a string' };
      }
      personalization_ranges.pool_subset = {
        values: ps['values'] as string[],
        default: ps['default'] as string,
      };
    }
  }

  const result: PathData = {
    slug: obj['slug'] as string,
    title: obj['title'] as string,
    summary: obj['summary'] as string,
    personalization_options: obj['personalization_options'] as PersonalizationOption[],
    build_command: obj['build_command'] as string,
  };
  if (personalization_ranges !== undefined) {
    result.personalization_ranges = personalization_ranges;
  }
  return { ok: true, value: result };
}
