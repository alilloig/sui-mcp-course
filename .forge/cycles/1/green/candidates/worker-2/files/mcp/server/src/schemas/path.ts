const ALLOWED_PERSONALIZATION_OPTIONS = ['poll_interval_ms', 'pool_subset'] as const;
type PersonalizationOption = typeof ALLOWED_PERSONALIZATION_OPTIONS[number];

export interface PathData {
  slug: string;
  title: string;
  summary: string;
  personalization_options: PersonalizationOption[];
  build_command: string;
}

type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function validatePath(v: unknown): ValidateResult<PathData> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return { ok: false, error: 'path.json must be an object' };
  }
  const obj = v as Record<string, unknown>;

  if (typeof obj['slug'] !== 'string' || obj['slug'].length === 0) {
    return { ok: false, error: 'missing required field: slug' };
  }
  if (typeof obj['title'] !== 'string' || obj['title'].length === 0) {
    return { ok: false, error: 'missing required field: title' };
  }
  if (typeof obj['summary'] !== 'string') {
    return { ok: false, error: 'missing required field: summary' };
  }
  if (!Array.isArray(obj['personalization_options'])) {
    return { ok: false, error: 'personalization_options must be an array' };
  }
  for (const opt of obj['personalization_options']) {
    if (!(ALLOWED_PERSONALIZATION_OPTIONS as readonly unknown[]).includes(opt)) {
      return {
        ok: false,
        error: `invalid personalization_option: ${String(opt)}. Allowed: ${ALLOWED_PERSONALIZATION_OPTIONS.join(', ')}`,
      };
    }
  }
  if (typeof obj['build_command'] !== 'string') {
    return { ok: false, error: 'missing required field: build_command' };
  }

  return {
    ok: true,
    value: {
      slug: obj['slug'] as string,
      title: obj['title'] as string,
      summary: obj['summary'] as string,
      personalization_options: obj['personalization_options'] as PersonalizationOption[],
      build_command: obj['build_command'] as string,
    },
  };
}
