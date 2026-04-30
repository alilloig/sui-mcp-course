import { probeOutputStyle } from '../outputStyle.js';

export interface ProbeResult {
  pass: boolean;
  message: string;
  action?: undefined;
}

export async function probe(): Promise<ProbeResult> {
  const result = await probeOutputStyle();

  if (result.ok) {
    return {
      pass: true,
      message: 'learning-output-style plugin is enabled.',
    };
  }

  const warningMsg = result.warning?.message ?? 'learning-output-style plugin is not enabled.';
  return {
    pass: false,
    message: warningMsg,
  };
}
