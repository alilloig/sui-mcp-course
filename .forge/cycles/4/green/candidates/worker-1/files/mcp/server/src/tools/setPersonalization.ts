import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadState, saveState } from '../state.js';
import { validatePath } from '../schemas/path.js';
import { validatePersonalizationValues } from '../personalization.js';
import {
  POLL_INTERVAL_MS_DEFAULT,
  POOL_SUBSET_DEFAULT,
} from '../personalization.js';
import type { PersonalizationRanges } from '../schemas/path.js';

export interface SetPersonalizationResult {
  ok: boolean;
  errors?: string[];
}

export async function runSetPersonalization({
  projectRoot,
  values,
}: {
  projectRoot: string;
  values: Record<string, unknown>;
}): Promise<SetPersonalizationResult> {
  // Load state
  const stateResult = await loadState(projectRoot);

  if (stateResult.kind === 'corrupt') {
    return {
      ok: false,
      errors: [`State is corrupt: ${stateResult.message}`],
    };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return {
      ok: false,
      errors: [`State schema mismatch (version ${stateResult.foundVersion}): ${stateResult.message}`],
    };
  }
  if (stateResult.kind === 'absent') {
    return {
      ok: false,
      errors: ['No path selected. Call selectPath first.'],
    };
  }

  const state = stateResult.state;

  if (!state.selected_path) {
    return {
      ok: false,
      errors: ['No selected_path in state. Call selectPath first.'],
    };
  }

  // Load path.json to get declared personalization options
  const pathsRoot = path.join(projectRoot, 'paths');
  const slugDir = path.join(pathsRoot, state.selected_path);
  const pathJsonFile = path.join(slugDir, 'path.json');

  let pathData: ReturnType<typeof validatePath>['value'] | undefined;
  try {
    const raw = fs.readFileSync(pathJsonFile, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const validation = validatePath(parsed);
    if (!validation.ok) {
      return {
        ok: false,
        errors: [`Invalid path.json for '${state.selected_path}': ${validation.error}`],
      };
    }
    pathData = validation.value;
  } catch (err) {
    return {
      ok: false,
      errors: [`Failed to read path.json: ${(err as Error).message}`],
    };
  }

  // Validate the provided values
  const validation = validatePersonalizationValues(values, {
    options: pathData.personalization_options,
    ranges: pathData.personalization_ranges,
  });

  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
    };
  }

  // Build merged personalization: start from defaults, then merge existing, then merge new values
  const defaults = buildDefaults(pathData.personalization_options, pathData.personalization_ranges);
  const merged = {
    ...defaults,
    ...(state.personalization as Record<string, unknown>),
    ...values,
  };

  const newState = {
    ...state,
    personalization: merged,
  };

  await saveState(projectRoot, newState);

  return { ok: true };
}

function buildDefaults(
  options: string[],
  ranges?: PersonalizationRanges,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const opt of options) {
    if (opt === 'poll_interval_ms') {
      defaults['poll_interval_ms'] = ranges?.poll_interval_ms?.default ?? POLL_INTERVAL_MS_DEFAULT;
    } else if (opt === 'pool_subset') {
      defaults['pool_subset'] = ranges?.pool_subset?.default ?? POOL_SUBSET_DEFAULT;
    }
  }
  return defaults;
}
