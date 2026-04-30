import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface OutputStyleWarning {
  kind: string;
  message: string;
}

export interface OutputStyleResult {
  ok: boolean;
  warning?: OutputStyleWarning;
}

const PLUGIN_KEY = 'learning-output-style@claude-plugins-official';

const PLUGIN_NOT_ENABLED_WARNING: OutputStyleWarning = {
  kind: 'output-style-plugin-not-enabled',
  message: `${PLUGIN_KEY} is not enabled. Run: claude plugins enable ${PLUGIN_KEY}`,
};

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
        message: `Settings file not found at ${settingsPath}`,
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
        message: `Failed to parse ${settingsPath}: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('enabledPlugins' in parsed) ||
    typeof (parsed as Record<string, unknown>)['enabledPlugins'] !== 'object' ||
    (parsed as Record<string, unknown>)['enabledPlugins'] === null
  ) {
    return { ok: false, warning: PLUGIN_NOT_ENABLED_WARNING };
  }

  const enabledPlugins = (parsed as Record<string, unknown>)['enabledPlugins'] as Record<string, unknown>;
  const pluginEnabled = enabledPlugins[PLUGIN_KEY];

  if (pluginEnabled === true) {
    return { ok: true };
  }

  return { ok: false, warning: PLUGIN_NOT_ENABLED_WARNING };
}
