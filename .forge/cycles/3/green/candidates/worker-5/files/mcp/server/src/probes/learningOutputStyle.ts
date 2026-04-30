import { probeOutputStyle } from '../outputStyle.js';
import type { ProbeResult } from '../preflight.js';

export async function probeLearningOutputStyleEnabled(): Promise<ProbeResult> {
  const result = await probeOutputStyle();

  if (result.ok) {
    return { pass: true, message: 'learning-output-style plugin is enabled.' };
  }

  const warningMessage = result.warning?.message ?? 'learning-output-style plugin is not enabled.';
  return {
    pass: false,
    message: warningMessage,
  };
}
