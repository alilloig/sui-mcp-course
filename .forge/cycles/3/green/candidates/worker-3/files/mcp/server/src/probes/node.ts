// Probe #2: node-version
// Reads process.version, parses major; fails when < 18.
// No shell action on either branch.

import type { ProbeOpts, ProbeResult } from '../probeTypes.js';

export async function run(_opts: ProbeOpts): Promise<ProbeResult> {
  const version = process.version; // e.g. "v20.10.0"
  const match = version.match(/^v?(\d+)/);
  const major = match ? parseInt(match[1], 10) : 0;

  if (major >= 18) {
    return { pass: true, message: `Node.js version ${version} is supported (>= 18).` };
  }

  return {
    pass: false,
    message: `Node.js version ${version} is too old. Node 18 or newer is required. Please upgrade Node.js.`,
  };
}
