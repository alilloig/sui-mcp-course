import * as path from 'node:path';
import { probeOutputStyle } from '../outputStyle.js';
import { scanRegistry } from '../registry.js';
import type { PathInfo, RegistryWarning } from '../registry.js';
import { loadState } from '../state.js';
import type { State } from '../state.js';

export interface StateCorruptWarning {
  kind: 'state-corrupt';
  message: string;
  archivedTo: string;
}

export interface SchemaMismatchWarning {
  kind: 'state-schema-mismatch';
  message: string;
  foundVersion: number;
}

export type StartWarning = RegistryWarning | StateCorruptWarning | SchemaMismatchWarning;

export interface StartResult {
  outputStyleOk: boolean;
  preflight: { skipped: true; reason: 'cycle-1' };
  paths: PathInfo[];
  state: State | null;
  warnings: StartWarning[];
}

export async function runStart({ projectRoot }: { projectRoot: string }): Promise<StartResult> {
  const styleResult = await probeOutputStyle();
  const pathsRoot = path.join(projectRoot, 'paths');
  const registry = await scanRegistry(pathsRoot);

  if (!styleResult.ok) {
    const warnings: StartWarning[] = [...registry.warnings];
    if (styleResult.warning) {
      warnings.push(styleResult.warning);
    }
    return {
      outputStyleOk: false,
      preflight: { skipped: true, reason: 'cycle-1' },
      paths: registry.paths,
      state: null,
      warnings,
    };
  }

  // outputStyleOk === true — now load state
  const stateResult = await loadState(projectRoot);

  const warnings: StartWarning[] = [...registry.warnings];
  let state: State | null = null;

  if (stateResult.kind === 'absent') {
    // No state file — clean first run
    state = null;
  } else if (stateResult.kind === 'ok') {
    state = stateResult.state;
  } else if (stateResult.kind === 'corrupt') {
    state = null;
    warnings.push({
      kind: 'state-corrupt',
      message: stateResult.message,
      archivedTo: stateResult.archivedTo ?? '',
    });
  } else if (stateResult.kind === 'schema-mismatch') {
    state = null;
    warnings.push({
      kind: 'state-schema-mismatch',
      message: stateResult.message,
      foundVersion: stateResult.foundVersion,
    });
  }

  return {
    outputStyleOk: true,
    preflight: { skipped: true, reason: 'cycle-1' },
    paths: registry.paths,
    state,
    warnings,
  };
}
