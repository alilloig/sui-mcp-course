import { PROBE_ORDER, runProbe } from '../preflight.js';
import type { ProbeId, ProbeResult, SpawnFn } from '../preflight.js';
import { runDeployRemediation } from '../probes/manifest.js';
import type { PreflightDeployPreconditionFailedWarning, PreflightDeployTimeoutWarning } from '../warnings.js';

export interface RunPreflightProbeArgs {
  probeId: string;
  remediate?: boolean;
}

export interface RunPreflightProbeResult {
  pass: boolean;
  message: string;
  action?: { kind: 'shell'; command: string; cwd?: string; timeoutMs?: number };
  logs?: string[];
  warning?: PreflightDeployPreconditionFailedWarning | PreflightDeployTimeoutWarning;
}

// Test-only spawn injection map. The harness installs stubs here keyed by
// probeId so that runProbe is called with the stub via ProbeOptions.spawn.
// Production callers never touch this map; it is only populated by the test harness.
const _probeSpawnMap = new Map<ProbeId, SpawnFn>();

/**
 * Install a per-probe spawn stub for testing. Returns a cleanup function.
 * Used by the test harness — not part of the production tool surface.
 */
export function installProbeSpawn(probeId: ProbeId, spawnFn: SpawnFn): () => void {
  _probeSpawnMap.set(probeId, spawnFn);
  return () => {
    _probeSpawnMap.delete(probeId);
  };
}

export async function runPreflightProbe(
  args: RunPreflightProbeArgs,
): Promise<RunPreflightProbeResult> {
  const { probeId, remediate = false } = args;

  // Validate probeId
  if (!(PROBE_ORDER as readonly string[]).includes(probeId)) {
    return {
      pass: false,
      message: `Unknown probe id: '${probeId}'. Valid ids are: ${PROBE_ORDER.join(', ')}`,
    };
  }

  const typedProbeId = probeId as ProbeId;

  // Consult per-probe spawn stub from the harness test seam (if any).
  const spawnStub = _probeSpawnMap.get(typedProbeId);
  const probeOpts = spawnStub ? { spawn: spawnStub } : {};

  // Run the probe
  let probeResult: ProbeResult;
  try {
    probeResult = await runProbe(typedProbeId, probeOpts);
  } catch (err) {
    return {
      pass: false,
      message: `Probe '${probeId}' threw an unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // If remediate is false, or probe passed, or there's no shell action — return as-is.
  if (!remediate || probeResult.pass || !probeResult.action || probeResult.action.kind !== 'shell') {
    return {
      pass: probeResult.pass,
      message: probeResult.message,
      ...(probeResult.action ? { action: probeResult.action } : {}),
    };
  }

  // remediate=true AND probe failed AND action is a shell action
  const deployResult = await runDeployRemediation(
    probeResult.action,
    (pid) => runProbe(pid as ProbeId, probeOpts),
  );

  return {
    pass: deployResult.pass,
    message: deployResult.message,
    ...(deployResult.logs ? { logs: deployResult.logs } : {}),
    ...(deployResult.warning ? { warning: deployResult.warning } : {}),
  };
}
