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

  if (!styleResult.ok) {
    return {
      outputStyleOk: false,
      preflight: { skipped: true, reason: 'cycle-1' },
      paths: [],
      state: null,
      warnings: styleResult.warning ? [styleResult.warning] : [],
    };
  }

  const pathsRoot = path.join(projectRoot, 'paths');
  const registry = await scanRegistry(pathsRoot);

  const stateResult = await loadState(projectRoot);

  let state: State | null = null;
  const warnings: StartWarning[] = [...registry.warnings];

  if (stateResult.kind === 'ok') {
    state = stateResult.state;
  } else if (stateResult.kind === 'corrupt') {
    warnings.push({
      kind: 'state-corrupt',
      message: stateResult.message,
      archivedTo: stateResult.archivedTo,
    });
  } else if (stateResult.kind === 'schema-mismatch') {
    warnings.push({
      kind: 'state-schema-mismatch',
      message: stateResult.message,
      foundVersion: stateResult.foundVersion,
    });
  }
  // 'absent' → state stays null, no warning added

  return {
    outputStyleOk: true,
    preflight: { skipped: true, reason: 'cycle-1' },
    paths: registry.paths,
    state,
    warnings,
  };
}
