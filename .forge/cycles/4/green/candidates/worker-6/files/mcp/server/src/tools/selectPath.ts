import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadState, saveState } from '../state.js';
import { validatePath } from '../schemas/path.js';
import { validatePhases } from '../schemas/phases.js';
import type { OptionDecl } from '../personalization.js';
import type { LadderRung } from '../schemas/state.js';

export interface SelectPathArgs {
  projectRoot: string;
  slug: string;
}

export interface SelectPathResult {
  ok: boolean;
  personalizationPrompts?: OptionDecl[];
  errors?: string[];
}

export async function selectPath(args: SelectPathArgs): Promise<SelectPathResult> {
  const { projectRoot, slug } = args;

  // Input validation
  if (typeof slug !== 'string') {
    return { ok: false, errors: ['slug must be a string'] };
  }
  if (!slug) {
    return { ok: false, errors: ['slug is required'] };
  }

  // Load the path.json for this slug from paths/<slug>/path.json
  const pathJsonFile = path.join(projectRoot, 'paths', slug, 'path.json');

  if (!fs.existsSync(pathJsonFile)) {
    return { ok: false, errors: [`Unknown path slug: '${slug}'`] };
  }

  let parsed: unknown;
  try {
    const raw = fs.readFileSync(pathJsonFile, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [`Failed to read path.json for '${slug}': ${message}`] };
  }

  const validation = validatePath(parsed);
  if (!validation.ok) {
    return { ok: false, errors: [`path.json for '${slug}' is invalid: ${validation.error}`] };
  }

  const pathData = validation.value;

  // Load phases.json to get the first phase and spot IDs
  const phasesJsonFile = path.join(projectRoot, 'paths', slug, 'phases.json');
  if (!fs.existsSync(phasesJsonFile)) {
    return { ok: false, errors: [`phases.json not found for slug '${slug}'`] };
  }

  let phasesParsed: unknown;
  try {
    const raw = fs.readFileSync(phasesJsonFile, 'utf8');
    phasesParsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [`Failed to read phases.json for '${slug}': ${message}`] };
  }

  const phasesValidation = validatePhases(phasesParsed);
  if (!phasesValidation.ok) {
    return { ok: false, errors: [`phases.json for '${slug}' is invalid: ${phasesValidation.error}`] };
  }

  const phasesData = phasesValidation.value;
  const firstPhase = phasesData.phases[0]!;
  const firstSpot = firstPhase.spots[0]!;

  // Load existing state (if any) — short-circuit on corrupt/schema-mismatch
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'corrupt') {
    return { ok: false, errors: [`State is corrupt: ${stateResult.message}`] };
  }
  if (stateResult.kind === 'schema-mismatch') {
    return {
      ok: false,
      errors: [`State schema mismatch (found version ${stateResult.foundVersion}): ${stateResult.message}`],
    };
  }

  // Build or extend state
  const existingState = stateResult.kind === 'ok' ? stateResult.state : null;
  const newState = {
    schema_version: 1 as const,
    selected_path: slug,
    personalization: existingState?.personalization ?? {},
    cursor: {
      phase_id: firstPhase.id,
      spot_id: firstSpot.id,
    },
    ladder: {} as Record<string, LadderRung>,
    history: existingState?.history ?? [],
  };

  await saveState(projectRoot, newState);

  // Build personalization prompts from path's declared options and ranges
  const prompts: OptionDecl[] = [];
  const ranges = pathData.personalization_ranges;

  for (const opt of pathData.personalization_options) {
    if (opt === 'poll_interval_ms') {
      const r = ranges?.poll_interval_ms;
      prompts.push({
        type: 'integer',
        name: 'poll_interval_ms',
        range: {
          min: r?.min ?? 1000,
          max: r?.max ?? 30000,
          default: r?.default ?? 3000,
        },
      });
    } else if (opt === 'pool_subset') {
      const r = ranges?.pool_subset;
      prompts.push({
        type: 'enum',
        name: 'pool_subset',
        enum: r?.values ?? ['both', 'DEEP_SUI', 'SUI_USDC'],
        default: r?.default ?? 'both',
      });
    }
  }

  return {
    ok: true,
    personalizationPrompts: prompts,
  };
}
