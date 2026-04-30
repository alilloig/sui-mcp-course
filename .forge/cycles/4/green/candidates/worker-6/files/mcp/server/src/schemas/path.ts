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
  if (obj['personalization_ranges'] !== undefined) {
    if (typeof obj['personalization_ranges'] !== 'object' || obj['personalization_ranges'] === null) {
      return { ok: false, error: 'personalization_ranges must be an object when present' };
    }
    const pr = obj['personalization_ranges'] as Record<string, unknown>;
    personalization_ranges = {};

    if (pr['poll_interval_ms'] !== undefined) {
      if (typeof pr['poll_interval_ms'] !== 'object' || pr['poll_interval_ms'] === null) {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms must be an object' };
      }
      const r = pr['poll_interval_ms'] as Record<string, unknown>;
      if (typeof r['min'] !== 'number' || typeof r['max'] !== 'number' || typeof r['default'] !== 'number') {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms requires numeric min, max, default' };
      }
      if (r['min'] > r['max']) {
        return { ok: false, error: 'personalization_ranges.poll_interval_ms: min must not exceed max' };
      }
      personalization_ranges.poll_interval_ms = {
        min: r['min'] as number,
        max: r['max'] as number,
        default: r['default'] as number,
      };
    }

    if (pr['pool_subset'] !== undefined) {
      if (typeof pr['pool_subset'] !== 'object' || pr['pool_subset'] === null) {
        return { ok: false, error: 'personalization_ranges.pool_subset must be an object' };
      }
      const r = pr['pool_subset'] as Record<string, unknown>;
      if (!Array.isArray(r['values'])) {
        return { ok: false, error: 'personalization_ranges.pool_subset.values must be an array' };
      }
      if (typeof r['default'] !== 'string') {
        return { ok: false, error: 'personalization_ranges.pool_subset.default must be a string' };
      }
      personalization_ranges.pool_subset = {
        values: r['values'] as string[],
        default: r['default'] as string,
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
