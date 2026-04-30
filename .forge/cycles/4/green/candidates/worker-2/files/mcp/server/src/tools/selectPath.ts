import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { loadState, saveState } from '../state.js';
import type { State } from '../state.js';
import { validatePath } from '../schemas/path.js';
import { validatePhases } from '../schemas/phases.js';

export interface PersonalizationPromptInteger {
  name: string;
  type: 'integer';
  range: { min: number; max: number; default: number };
}

export interface PersonalizationPromptEnum {
  name: string;
  type: 'enum';
  enum: string[];
  default: string;
}

export type PersonalizationPrompt = PersonalizationPromptInteger | PersonalizationPromptEnum;

export interface SelectPathResult {
  ok: boolean;
  personalizationPrompts?: PersonalizationPrompt[];
  errors?: string[];
}

export interface SelectPathArgs {
  projectRoot: string;
  slug: string;
}

export async function selectPath(args: SelectPathArgs): Promise<SelectPathResult> {
  const { projectRoot } = args;
  const slug = (args as Record<string, unknown>)['slug'];

  // Input validation
  if (typeof slug !== 'string' || slug.length === 0) {
    return { ok: false, errors: ['slug must be a non-empty string'] };
  }

  // Short-circuit on bad state
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'corrupt' || stateResult.kind === 'schema-mismatch') {
    return { ok: false, errors: [`State recovery required before selectPath: ${stateResult.message}`] };
  }

  // Validate slug against the registry (read path.json directly)
  const pathJsonFile = path.join(projectRoot, 'paths', slug, 'path.json');
  let pathRaw: string;
  try {
    pathRaw = await fsPromises.readFile(pathJsonFile, 'utf8');
  } catch {
    return { ok: false, errors: [`Unknown path slug: '${slug}'`] };
  }

  let pathParsed: unknown;
  try {
    pathParsed = JSON.parse(pathRaw);
  } catch {
    return { ok: false, errors: [`path.json for slug '${slug}' is malformed`] };
  }

  const pathValidation = validatePath(pathParsed);
  if (!pathValidation.ok) {
    return { ok: false, errors: [`path.json for slug '${slug}' is invalid: ${pathValidation.error}`] };
  }

  const pathData = pathValidation.value;

  // Validate phases.json to get the first phase/spot
  const phasesJsonFile = path.join(projectRoot, 'paths', slug, 'phases.json');
  let phasesRaw: string;
  try {
    phasesRaw = await fsPromises.readFile(phasesJsonFile, 'utf8');
  } catch {
    return { ok: false, errors: [`phases.json for slug '${slug}' not found`] };
  }

  let phasesParsed: unknown;
  try {
    phasesParsed = JSON.parse(phasesRaw);
  } catch {
    return { ok: false, errors: [`phases.json for slug '${slug}' is malformed`] };
  }

  const phasesValidation = validatePhases(phasesParsed);
  if (!phasesValidation.ok) {
    return { ok: false, errors: [`phases.json for slug '${slug}' is invalid: ${phasesValidation.error}`] };
  }

  const phasesData = phasesValidation.value;
  const firstPhase = phasesData.phases[0];
  const firstSpot = firstPhase.spots[0];

  // Build personalizationPrompts from path's options + ranges
  const prompts: PersonalizationPrompt[] = [];
  const ranges = pathData.personalization_ranges ?? {};

  for (const optName of pathData.personalization_options) {
    if (optName === 'poll_interval_ms') {
      const r = ranges.poll_interval_ms ?? { min: 1000, max: 30000, default: 3000 };
      prompts.push({
        name: 'poll_interval_ms',
        type: 'integer',
        range: { min: r.min, max: r.max, default: r.default },
      });
    } else if (optName === 'pool_subset') {
      const r = ranges.pool_subset ?? { values: ['both', 'DEEP_SUI', 'SUI_USDC'], default: 'both' };
      prompts.push({
        name: 'pool_subset',
        type: 'enum',
        enum: r.values,
        default: r.default,
      });
    }
  }

  // Build initial state
  const existingState: State | null = stateResult.kind === 'ok' ? stateResult.state : null;

  const newState: State = {
    schema_version: 1,
    selected_path: slug,
    personalization: existingState?.personalization ?? { poll_interval_ms: 3000, pool_subset: 'both' },
    cursor: { phase_id: firstPhase.id, spot_id: firstSpot.id },
    ladder: {},
    history: existingState?.history ?? [],
  };

  await saveState(projectRoot, newState);

  return { ok: true, personalizationPrompts: prompts };
}
