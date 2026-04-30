type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface LadderEntry {
  hint_used: boolean;
  reference_shown: boolean;
  auto_completed: boolean;
}

export interface Cursor {
  phase_id: string;
  spot_id: string;
}

export interface Personalization {
  poll_interval_ms?: number;
  pool_subset?: string;
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
  ladder: Record<string, LadderEntry>;
  history: HistoryEntry[];
}

export function validateState(v: unknown): ValidationResult<State> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return { ok: false, error: 'state must be an object' };
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
    return { ok: false, error: 'personalization must be an object' };
  }

  if (typeof obj['cursor'] !== 'object' || obj['cursor'] === null || Array.isArray(obj['cursor'])) {
    return { ok: false, error: 'cursor must be an object' };
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
    return { ok: false, error: 'ladder must be an object' };
  }

  if (!Array.isArray(obj['history'])) {
    return { ok: false, error: 'history must be an array' };
  }

  return {
    ok: true,
    value: obj as unknown as State,
  };
}
