import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadState, saveState } from '../state.js';
import { validatePath } from '../schemas/path.js';
import { validatePersonalizationValues } from '../personalization.js';
import type { DeclaredOptions } from '../personalization.js';

export interface SetPersonalizationArgs {
  projectRoot: string;
  values: Record<string, unknown>;
}

export interface SetPersonalizationResult {
  ok: boolean;
  errors?: string[];
}

export async function setPersonalization(
  args: SetPersonalizationArgs,
): Promise<SetPersonalizationResult> {
  const { projectRoot, values } = args;

  // Load state — short-circuit on errors
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'absent') {
    return {
      ok: false,
      errors: ['No state found. Call selectPath first to select a learning path.'],
    };
  }
  if (stateResult.kind === 'corrupt') {
    return { ok: false, errors: [`State is corrupt: ${stateResult.message}`] };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return {
      ok: false,
      errors: [`State schema mismatch (found version ${stateResult.foundVersion}): ${stateResult.message}`],
    };
  }

  const state = stateResult.state;

  // Check selected_path is set
  if (!state.selected_path) {
    return {
      ok: false,
      errors: ['No path selected. Call selectPath before setPersonalization.'],
    };
  }

  // Load path.json to get declared options and ranges
  const pathJsonFile = path.join(projectRoot, 'paths', state.selected_path, 'path.json');
  if (!fs.existsSync(pathJsonFile)) {
    return { ok: false, errors: [`path.json not found for selected path '${state.selected_path}'`] };
  }

  let parsed: unknown;
  try {
    const raw = fs.readFileSync(pathJsonFile, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [`Failed to read path.json: ${message}`] };
  }

  const pathValidation = validatePath(parsed);
  if (!pathValidation.ok) {
    return { ok: false, errors: [`path.json invalid: ${pathValidation.error}`] };
  }

  const pathData = pathValidation.value;
  const ranges = pathData.personalization_ranges;

  // Build declared options in the Record format for validatePersonalizationValues
  const declaredOptions: DeclaredOptions = {};
  for (const opt of pathData.personalization_options) {
    if (opt === 'poll_interval_ms') {
      const r = ranges?.poll_interval_ms;
      declaredOptions['poll_interval_ms'] = {
        type: 'integer',
        min: r?.min ?? 1000,
        max: r?.max ?? 30000,
        default: r?.default ?? 3000,
      };
    } else if (opt === 'pool_subset') {
      const r = ranges?.pool_subset;
      declaredOptions['pool_subset'] = {
        type: 'enum',
        enum: r?.values ?? ['both', 'DEEP_SUI', 'SUI_USDC'],
        default: r?.default ?? 'both',
      };
    }
  }

  // Validate provided values
  const validationResult = validatePersonalizationValues(values, declaredOptions);
  if (!validationResult.ok) {
    return { ok: false, errors: validationResult.errors };
  }

  // Merge: start from existing personalization, apply provided values, fill defaults for absent
  const mergedPersonalization: Record<string, unknown> = {
    ...(state.personalization as Record<string, unknown>),
  };

  for (const [optName, decl] of Object.entries(declaredOptions)) {
    if (Object.prototype.hasOwnProperty.call(values, optName)) {
      mergedPersonalization[optName] = values[optName];
    } else if (!Object.prototype.hasOwnProperty.call(mergedPersonalization, optName)) {
      // Use default for absent keys (Use defaults path)
      mergedPersonalization[optName] = decl.default;
    }
  }

  // Save updated state
  const updatedState = {
    ...state,
    personalization: mergedPersonalization,
  };

  await saveState(projectRoot, updatedState);

  return { ok: true };
}
