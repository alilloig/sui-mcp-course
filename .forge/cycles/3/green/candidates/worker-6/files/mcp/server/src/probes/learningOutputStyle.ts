import { probeOutputStyle } from '../outputStyle.js';
import type { ProbeResult } from '../preflight.js';

// A9: This file imports probeOutputStyle from outputStyle.ts and re-classifies
// the result. It does NOT contain the literal plugin key
// 'learning-output-style@claude-plugins-official' — that lives only in outputStyle.ts.
export async function probeLearningOutputStyle(_opts: Record<string, unknown> = {}): Promise<ProbeResult> {
  const result = await probeOutputStyle();

  if (result.ok) {
    return { pass: true, message: 'learning-output-style plugin is enabled.' };
  }

  // Re-classify: surface the underlying warning message if available.
  const msg = result.warning?.message ?? 'learning-output-style plugin is not enabled or misconfigured.';
  return {
    pass: false,
    message: msg,
  };
}
