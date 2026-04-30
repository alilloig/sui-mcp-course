import * as path from 'node:path';
import * as fsPromises from 'node:fs/promises';
import { loadState, saveState } from '../state.js';
import { validatePath } from '../schemas/path.js';
import type { PathData } from '../schemas/path.js';
import { validatePersonalizationValues } from '../personalization.js';
import type { DeclaredOptions } from '../personalization.js';

export interface SetPersonalizationResult {
  ok: boolean;
  errors?: string[];
}

function buildDeclaredOptions(pathData: PathData): DeclaredOptions {
  const result: DeclaredOptions = {};
  const ranges = pathData.personalization_ranges;

  for (const option of pathData.personalization_options) {
    if (option === 'poll_interval_ms') {
      const r = ranges?.poll_interval_ms ?? { min: 1000, max: 30000, default: 3000 };
      result[option] = { type: 'integer', min: r.min, max: r.max, default: r.default };
    } else if (option === 'pool_subset') {
      const r = ranges?.pool_subset ?? { values: ['both', 'DEEP_SUI', 'SUI_USDC'], default: 'both' };
      result[option] = { type: 'enum', enum: r.values, default: r.default };
    }
  }

  return result;
}

async function _setPersonalization(args: {
  projectRoot: string;
  values: Record<string, unknown>;
}): Promise<SetPersonalizationResult> {
  const { projectRoot, values } = args;

  // Load state — short-circuit on corrupt/mismatch
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'corrupt') {
    return { ok: false, errors: [`State is corrupt: ${stateResult.message}`] };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return { ok: false, errors: [`State schema mismatch: ${stateResult.message}`] };
  }

  const state = stateResult.kind === 'ok' ? stateResult.state : null;

  // Refuse if selected_path is unset
  if (!state || !state.selected_path) {
    return {
      ok: false,
      errors: ['No path selected. Call selectPath first to choose a learning path.'],
    };
  }

  // Load path.json for the selected slug
  const pathJsonFile = path.join(projectRoot, 'paths', state.selected_path, 'path.json');
  let rawPath: string;
  try {
    rawPath = await fsPromises.readFile(pathJsonFile, 'utf8');
  } catch {
    return { ok: false, errors: [`path.json for '${state.selected_path}' not found`] };
  }

  let parsedPath: unknown;
  try {
    parsedPath = JSON.parse(rawPath);
  } catch {
    return { ok: false, errors: [`path.json for '${state.selected_path}' is not valid JSON`] };
  }

  const pathValidation = validatePath(parsedPath);
  if (!pathValidation.ok) {
    return { ok: false, errors: [`path.json for '${state.selected_path}' is invalid: ${pathValidation.error}`] };
  }

  const pathData = pathValidation.value;
  const declaredOptions = buildDeclaredOptions(pathData);

  // Validate the provided values
  const validation = validatePersonalizationValues(values, declaredOptions);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  // Merge strategy:
  // 1. Start with existing personalization (preserve keys not under attack)
  // 2. Apply user-provided values on top
  // 3. Fill any declared keys still absent with path defaults
  const merged: Record<string, unknown> = { ...state.personalization };

  // Apply user-provided values
  for (const [key, value] of Object.entries(values)) {
    merged[key] = value;
  }

  // Fill missing declared keys with defaults
  for (const [key, decl] of Object.entries(declaredOptions)) {
    if (!(key in merged)) {
      merged[key] = decl.default;
    }
  }

  // Save updated state
  const newState = {
    ...state,
    personalization: merged,
  };

  await saveState(projectRoot, newState);

  return { ok: true };
}

// Public exports
export const setPersonalization = _setPersonalization;
export const runSetPersonalization = _setPersonalization;
