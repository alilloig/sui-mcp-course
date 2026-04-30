import type { ProbeResult } from './types.js';

export async function runNodeProbe(): Promise<ProbeResult> {
  const version = process.version; // e.g. 'v20.10.0'
  const match = version.match(/^v?(\d+)/);
  const major = match ? parseInt(match[1], 10) : 0;

  if (major >= 18) {
    return {
      pass: true,
      message: `Node.js ${version} detected (>= 18 required).`,
    };
  }

  return {
    pass: false,
    message: `Node.js version ${version} is too old. Version 18 or higher is required.`,
  };
}
