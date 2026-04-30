import * as path from 'node:path';
import * as fsPromises from 'node:fs/promises';
import { loadState, saveState } from '../state.js';
import type { State } from '../state.js';
import { validatePath } from '../schemas/path.js';
import { validatePhases } from '../schemas/phases.js';
import type { PathData, PersonalizationRangeInteger, PersonalizationRangeEnum } from '../schemas/path.js';

export interface PersonalizationPrompt {
  name: string;
  type: 'integer' | 'enum';
  range?: { min: number; max: number; default: number };
  enum?: string[];
  default?: unknown;
}

export interface SelectPathResult {
  ok: boolean;
  personalizationPrompts?: PersonalizationPrompt[];
  errors?: string[];
}

async function _selectPath(args: {
  projectRoot: string;
  slug?: unknown;
}): Promise<SelectPathResult> {
  const { projectRoot } = args;

  // Validate slug
  if (args.slug === undefined || args.slug === null) {
    return { ok: false, errors: ['Missing required parameter: slug'] };
  }
  if (typeof args.slug !== 'string') {
    return { ok: false, errors: [`slug must be a string, got ${typeof args.slug}`] };
  }
  const slug = args.slug;
  if (slug.length === 0) {
    return { ok: false, errors: ['slug must not be empty'] };
  }

  // Load current state to check for corruption (do not write on corrupt/mismatch)
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'corrupt') {
    return { ok: false, errors: [`State is corrupt: ${stateResult.message}`] };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return { ok: false, errors: [`State schema mismatch (version ${stateResult.foundVersion}): ${stateResult.message}`] };
  }

  // Validate the slug against the registry (paths/<slug>/path.json must exist and validate)
  const pathJsonFile = path.join(projectRoot, 'paths', slug, 'path.json');
  let rawPath: string;
  try {
    rawPath = await fsPromises.readFile(pathJsonFile, 'utf8');
  } catch {
    return { ok: false, errors: [`Unknown slug '${slug}': path not found`] };
  }

  let parsedPath: unknown;
  try {
    parsedPath = JSON.parse(rawPath);
  } catch {
    return { ok: false, errors: [`path.json for '${slug}' is not valid JSON`] };
  }

  const pathValidation = validatePath(parsedPath);
  if (!pathValidation.ok) {
    return { ok: false, errors: [`path.json for '${slug}' is invalid: ${pathValidation.error}`] };
  }
  const pathData: PathData = pathValidation.value;

  // Also validate phases.json exists and is valid
  const phasesJsonFile = path.join(projectRoot, 'paths', slug, 'phases.json');
  let rawPhases: string;
  try {
    rawPhases = await fsPromises.readFile(phasesJsonFile, 'utf8');
  } catch {
    return { ok: false, errors: [`phases.json for '${slug}' not found`] };
  }

  let parsedPhases: unknown;
  try {
    parsedPhases = JSON.parse(rawPhases);
  } catch {
    return { ok: false, errors: [`phases.json for '${slug}' is not valid JSON`] };
  }

  const phasesValidation = validatePhases(parsedPhases);
  if (!phasesValidation.ok) {
    return { ok: false, errors: [`phases.json for '${slug}' is invalid: ${phasesValidation.error}`] };
  }

  const phasesData = phasesValidation.value;
  const firstPhase = phasesData.phases[0]!;
  const firstSpot = firstPhase.spots[0]!;

  // Build the personalization prompts from pathData
  const personalizationPrompts: PersonalizationPrompt[] = buildPersonalizationPrompts(pathData);

  // Build new state (merge with existing if present)
  const baseState: State = stateResult.kind === 'ok'
    ? stateResult.state
    : createFreshState();

  const newState: State = {
    ...baseState,
    selected_path: slug,
    cursor: {
      phase_id: firstPhase.id,
      spot_id: firstSpot.id,
    },
    ladder: {},
    personalization: {},
  };

  await saveState(projectRoot, newState);

  return {
    ok: true,
    personalizationPrompts,
  };
}

function createFreshState(): State {
  return {
    schema_version: 1,
    selected_path: '',
    personalization: {},
    cursor: { phase_id: '', spot_id: '' },
    ladder: {},
    history: [],
  };
}

function buildPersonalizationPrompts(pathData: PathData): PersonalizationPrompt[] {
  const prompts: PersonalizationPrompt[] = [];
  const ranges = pathData.personalization_ranges;

  for (const option of pathData.personalization_options) {
    if (option === 'poll_interval_ms') {
      const range: PersonalizationRangeInteger = ranges?.poll_interval_ms ?? { min: 1000, max: 30000, default: 3000 };
      prompts.push({
        name: option,
        type: 'integer',
        range: { min: range.min, max: range.max, default: range.default },
      });
    } else if (option === 'pool_subset') {
      const enumRange: PersonalizationRangeEnum = ranges?.pool_subset ?? { values: ['both', 'DEEP_SUI', 'SUI_USDC'], default: 'both' };
      prompts.push({
        name: option,
        type: 'enum',
        enum: enumRange.values,
        default: enumRange.default,
      });
    }
  }

  return prompts;
}

// Public export — used by tests and the MCP tool handler
export const selectPath = _selectPath;
export const runSelectPath = _selectPath;
