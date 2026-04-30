import * as path from 'node:path';
import * as fs from 'node:fs';
import { loadState, saveState } from '../state.js';
import { validatePath } from '../schemas/path.js';
import { loadPhases } from '../phaseEngine.js';
import type { State } from '../schemas/state.js';
import {
  POLL_INTERVAL_MS_MIN,
  POLL_INTERVAL_MS_MAX,
  POLL_INTERVAL_MS_DEFAULT,
  POOL_SUBSET_VALUES,
  POOL_SUBSET_DEFAULT,
} from '../personalization.js';

export interface PersonalizationPrompt {
  name: string;
  type: 'integer' | 'enum';
  range?: { min: number; max: number; default: number };
  enum?: string[];
  default?: string | number;
}

export interface SelectPathResult {
  ok: boolean;
  personalizationPrompts?: PersonalizationPrompt[];
  errors?: string[];
}

export async function runSelectPath({
  projectRoot,
  slug,
}: {
  projectRoot: string;
  slug: unknown;
}): Promise<SelectPathResult> {
  // Input validation
  if (typeof slug !== 'string' || slug.length === 0) {
    return {
      ok: false,
      errors: [
        typeof slug !== 'string'
          ? `slug must be a string, got ${typeof slug}`
          : 'slug must not be empty',
      ],
    };
  }

  // Check if loadState fails in a way that blocks writes
  const stateResult = await loadState(projectRoot);
  if (stateResult.kind === 'corrupt' || stateResult.kind === 'schema-mismatch') {
    return {
      ok: false,
      errors: [
        stateResult.kind === 'corrupt'
          ? `State is corrupt: ${stateResult.message}`
          : `State schema mismatch (version ${stateResult.foundVersion}): ${stateResult.message}`,
      ],
    };
  }

  // Check slug against registry (load path.json from paths/<slug>/)
  const pathsRoot = path.join(projectRoot, 'paths');
  const slugDir = path.join(pathsRoot, slug);
  const pathJsonFile = path.join(slugDir, 'path.json');

  if (!fs.existsSync(pathJsonFile)) {
    return {
      ok: false,
      errors: [`Unknown path slug: '${slug}'. No path.json found at ${pathJsonFile}`],
    };
  }

  let pathData: ReturnType<typeof validatePath>['value'] | undefined;
  try {
    const raw = fs.readFileSync(pathJsonFile, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const validation = validatePath(parsed);
    if (!validation.ok) {
      return {
        ok: false,
        errors: [`Invalid path.json for '${slug}': ${validation.error}`],
      };
    }
    pathData = validation.value;
  } catch (err) {
    return {
      ok: false,
      errors: [`Failed to read path.json for '${slug}': ${(err as Error).message}`],
    };
  }

  // Load phases to get the first phase and spot
  let phasesData: Awaited<ReturnType<typeof loadPhases>>;
  try {
    phasesData = await loadPhases(projectRoot, slug);
  } catch (err) {
    return {
      ok: false,
      errors: [`Failed to load phases for '${slug}': ${(err as Error).message}`],
    };
  }

  const firstPhase = phasesData.phases[0];
  const firstSpot = firstPhase.spots[0];

  // Build the new state
  const existingState = stateResult.kind === 'ok' ? stateResult.state : null;
  const newState: State = {
    schema_version: 1,
    selected_path: slug,
    personalization: existingState?.personalization ?? {},
    cursor: {
      phase_id: firstPhase.id,
      spot_id: firstSpot.id,
    },
    ladder: {},
    history: existingState?.history ?? [],
  };

  await saveState(projectRoot, newState);

  // Build personalizationPrompts from path.json
  const prompts: PersonalizationPrompt[] = buildPersonalizationPrompts(pathData);

  return {
    ok: true,
    personalizationPrompts: prompts,
  };
}

function buildPersonalizationPrompts(
  pathData: ReturnType<typeof validatePath>['value'],
): PersonalizationPrompt[] {
  const prompts: PersonalizationPrompt[] = [];

  for (const optName of pathData.personalization_options) {
    if (optName === 'poll_interval_ms') {
      const ranges = pathData.personalization_ranges?.poll_interval_ms;
      prompts.push({
        name: 'poll_interval_ms',
        type: 'integer',
        range: {
          min: ranges?.min ?? POLL_INTERVAL_MS_MIN,
          max: ranges?.max ?? POLL_INTERVAL_MS_MAX,
          default: ranges?.default ?? POLL_INTERVAL_MS_DEFAULT,
        },
      });
    } else if (optName === 'pool_subset') {
      const ranges = pathData.personalization_ranges?.pool_subset;
      prompts.push({
        name: 'pool_subset',
        type: 'enum',
        enum: ranges?.values ?? [...POOL_SUBSET_VALUES],
        default: ranges?.default ?? POOL_SUBSET_DEFAULT,
      });
    }
  }

  return prompts;
}
