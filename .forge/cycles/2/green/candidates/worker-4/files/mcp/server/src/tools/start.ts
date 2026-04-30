import * as path from 'node:path';
import { probeOutputStyle } from '../outputStyle.js';
import { scanRegistry } from '../registry.js';
import { loadState } from '../state.js';
import type { PathInfo, RegistryWarning } from '../registry.js';
import type { State } from '../schemas/state.js';

export interface StateCorruptWarning {
  kind: 'state-corrupt';
  archivedTo: string;
  message: string;
}

export interface StateSchemaMismatchWarning {
  kind: 'state-schema-mismatch';
  foundVersion: number;
  message: string;
}

export type AnyWarning = RegistryWarning | StateCorruptWarning | StateSchemaMismatchWarning;

export interface StartResult {
  outputStyleOk: boolean;
  preflight: { skipped: true; reason: 'cycle-1' };
  paths: PathInfo[];
  state: State | null;
  warnings: AnyWarning[];
}

export async function runStart({ projectRoot }: { projectRoot: string }): Promise<StartResult> {
  const styleResult = await probeOutputStyle();
  const pathsRoot = path.join(projectRoot, 'paths');
  const registry = await scanRegistry(pathsRoot);

  if (!styleResult.ok) {
    return {
      outputStyleOk: false,
      preflight: { skipped: true, reason: 'cycle-1' },
      paths: registry.paths,
      state: null,
      warnings: registry.warnings,
    };
  }

  // outputStyleOk === true: now load state
  const stateResult = await loadState(projectRoot);

  const warnings: AnyWarning[] = [...registry.warnings];
  let state: State | null = null;

  if (stateResult.kind === 'ok') {
    state = stateResult.state;
  } else if (stateResult.kind === 'corrupt') {
    warnings.push({
      kind: 'state-corrupt',
      archivedTo: stateResult.archivedTo,
      message: stateResult.message,
    });
  } else if (stateResult.kind === 'schema-mismatch') {
    warnings.push({
      kind: 'state-schema-mismatch',
      foundVersion: stateResult.foundVersion,
      message: stateResult.message,
    });
  }
  // 'absent' → state stays null, no warning

  return {
    outputStyleOk: true,
    preflight: { skipped: true, reason: 'cycle-1' },
    paths: registry.paths,
    state,
    warnings,
  };
}
