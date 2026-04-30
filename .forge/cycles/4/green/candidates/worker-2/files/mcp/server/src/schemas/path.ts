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
  if (obj['personalization_ranges'] !== undefined) {
    const ranges = obj['personalization_ranges'];
    if (typeof ranges !== 'object' || ranges === null || Array.isArray(ranges)) {
      return { ok: false, error: 'personalization_ranges must be an object' };
    }
    const r = ranges as Record<string, unknown>;
    if (r['poll_interval_ms'] !== undefined) {
      const pim = r['poll_interval_ms'] as Record<string, unknown>;
      if (
        typeof pim !== 'object' || pim === null ||
        typeof pim['min'] !== 'number' ||
        typeof pim['max'] !== 'number' ||
        typeof pim['default'] !== 'number'
      ) {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms must have min, max, default as numbers' };
      }
      if (pim['min'] >= pim['max']) {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms: min must be less than max' };
      }
    }
    if (r['pool_subset'] !== undefined) {
      const ps = r['pool_subset'] as Record<string, unknown>;
      if (
        typeof ps !== 'object' || ps === null ||
        !Array.isArray(ps['values']) ||
        typeof ps['default'] !== 'string'
      ) {
        return { ok: false, error: 'personalization_ranges.pool_subset must have values array and default string' };
      }
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
      personalization_ranges: obj['personalization_ranges'] as PersonalizationRanges | undefined,
    },
  };
}
