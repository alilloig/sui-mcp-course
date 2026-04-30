import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const PLUGIN_KEY = 'learning-output-style@claude-plugins-official';

export interface OutputStyleWarning {
  kind: string;
  message: string;
}

export interface OutputStyleResult {
  ok: boolean;
  warning?: OutputStyleWarning;
}

export async function probeOutputStyle(): Promise<OutputStyleResult> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  let raw: string;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch {
    return {
      ok: false,
      warning: {
        kind: 'settings-file-missing',
        message: `Settings file not found: ${settingsPath}`,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      warning: {
        kind: 'settings-file-malformed',
        message: `Failed to parse settings.json: ${String(err)}`,
      },
    };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    return { ok: false };
  }

  const settings = parsed as Record<string, unknown>;
  const enabledPlugins = settings['enabledPlugins'];

  if (
    typeof enabledPlugins !== 'object' ||
    enabledPlugins === null ||
    Array.isArray(enabledPlugins)
  ) {
    return { ok: false };
  }

  const pluginsMap = enabledPlugins as Record<string, unknown>;
  const enabled = pluginsMap[PLUGIN_KEY];

  if (enabled === true) {
    return { ok: true };
  }

  return { ok: false };
}
