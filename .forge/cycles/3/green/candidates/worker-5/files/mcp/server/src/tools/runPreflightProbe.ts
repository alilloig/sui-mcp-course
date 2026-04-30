import { PROBE_ORDER, runProbe } from '../preflight.js';
import type { ProbeId } from '../preflight.js';
import { runDeployRemediation } from '../probes/manifest.js';
import type { PreflightWarning } from '../warnings.js';

export interface RunPreflightProbeArgs {
  probeId: string;
  remediate?: boolean;
}

export interface RunPreflightProbeResult {
  pass: boolean;
  message: string;
  logs?: string[];
  /** Only present on the sandbox-manifest-reachable probe's fail path. */
  action?: { kind: 'shell'; command: string; cwd?: string; timeoutMs?: number };
  warning?: PreflightWarning;
}

export async function runPreflightProbe(args: RunPreflightProbeArgs): Promise<RunPreflightProbeResult> {
  const { probeId, remediate = false } = args;

  // Validate probeId
  if (!(PROBE_ORDER as readonly string[]).includes(probeId)) {
    return {
      pass: false,
      message: `Unknown probe id: '${probeId}'. Valid ids are: ${PROBE_ORDER.join(', ')}`,
    };
  }

  // Run the probe
  const probeResult = await runProbe(probeId as ProbeId, {});

  // If remediate is true AND the probe returned a shell action, run the deploy executor.
  if (
    remediate &&
    probeResult.action !== undefined &&
    probeResult.action.kind === 'shell'
  ) {
    const deployResult = await runDeployRemediation(probeResult.action);
    return {
      pass: deployResult.pass,
      message: deployResult.message,
      logs: deployResult.logs,
      warning: deployResult.warning,
      // Preserve action on the result so the caller can surface the command to the student.
      action: probeResult.action,
    };
  }

  // Return the probe result as-is (with or without action).
  const result: RunPreflightProbeResult = {
    pass: probeResult.pass,
    message: probeResult.message,
  };
  if (probeResult.action !== undefined) {
    result.action = probeResult.action;
  }
  return result;
}
