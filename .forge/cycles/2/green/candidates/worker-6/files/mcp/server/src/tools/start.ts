import * as path from 'node:path';
import { probeOutputStyle } from '../outputStyle.js';
import { scanRegistry } from '../registry.js';
import { loadState } from '../state.js';
import type { PathInfo, RegistryWarning } from '../registry.js';
import type { State } from '../schemas/state.js';

export interface StateCorruptWarning {
  kind: 'state-corrupt';
  message: string;
  archivedTo: string;
}

export interface StateSchemaMismatchWarning {
  kind: 'state-schema-mismatch';
  message: string;
  foundVersion: number;
}

export type StartWarning = RegistryWarning | StateCorruptWarning | StateSchemaMismatchWarning;

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
  const warnings: StartWarning[] = [...registry.warnings];

  // AC-1.3 / A9: only probe state when outputStyleOk is true
  if (!styleResult.ok) {
    return {
      outputStyleOk: false,
      preflight: { skipped: true, reason: 'cycle-1' },
      paths: registry.paths,
      state: null,
      warnings,
    };
  }

  const stateResult = await loadState(projectRoot);
  let state: State | null = null;

  if (stateResult.kind === 'ok') {
    state = stateResult.state;
  } else if (stateResult.kind === 'corrupt') {
    warnings.push({
      kind: 'state-corrupt',
      message: stateResult.message,
      archivedTo: stateResult.archivedTo ?? '',
    });
  } else if (stateResult.kind === 'schema-mismatch') {
    warnings.push({
      kind: 'state-schema-mismatch',
      message: stateResult.message,
      foundVersion: stateResult.foundVersion,
    });
  }
  // kind === 'absent' → state stays null, no warning added

  return {
    outputStyleOk: true,
    preflight: { skipped: true, reason: 'cycle-1' },
    paths: registry.paths,
    state,
    warnings,
  };
}
