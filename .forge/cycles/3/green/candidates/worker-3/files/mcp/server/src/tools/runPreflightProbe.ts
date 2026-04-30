// runPreflightProbe tool handler.
// This is the ONLY tool that may emit action.kind === 'shell' (A12).
// Precondition gate (A13): checks #1/#4/#6 before invoking the deploy executor.

import { PROBE_ORDER, runProbe } from '../preflight.js';
import { runDeployRemediation } from '../probes/manifest.js';
import type { ProbeId } from '../probeTypes.js';
import type { PreflightDeployPreconditionFailedWarning } from '../warnings.js';

export interface RunPreflightProbeArgs {
  probeId: string;
  remediate?: boolean;
}

export interface RunPreflightProbeResult {
  pass: boolean;
  message: string;
  action?: { kind: 'shell'; command: string; cwd?: string; timeoutMs?: number };
  logs?: string[];
  warning?: { kind: string; probeId?: string; message?: string; logs?: string[] };
}

// Precondition probes that must pass before the deploy executor may spawn.
const DEPLOY_PRECONDITION_PROBES: ProbeId[] = [
  'docker-running',
  'sui-cli-version',
  'sandbox-repo-present',
];

export async function runPreflightProbe(
  args: RunPreflightProbeArgs,
): Promise<RunPreflightProbeResult> {
  const { probeId, remediate = false } = args;

  // Validate probeId against PROBE_ORDER.
  if (!(PROBE_ORDER as readonly string[]).includes(probeId)) {
    return {
      pass: false,
      message: `Unknown probe id: '${probeId}'. Valid probe ids are: ${PROBE_ORDER.join(', ')}`,
    };
  }

  const typedProbeId = probeId as ProbeId;
  const probeResult = await runProbe(typedProbeId, { remediate });

  // If remediate is false, or no shell action attached, return probe result as-is.
  if (!remediate || !probeResult.action || probeResult.action.kind !== 'shell') {
    return probeResult;
  }

  // remediate === true AND probe returned a shell action.
  // Enforce precondition gate: probes #1, #4, #6 must pass.
  for (const preconditionId of DEPLOY_PRECONDITION_PROBES) {
    const check = await runProbe(preconditionId, {});
    if (!check.pass) {
      const warning: PreflightDeployPreconditionFailedWarning = {
        kind: 'preflight-deploy-precondition-failed',
        probeId: preconditionId,
        message: `Precondition probe '${preconditionId}' failed: ${check.message}. Deploy aborted.`,
      };
      return {
        pass: false,
        message: `Cannot deploy: precondition '${preconditionId}' is not satisfied. ${check.message}`,
        warning,
      };
    }
  }

  // Preconditions pass — invoke the deploy executor.
  const deployResult = await runDeployRemediation(probeResult.action);

  return {
    pass: deployResult.pass,
    message: deployResult.message,
    logs: deployResult.logs,
    warning: deployResult.warning,
  };
}
