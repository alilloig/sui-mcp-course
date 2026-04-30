import * as path from 'node:path';
import { probeOutputStyle } from '../outputStyle.js';
import { scanRegistry } from '../registry.js';
import type { PathInfo, RegistryWarning } from '../registry.js';

export interface StartResult {
  outputStyleOk: boolean;
  preflight: { skipped: true; reason: 'cycle-1' };
  paths: PathInfo[];
  state: null;
  warnings: RegistryWarning[];
}

export async function runStart({ projectRoot }: { projectRoot: string }): Promise<StartResult> {
  const styleResult = await probeOutputStyle();
  const pathsRoot = path.join(projectRoot, 'paths');
  const registry = await scanRegistry(pathsRoot);

  return {
    outputStyleOk: styleResult.ok,
    preflight: { skipped: true, reason: 'cycle-1' },
    paths: registry.paths,
    state: null,
    warnings: registry.warnings,
  };
}
