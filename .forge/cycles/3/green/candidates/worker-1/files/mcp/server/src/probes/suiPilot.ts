import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProbeResult } from './types.js';

export async function runSuiPilotProbe(): Promise<ProbeResult> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  let raw: string;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch {
    return {
      pass: false,
      message: `sui-pilot plugin not found in Claude settings. Enable it with: claude plugins enable sui-pilot`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      pass: false,
      message: `Could not parse Claude settings.json. Enable sui-pilot with: claude plugins enable sui-pilot`,
    };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('enabledPlugins' in parsed) ||
    typeof (parsed as Record<string, unknown>)['enabledPlugins'] !== 'object' ||
    (parsed as Record<string, unknown>)['enabledPlugins'] === null
  ) {
    return {
      pass: false,
      message: `sui-pilot plugin is not enabled. Enable it with: claude plugins enable sui-pilot`,
    };
  }

  const enabledPlugins = (parsed as Record<string, unknown>)['enabledPlugins'] as Record<string, unknown>;

  // Match any key with 'sui-pilot@' prefix that is set to true
  const found = Object.entries(enabledPlugins).some(
    ([key, value]) => key.startsWith('sui-pilot@') && value === true,
  );

  if (found) {
    return {
      pass: true,
      message: 'sui-pilot plugin is enabled.',
    };
  }

  return {
    pass: false,
    message: `sui-pilot plugin is not enabled. Enable it with: claude plugins enable sui-pilot`,
  };
}
