// Probe #8: learning-output-style-enabled
// Delegates to probeOutputStyle from outputStyle.ts and re-classifies the result.
// IMPORTANT: the literal 'learning-output-style@claude-plugins-official' must NOT
// appear in this file — it lives only in outputStyle.ts. This probe is a thin wrapper.

import { probeOutputStyle } from '../outputStyle.js';
import type { ProbeOpts, ProbeResult } from '../probeTypes.js';

export async function run(_opts: ProbeOpts): Promise<ProbeResult> {
  const result = await probeOutputStyle();

  if (result.ok) {
    return { pass: true, message: 'learning-output-style plugin is enabled.' };
  }

  const message =
    result.warning?.message ??
    'The learning-output-style plugin is not enabled. Enable it to use this course.';

  return { pass: false, message };
}
