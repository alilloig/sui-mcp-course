export interface Cursor {
  phase_id: string;
  spot_id: string;
}

export interface Personalization {
  [key: string]: unknown;
}

export interface LadderRung {
  hint_used: boolean;
  reference_shown: boolean;
  auto_completed: boolean;
  auto_write_attempted: boolean;
}

export interface HistoryEntry {
  ts: string;
  event: string;
}

export interface State {
  schema_version: number;
  selected_path: string;
  personalization: Personalization;
  cursor: Cursor;
  ladder: Record<string, LadderRung>;
  history: HistoryEntry[];
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function validateState(v: unknown): ValidationResult<State> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return { ok: false, error: 'state must be a non-null object' };
  }
  const obj = v as Record<string, unknown>;

  if (typeof obj['schema_version'] !== 'number') {
    return { ok: false, error: 'schema_version must be a number' };
  }

  if (typeof obj['selected_path'] !== 'string') {
    return { ok: false, error: 'selected_path must be a string' };
  }

  if (
    typeof obj['personalization'] !== 'object' ||
    obj['personalization'] === null ||
    Array.isArray(obj['personalization'])
  ) {
    return { ok: false, error: 'personalization must be a non-null object' };
  }

  if (
    typeof obj['cursor'] !== 'object' ||
    obj['cursor'] === null ||
    Array.isArray(obj['cursor'])
  ) {
    return { ok: false, error: 'cursor must be a non-null object' };
  }
  const cursor = obj['cursor'] as Record<string, unknown>;
  if (typeof cursor['phase_id'] !== 'string') {
    return { ok: false, error: 'cursor.phase_id must be a string' };
  }
  if (typeof cursor['spot_id'] !== 'string') {
    return { ok: false, error: 'cursor.spot_id must be a string' };
  }

  if (
    typeof obj['ladder'] !== 'object' ||
    obj['ladder'] === null ||
    Array.isArray(obj['ladder'])
  ) {
    return { ok: false, error: 'ladder must be a non-null object' };
  }

  if (!Array.isArray(obj['history'])) {
    return { ok: false, error: 'history must be an array' };
  }

  // Normalize ladder rungs: add default auto_write_attempted: false if absent
  const rawLadder = obj['ladder'] as Record<string, unknown>;
  const ladder: Record<string, LadderRung> = {};
  for (const [k, rung] of Object.entries(rawLadder)) {
    if (typeof rung === 'object' && rung !== null && !Array.isArray(rung)) {
      const r = rung as Record<string, unknown>;
      ladder[k] = {
        hint_used: typeof r['hint_used'] === 'boolean' ? r['hint_used'] : false,
        reference_shown: typeof r['reference_shown'] === 'boolean' ? r['reference_shown'] : false,
        auto_completed: typeof r['auto_completed'] === 'boolean' ? r['auto_completed'] : false,
        auto_write_attempted: typeof r['auto_write_attempted'] === 'boolean' ? r['auto_write_attempted'] : false,
      };
    }
  }

  return {
    ok: true,
    value: {
      schema_version: obj['schema_version'] as number,
      selected_path: obj['selected_path'] as string,
      personalization: obj['personalization'] as Personalization,
      cursor: {
        phase_id: cursor['phase_id'] as string,
        spot_id: cursor['spot_id'] as string,
      },
      ladder,
      history: obj['history'] as HistoryEntry[],
    },
  };
}
