import { runProbe, PROBE_ORDER } from '../preflight.js';
import type { ProbeResult, ProbeId } from '../preflight.js';
import { runDeployRemediation } from '../probes/manifest.js';

export interface RunPreflightProbeArgs {
  probeId: string;
  remediate?: boolean;
}

export interface RunPreflightProbeResult {
  pass: boolean;
  message: string;
  action?: {
    kind: 'shell';
    command: string;
    cwd?: string;
    timeoutMs?: number;
  };
  logs?: string[];
  warning?: {
    kind: string;
    probeId?: string;
    message: string;
    logs?: string[];
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

  // Run the probe
  const probeResult: ProbeResult = await runProbe(probeId as ProbeId, {});

  // If not remediating, or no shell action, return the probe result as-is
  if (!remediate || !probeResult.action || probeResult.action.kind !== 'shell') {
    return {
      pass: probeResult.pass,
      message: probeResult.message,
      ...(probeResult.action ? { action: probeResult.action } : {}),
    };
  }

  // remediate: true AND probe returned a shell action — invoke deploy executor
  const deployResult = await runDeployRemediation(probeResult.action, runProbe);

  if (deployResult.warning) {
    return {
      pass: deployResult.pass,
      message: deployResult.message,
      ...(deployResult.logs ? { logs: deployResult.logs } : {}),
      warning: deployResult.warning,
    };
  }

  return {
    pass: deployResult.pass,
    message: deployResult.message,
    ...(deployResult.logs ? { logs: deployResult.logs } : {}),
  };
}
