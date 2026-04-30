import * as path from 'node:path';
import { probeOutputStyle } from '../outputStyle.js';
import { scanRegistry } from '../registry.js';
import { loadState } from '../state.js';
import type { PathInfo, RegistryWarning } from '../registry.js';
import type { State } from '../schemas/state.js';

export interface StateWarning {
  kind: 'state-corrupt' | 'state-schema-mismatch';
  message: string;
  archivedTo?: string;
  foundVersion?: number;
}

export interface StartResult {
  outputStyleOk: boolean;
  preflight: { skipped: true; reason: 'cycle-1' };
  paths: PathInfo[];
  state: State | null;
  warnings: Array<RegistryWarning | StateWarning>;
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

  // outputStyleOk is true — now load state
  const stateResult = await loadState(projectRoot);

  const warnings: Array<RegistryWarning | StateWarning> = [...registry.warnings];
  let state: State | null = null;

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
  // absent → state stays null, no warning

  return {
    outputStyleOk: true,
    preflight: { skipped: true, reason: 'cycle-1' },
    paths: registry.paths,
    state,
    warnings,
  };
}
