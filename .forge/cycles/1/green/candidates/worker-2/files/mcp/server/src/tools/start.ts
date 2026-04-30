import * as path from 'node:path';
import { probeOutputStyle } from '../outputStyle.js';
import { scanRegistry, type PathInfo, type RegistryWarning } from '../registry.js';

export interface StartResult {
  outputStyleOk: boolean;
  preflight: { skipped: true; reason: 'cycle-1' };
  paths: PathInfo[];
  state: null;
  warnings: RegistryWarning[];
}

export async function runStart(args: { projectRoot: string }): Promise<StartResult> {
  const { projectRoot } = args;

  const outputStyleResult = await probeOutputStyle();
  const outputStyleOk = outputStyleResult.ok;

  const pathsRoot = path.join(projectRoot, 'paths');
  const registry = await scanRegistry(pathsRoot);

  return {
    outputStyleOk,
    preflight: { skipped: true, reason: 'cycle-1' },
    paths: registry.paths,
    state: null,
    warnings: registry.warnings,
  };
}
