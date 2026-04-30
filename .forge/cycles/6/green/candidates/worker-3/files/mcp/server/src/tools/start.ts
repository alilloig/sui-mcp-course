import * as path from 'node:path';
import { probeOutputStyle } from '../outputStyle.js';
import { scanRegistry } from '../registry.js';
import type { PathInfo, RegistryWarning } from '../registry.js';
import { loadState } from '../state.js';
import type { State } from '../state.js';
import type { StateWarning, OutputStylePluginNotEnabledWarning } from '../warnings.js';

export type { StateWarning };

export interface StartResult {
  outputStyleOk: boolean;
  preflight: { skipped: true; reason: 'cycle-1' };
  paths: PathInfo[];
  state: State | null;
  warnings: (RegistryWarning | StateWarning | OutputStylePluginNotEnabledWarning)[];
}

export async function runStart({ projectRoot }: { projectRoot: string }): Promise<StartResult> {
  const styleResult = await probeOutputStyle();
  const pathsRoot = path.join(projectRoot, 'paths');
  const registry = await scanRegistry(pathsRoot);

  if (!styleResult.ok) {
    const warnings: (RegistryWarning | StateWarning | OutputStylePluginNotEnabledWarning)[] = [...registry.warnings];
    if (styleResult.warning) {
      warnings.unshift(styleResult.warning as OutputStylePluginNotEnabledWarning);
    }
    return {
      outputStyleOk: false,
      preflight: { skipped: true, reason: 'cycle-1' },
      paths: registry.paths,
      state: null,
      warnings,
    };
  }

  // Only load state when outputStyleOk === true (AC-1.3)
  const stateResult = await loadState(projectRoot);

  const warnings: (RegistryWarning | StateWarning | OutputStylePluginNotEnabledWarning)[] = [...registry.warnings];
  let state: State | null = null;

  switch (stateResult.kind) {
    case 'absent':
      // No state file — clean first run, no warning
      break;

    case 'ok':
      // Valid state loaded
      state = stateResult.state;
      break;

    case 'corrupt': {
      // Push state-corrupt warning. archivedTo is omitted when no archive
      // was written (read-error path, or archive-write failure) so cycle 4's
      // recovery flow can distinguish "bytes archived; safe to reset" from
      // "bytes were never readable; manual intervention needed".
      const warning: StateWarning = {
        kind: 'state-corrupt',
        message: stateResult.message,
      };
      if (stateResult.archivedTo !== undefined) {
        (warning as { archivedTo?: string }).archivedTo = stateResult.archivedTo;
      }
      warnings.push(warning);
      break;
    }

    case 'schema-mismatch':
      // Push state-schema-mismatch warning with offending version
      warnings.push({
        kind: 'state-schema-mismatch',
        message: stateResult.message,
        foundVersion: stateResult.foundVersion,
      });
      break;
  }

  return {
    outputStyleOk: true,
    preflight: { skipped: true, reason: 'cycle-1' },
    paths: registry.paths,
    state,
    warnings,
  };
}
