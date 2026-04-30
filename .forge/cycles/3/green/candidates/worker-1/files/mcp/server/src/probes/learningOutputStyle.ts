import { probeOutputStyle } from '../outputStyle.js';
import type { ProbeResult } from './types.js';

// Probe #8: learning-output-style-enabled
// This probe is a thin wrapper that delegates to probeOutputStyle() from
// outputStyle.ts — it does NOT re-implement the settings-file parsing.
// The literal 'learning-output-style@claude-plugins-official' lives ONLY in
// outputStyle.ts; a grep of THIS file for that literal must return zero matches.

export async function runLearningOutputStyleProbe(): Promise<ProbeResult> {
  const result = await probeOutputStyle();

  if (result.ok) {
    return {
      pass: true,
      message: 'Learning output style plugin is enabled.',
    };
  }

  // Re-classify the OutputStyleResult as a probe outcome
  const warningMessage = result.warning?.message ?? 'Learning output style plugin is not enabled.';
  return {
    pass: false,
    message: warningMessage,
  };
}
