/**
 * Probe stub store — test seam for the e2e harness.
 *
 * The harness can register synchronous spawn stubs here so that the probes
 * use controlled output without touching real system commands. This module
 * lives in the production source tree but only receives entries when the
 * test harness explicitly calls `setProbeSpawnStub`/`clearProbeSpawnStub`.
 *
 * Pattern: harness calls setProbeSpawnStub before callTool; clears after.
 */

import type { SpawnFn } from './types.js';

const stubs = new Map<string, SpawnFn>();

export function setProbeSpawnStub(probeId: string, fn: SpawnFn): void {
  stubs.set(probeId, fn);
}

export function clearProbeSpawnStub(probeId: string): void {
  stubs.delete(probeId);
}

export function clearAllProbeSpawnStubs(): void {
  stubs.clear();
}

export function getProbeSpawnStub(probeId: string): SpawnFn | undefined {
  return stubs.get(probeId);
}
