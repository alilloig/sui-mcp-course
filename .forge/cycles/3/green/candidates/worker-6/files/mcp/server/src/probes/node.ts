import type { ProbeResult } from '../preflight.js';

export async function probeNode(_opts: Record<string, unknown> = {}): Promise<ProbeResult> {
  const version = process.version; // e.g. 'v20.10.0'
  const match = version.match(/^v?(\d+)\./);
  const major = match ? parseInt(match[1], 10) : 0;

  if (major >= 18) {
    return { pass: true, message: `Node.js ${version} meets the minimum requirement (>= 18).` };
  }

  return {
    pass: false,
    message: `Node.js version ${version} is below the minimum required (>= 18). Please upgrade Node.js.`,
  };
}
