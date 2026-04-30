import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface ProbeResult {
  pass: boolean;
  message: string;
  action?: undefined;
}

export async function probe(): Promise<ProbeResult> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  let raw: string;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch (_err) {
    return {
      pass: false,
      message: 'Could not read ~/.claude/settings.json. Enable the plugin with: claude plugins enable sui-pilot',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    return {
      pass: false,
      message: 'Failed to parse ~/.claude/settings.json. Enable the plugin with: claude plugins enable sui-pilot',
    };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['enabledPlugins'] !== 'object' ||
    (parsed as Record<string, unknown>)['enabledPlugins'] === null
  ) {
    return {
      pass: false,
      message: 'sui-pilot is not enabled. Enable it with: claude plugins enable sui-pilot',
    };
  }

  const enabledPlugins = (parsed as Record<string, unknown>)['enabledPlugins'] as Record<
    string,
    unknown
  >;

  const hasEnabled = Object.keys(enabledPlugins).some(
    (key) => key.startsWith('sui-pilot@') && enabledPlugins[key] === true,
  );

  if (hasEnabled) {
    return {
      pass: true,
      message: 'sui-pilot plugin is enabled.',
    };
  }

  return {
    pass: false,
    message: 'sui-pilot is not enabled. Enable it with: claude plugins enable sui-pilot',
  };
}
