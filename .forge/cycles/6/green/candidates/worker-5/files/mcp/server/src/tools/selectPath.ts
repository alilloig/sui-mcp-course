import * as path from 'node:path';
import * as fsPromises from 'node:fs/promises';
import { loadState, saveState, STATE_SCHEMA_VERSION } from '../state.js';
import type { State } from '../schemas/state.js';
import { scanRegistry } from '../registry.js';
import { validatePath } from '../schemas/path.js';
import type { PathData } from '../schemas/path.js';
import { loadPhases } from '../phaseEngine.js';
import { probeOutputStyle } from '../outputStyle.js';

export interface Prompt {
  name: string;
  type: 'integer' | 'enum';
  range?: { min: number; max: number; default: number };
  enum?: string[];
  default?: string | number;
}

export interface SelectPathResult {
  ok: boolean;
  personalizationPrompts?: Prompt[];
  errors?: string[];
}

function buildPrompts(pathData: PathData): Prompt[] {
  const prompts: Prompt[] = [];

  for (const opt of pathData.personalization_options) {
    if (opt === 'poll_interval_ms') {
      const range = pathData.personalization_ranges?.poll_interval_ms ?? {
        min: 1000,
        max: 30000,
        default: 3000,
      };
      prompts.push({
        name: 'poll_interval_ms',
        type: 'integer',
        range: { min: range.min, max: range.max, default: range.default },
      });
    } else if (opt === 'pool_subset') {
      const ps = pathData.personalization_ranges?.pool_subset ?? {
        values: ['both', 'DEEP_SUI', 'SUI_USDC'],
        default: 'both',
      };
      prompts.push({
        name: 'pool_subset',
        type: 'enum',
        enum: ps.values,
        default: ps.default,
      });
    }
  }

  return prompts;
}

export async function runSelectPath({
  projectRoot,
  slug,
}: {
  projectRoot: string;
  slug?: unknown;
}): Promise<SelectPathResult> {
  // L002 carry-forward: outputStyleOk gate runs BEFORE any state load
  const styleCheck = await probeOutputStyle();
  if (!styleCheck.ok) {
    return { ok: false, errors: ['output-style-disabled'] };
  }

  // Input validation
  if (slug === undefined || slug === null) {
    return { ok: false, errors: ['Missing required parameter: slug'] };
  }
  if (typeof slug !== 'string') {
    return { ok: false, errors: ['slug must be a string, got ' + typeof slug] };
  }
  if (slug.length === 0) {
    return { ok: false, errors: ['slug must not be empty'] };
  }

  // Load state — short-circuit on corrupt/schema-mismatch
  const stateResult = await loadState(projectRoot);

  // H003 fix: when corrupt AND archivedTo is defined, the original bytes have
  // been safely archived. Treat the slot as absent so we can mint a fresh
  // state rather than refusing with an error. This is the 5-line change
  // described in the cycle-6 contract (selectPath.ts L81-88 short-circuit).
  if (stateResult.kind === 'corrupt') {
    if (stateResult.archivedTo === undefined) {
      // Archive write failed or file was unreadable — still refuse.
      return { ok: false, errors: [`State corrupt: ${stateResult.message}`] };
    }
    // archivedTo is defined: bytes are safely preserved; fall through to
    // mint a fresh state below (treated identically to 'absent').
  } else if (stateResult.kind === 'schema-mismatch') {
    return { ok: false, errors: [`State schema mismatch: ${stateResult.message}`] };
  }

  // Scan registry to validate slug
  const pathsRoot = path.join(projectRoot, 'paths');
  const registry = await scanRegistry(pathsRoot);
  const pathInfo = registry.paths.find((p) => p.slug === slug);

  if (!pathInfo) {
    return { ok: false, errors: [`Unknown path slug: '${slug}'`] };
  }

  // Load path.json to get personalization_ranges
  let pathData: PathData;
  try {
    const pathJsonPath = path.join(projectRoot, 'paths', slug, 'path.json');
    const raw = await fsPromises.readFile(pathJsonPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const validation = validatePath(parsed);
    if (!validation.ok) {
      return { ok: false, errors: [`Invalid path.json: ${validation.error}`] };
    }
    pathData = validation.value;
  } catch (err) {
    return { ok: false, errors: [`Failed to load path.json: ${String(err)}`] };
  }

  // Load phases to get first phase/spot
  let phasesData: Awaited<ReturnType<typeof loadPhases>>;
  try {
    phasesData = await loadPhases(projectRoot, slug);
  } catch (err) {
    return { ok: false, errors: [`Failed to load phases: ${String(err)}`] };
  }

  const firstPhase = phasesData.phases[0];
  const firstSpot = firstPhase.spots[0];

  // Build new state — preserve personalization/history from existing ok state,
  // but start fresh when state was absent or corrupt (archivedTo defined).
  const existingState =
    stateResult.kind === 'ok' ? stateResult.state : null;
  const newState: State = {
    schema_version: STATE_SCHEMA_VERSION,
    selected_path: slug,
    personalization: existingState?.personalization ?? {},
    cursor: { phase_id: firstPhase.id, spot_id: firstSpot.id },
    ladder: {},
    history: existingState?.history ?? [],
  };

  // M002 carry-forward: wrap saveState in try/catch
  try {
    await saveState(projectRoot, newState);
  } catch (err) {
    const e = err as Error;
    return { ok: false, errors: [`state-save-failed: ${e.message}`] };
  }

  const prompts = buildPrompts(pathData);
  return { ok: true, personalizationPrompts: prompts };
}

// Alias export expected by tests
export const selectPath = runSelectPath;
