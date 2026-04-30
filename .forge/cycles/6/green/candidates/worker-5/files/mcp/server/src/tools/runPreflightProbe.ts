import { PROBE_ORDER, runProbe } from '../preflight.js';
import type { ProbeId, ProbeResult, ProbeOptions } from '../preflight.js';
import { runDeployRemediation } from '../probes/manifest.js';
import type { PreflightDeployPreconditionFailedWarning, PreflightDeployTimeoutWarning } from '../warnings.js';

export interface RunPreflightProbeArgs {
  probeId: string;
  remediate?: boolean;
  // H004 fix: accept optional probeOpts map so the harness can inject
  // per-probe SpawnFn stubs through runDeployRemediation's precondition gate.
  probeOpts?: Partial<Record<ProbeId, ProbeOptions>>;
}

export interface RunPreflightProbeResult {
  pass: boolean;
  message: string;
  action?: { kind: 'shell'; command: string; cwd?: string; timeoutMs?: number };
  logs?: string[];
  warning?: PreflightDeployPreconditionFailedWarning | PreflightDeployTimeoutWarning;
}

export async function runPreflightProbe(
  args: RunPreflightProbeArgs,
): Promise<RunPreflightProbeResult> {
  const { probeId, remediate = false, probeOpts = {} } = args;

  // Validate probeId
  if (!(PROBE_ORDER as readonly string[]).includes(probeId)) {
    return {
      pass: false,
      message: `Unknown probe id: '${probeId}'. Valid ids are: ${PROBE_ORDER.join(', ')}`,
    };
  }

  // Run the probe (use probeOpts for the target probe itself if supplied)
  let probeResult: ProbeResult;
  try {
    probeResult = await runProbe(probeId as ProbeId, probeOpts[probeId as ProbeId] ?? {});
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

  // remediate=true AND probe failed AND action is a shell action.
  // H004 fix: thread probeOpts into runDeployRemediation's precondition checker
  // so harness stub injections (withDockerStub, etc.) flow through the gate.
  const deployResult = await runDeployRemediation(
    probeResult.action,
    (pid) => runProbe(pid as ProbeId, probeOpts[pid as ProbeId] ?? {}),
  );

  return {
    pass: deployResult.pass,
    message: deployResult.message,
    ...(deployResult.logs ? { logs: deployResult.logs } : {}),
    ...(deployResult.warning ? { warning: deployResult.warning } : {}),
  };
}
