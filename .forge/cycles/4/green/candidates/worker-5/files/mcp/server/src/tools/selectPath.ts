import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadState, saveState } from '../state.js';
import type { State } from '../state.js';
import { validatePath } from '../schemas/path.js';
import type { PersonalizationRanges } from '../schemas/path.js';
import { validatePhases } from '../schemas/phases.js';

export interface PersonalizationPrompt {
  name: string;
  type: 'integer' | 'enum';
  range?: { min: number; max: number; default: number };
  enum?: string[];
  default?: string | number;
}

export interface SelectPathArgs {
  projectRoot: string;
  slug: string;
}

export type SelectPathResult =
  | { ok: true; personalizationPrompts: PersonalizationPrompt[]; errors?: undefined }
  | { ok: false; errors: string[]; personalizationPrompts?: undefined };

export async function selectPath(args: SelectPathArgs): Promise<SelectPathResult> {
  const { projectRoot } = args;
  const slug = (args as { slug?: unknown }).slug;

  // Input validation — slug must be a string.
  if (typeof slug !== 'string') {
    return { ok: false, errors: ['slug must be a string'] };
  }
  if (!slug) {
    return { ok: false, errors: ['slug is required'] };
  }

  // Load current state — short-circuit on corrupt/schema-mismatch.
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'corrupt' || stateResult.kind === 'schema-mismatch') {
    return { ok: false, errors: [`State recovery required before selecting a path (${stateResult.kind})`] };
  }

  // Read path.json for the given slug.
  const pathsRoot = path.join(projectRoot, 'paths');
  const slugDir = path.join(pathsRoot, slug);
  const pathJsonFile = path.join(slugDir, 'path.json');

  let pathRaw: string;
  try {
    pathRaw = fs.readFileSync(pathJsonFile, 'utf8');
  } catch {
    return { ok: false, errors: [`Unknown slug '${slug}': no path.json found`] };
  }

  let pathParsed: unknown;
  try {
    pathParsed = JSON.parse(pathRaw);
  } catch {
    return { ok: false, errors: [`Malformed path.json for slug '${slug}'`] };
  }

  const pathValidation = validatePath(pathParsed);
  if (!pathValidation.ok) {
    return { ok: false, errors: [pathValidation.error] };
  }

  // Validate phases.json exists.
  const phasesJsonFile = path.join(slugDir, 'phases.json');
  let phasesRaw: string;
  try {
    phasesRaw = fs.readFileSync(phasesJsonFile, 'utf8');
  } catch {
    return { ok: false, errors: [`Missing phases.json for slug '${slug}'`] };
  }

  let phasesParsed: unknown;
  try {
    phasesParsed = JSON.parse(phasesRaw);
  } catch {
    return { ok: false, errors: [`Malformed phases.json for slug '${slug}'`] };
  }

  const phasesValidation = validatePhases(phasesParsed);
  if (!phasesValidation.ok) {
    return { ok: false, errors: [phasesValidation.error] };
  }

  const phasesData = phasesValidation.value;
  const firstPhase = phasesData.phases[0];
  const firstSpot = firstPhase.spots[0];

  // Build personalizationPrompts from path's declared options + ranges.
  const pathData = pathValidation.value;
  const prompts: PersonalizationPrompt[] = [];
  const ranges: PersonalizationRanges = pathData.personalization_ranges ?? {};

  for (const optName of pathData.personalization_options) {
    if (optName === 'poll_interval_ms') {
      const r = ranges.poll_interval_ms;
      prompts.push({
        name: 'poll_interval_ms',
        type: 'integer',
        range: r
          ? { min: r.min, max: r.max, default: r.default }
          : { min: 1000, max: 30000, default: 3000 },
      });
    } else if (optName === 'pool_subset') {
      const r = ranges.pool_subset;
      prompts.push({
        name: 'pool_subset',
        type: 'enum',
        enum: r ? r.values : ['both', 'DEEP_SUI', 'SUI_USDC'],
        default: r ? r.default : 'both',
      });
    }
  }

  // Build the new state.
  const existingPersonalization =
    stateResult.kind === 'ok' ? stateResult.state.personalization : {};

  const newState: State = {
    schema_version: 1,
    selected_path: slug,
    personalization: existingPersonalization,
    cursor: { phase_id: firstPhase.id, spot_id: firstSpot.id },
    ladder: {},
    history: stateResult.kind === 'ok' ? stateResult.state.history : [],
  };

  await saveState(projectRoot, newState);

  return { ok: true, personalizationPrompts: prompts };
}
