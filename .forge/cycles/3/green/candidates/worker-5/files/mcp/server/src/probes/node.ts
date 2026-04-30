import type { ProbeResult } from '../preflight.js';

export function probeNodeVersion(): ProbeResult {
  const version = process.version; // e.g. 'v20.10.0'
  const match = version.match(/^v?(\d+)/);
  const major = match ? parseInt(match[1], 10) : 0;

  if (major >= 18) {
    return { pass: true, message: `Node.js version ${version} is supported (>= 18).` };
  }

  return {
    pass: false,
    message: `Node.js version ${version} is not supported. Please upgrade to Node.js >= 18.`,
  };
}
