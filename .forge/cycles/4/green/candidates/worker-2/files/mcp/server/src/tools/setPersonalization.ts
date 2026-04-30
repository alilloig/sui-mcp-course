import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { loadState, saveState } from '../state.js';
import { validatePath } from '../schemas/path.js';
import { validatePersonalizationValues } from '../personalization.js';
import type { DeclaredOptions } from '../personalization.js';

export interface SetPersonalizationResult {
  ok: boolean;
  errors?: string[];
}

export interface SetPersonalizationArgs {
  projectRoot: string;
  values: Record<string, unknown>;
}

export async function setPersonalization(args: SetPersonalizationArgs): Promise<SetPersonalizationResult> {
  const { projectRoot, values } = args;

  // Load state — requires selected_path to be set
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'absent') {
    return { ok: false, errors: ['No path selected. Call selectPath first.'] };
  }
  if (stateResult.kind === 'corrupt' || stateResult.kind === 'schema-mismatch') {
    return { ok: false, errors: [`State recovery required: ${stateResult.message}`] };
  }

  const state = stateResult.state;
  if (!state.selected_path) {
    return { ok: false, errors: ['selected_path is not set. Call selectPath first.'] };
  }

  // Read path.json to get declared options + ranges
  const pathJsonFile = path.join(projectRoot, 'paths', state.selected_path, 'path.json');
  let pathParsed: unknown;
  try {
    const raw = await fsPromises.readFile(pathJsonFile, 'utf8');
    pathParsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: [`Could not read path.json for slug '${state.selected_path}'`] };
  }

  const pathValidation = validatePath(pathParsed);
  if (!pathValidation.ok) {
    return { ok: false, errors: [`path.json invalid: ${pathValidation.error}`] };
  }

  const pathData = pathValidation.value;
  const ranges = pathData.personalization_ranges ?? {};

  // Build declaredOptions for validation
  const declaredOptions: DeclaredOptions = {};
  for (const optName of pathData.personalization_options) {
    if (optName === 'poll_interval_ms') {
      const r = ranges.poll_interval_ms ?? { min: 1000, max: 30000, default: 3000 };
      declaredOptions['poll_interval_ms'] = { type: 'integer', min: r.min, max: r.max, default: r.default };
    } else if (optName === 'pool_subset') {
      const r = ranges.pool_subset ?? { values: ['both', 'DEEP_SUI', 'SUI_USDC'], default: 'both' };
      declaredOptions['pool_subset'] = { type: 'enum', enum: r.values, default: r.default };
    }
  }

  // Validate the submitted values
  const validation = validatePersonalizationValues(values, declaredOptions);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  // Merge defaults for missing keys (Use defaults path: empty values = all defaults)
  const merged: Record<string, unknown> = { ...state.personalization };
  for (const [key, decl] of Object.entries(declaredOptions)) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      merged[key] = values[key];
    } else if (!Object.prototype.hasOwnProperty.call(merged, key)) {
      // Key absent from existing personalization AND absent from values: apply default
      merged[key] = decl.default;
    }
    // If empty values call (Use defaults): apply default for ALL declared options
  }

  // For "Use defaults" (empty values), apply defaults for all declared options
  if (Object.keys(values).length === 0) {
    for (const [key, decl] of Object.entries(declaredOptions)) {
      merged[key] = decl.default;
    }
  }

  const newState = {
    ...state,
    personalization: merged as { poll_interval_ms: number; pool_subset: string },
  };

  await saveState(projectRoot, newState);

  return { ok: true };
}
