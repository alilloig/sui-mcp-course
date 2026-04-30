// Probe #5: sui-pilot-enabled
// Reads ~/.claude/settings.json and asserts enabledPlugins["sui-pilot@<source>"] === true.
// Pure filesystem read; no shell.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProbeOpts, ProbeResult } from '../probeTypes.js';

const FAIL_MESSAGE = 'The sui-pilot plugin is not enabled. Enable it with: claude plugins enable sui-pilot';

export async function run(_opts: ProbeOpts): Promise<ProbeResult> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  let raw: string;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch (_err) {
    return { pass: false, message: FAIL_MESSAGE };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    return { pass: false, message: FAIL_MESSAGE };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('enabledPlugins' in parsed) ||
    typeof (parsed as Record<string, unknown>)['enabledPlugins'] !== 'object' ||
    (parsed as Record<string, unknown>)['enabledPlugins'] === null
  ) {
    return { pass: false, message: FAIL_MESSAGE };
  }

  const enabledPlugins = (parsed as Record<string, unknown>)['enabledPlugins'] as Record<string, unknown>;

  // Match any key with the prefix 'sui-pilot@' where value === true
  const found = Object.entries(enabledPlugins).some(
    ([key, value]) => key.startsWith('sui-pilot@') && value === true,
  );

  if (found) {
    return { pass: true, message: 'sui-pilot plugin is enabled.' };
  }

  return { pass: false, message: FAIL_MESSAGE };
}
