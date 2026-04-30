import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadState, saveState } from '../state.js';
import { validatePath } from '../schemas/path.js';
import type { PersonalizationRanges } from '../schemas/path.js';
import { validatePersonalizationValues } from '../personalization.js';
import type { DeclaredOptions } from '../personalization.js';

export interface SetPersonalizationArgs {
  projectRoot: string;
  values: Record<string, unknown>;
}

export type SetPersonalizationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export async function setPersonalization(args: SetPersonalizationArgs): Promise<SetPersonalizationResult> {
  const { projectRoot, values } = args;

  // Load state — short-circuit on absent/corrupt/schema-mismatch.
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'absent') {
    return { ok: false, errors: ['No path selected. Call selectPath first.'] };
  }
  if (stateResult.kind === 'corrupt' || stateResult.kind === 'schema-mismatch') {
    return { ok: false, errors: [`State recovery required (${stateResult.kind})`] };
  }

  const state = stateResult.state;

  if (!state.selected_path) {
    return { ok: false, errors: ['selected_path is unset. Call selectPath first.'] };
  }

  // Read path.json to get declared personalization options.
  const slugDir = path.join(projectRoot, 'paths', state.selected_path);
  const pathJsonFile = path.join(slugDir, 'path.json');

  let pathRaw: string;
  try {
    pathRaw = fs.readFileSync(pathJsonFile, 'utf8');
  } catch {
    return { ok: false, errors: [`path.json not found for selected path '${state.selected_path}'`] };
  }

  let pathParsed: unknown;
  try {
    pathParsed = JSON.parse(pathRaw);
  } catch {
    return { ok: false, errors: [`Malformed path.json for '${state.selected_path}'`] };
  }

  const pathValidation = validatePath(pathParsed);
  if (!pathValidation.ok) {
    return { ok: false, errors: [pathValidation.error] };
  }

  const pathData = pathValidation.value;
  const ranges: PersonalizationRanges = pathData.personalization_ranges ?? {};

  // Build DeclaredOptions from path data.
  const declaredOptions: DeclaredOptions = {};
  for (const optName of pathData.personalization_options) {
    if (optName === 'poll_interval_ms') {
      const r = ranges.poll_interval_ms;
      declaredOptions['poll_interval_ms'] = {
        type: 'integer',
        min: r?.min ?? 1000,
        max: r?.max ?? 30000,
        default: r?.default ?? 3000,
      };
    } else if (optName === 'pool_subset') {
      const r = ranges.pool_subset;
      declaredOptions['pool_subset'] = {
        type: 'enum',
        enum: r?.values ?? ['both', 'DEEP_SUI', 'SUI_USDC'],
        default: r?.default ?? 'both',
      };
    }
  }

  // Validate the provided values.
  const validationResult = validatePersonalizationValues(values, declaredOptions);
  if (!validationResult.ok) {
    return { ok: false, errors: validationResult.errors };
  }

  // Merge defaults for any key not provided in values.
  const merged: Record<string, unknown> = { ...state.personalization };
  for (const [key, decl] of Object.entries(declaredOptions)) {
    if (key in values) {
      merged[key] = values[key];
    } else if (!(key in merged)) {
      // Apply default for this key.
      merged[key] = decl.default;
    }
  }
  // Also apply explicitly-provided values that override existing.
  for (const [k, v] of Object.entries(values)) {
    merged[k] = v;
  }

  // Save updated state.
  const newState = {
    ...state,
    personalization: merged,
  };

  await saveState(projectRoot, newState);

  return { ok: true };
}
