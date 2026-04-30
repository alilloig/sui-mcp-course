import * as preflight from '../preflight.js';
import type { ProbeId } from '../preflight.js';
import { runDeployRemediation } from '../probes/manifest.js';

export interface RunPreflightProbeInput {
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
  lines?: string[];
  warning?: {
    kind: string;
    probeId?: string;
    message: string;
    logs?: string[];
  };
}

// Precondition probe ids that must pass before deploy is allowed.
const DEPLOY_PRECONDITIONS: readonly ProbeId[] = [
  'docker-running',
  'sui-cli-version',
  'sandbox-repo-present',
] as const;

export async function runPreflightProbe(
  input: RunPreflightProbeInput,
): Promise<RunPreflightProbeResult> {
  const { probeId, remediate = false } = input;

  // Validate probeId
  if (!preflight.PROBE_ORDER.includes(probeId as ProbeId)) {
    return {
      pass: false,
      message: `Unknown probe id: "${probeId}". Valid probe ids are: ${preflight.PROBE_ORDER.join(', ')}`,
    };
  }

  const id = probeId as ProbeId;
  const probeResult = await preflight.runProbe(id, {});

  // If remediate is false, or the probe passed, or there is no action, return
  // the probe result as-is.
  if (!remediate || probeResult.pass || !probeResult.action) {
    return probeResult;
  }

  // remediate === true AND probe failed AND has a shell action.
  // Check deploy preconditions first.
  for (const preconditionId of DEPLOY_PRECONDITIONS) {
    const preconditionResult = await preflight.runProbe(preconditionId, {});
    if (!preconditionResult.pass) {
      return {
        pass: false,
        message: `Cannot remediate: precondition probe "${preconditionId}" failed. ${preconditionResult.message}`,
        warning: {
          kind: 'preflight-deploy-precondition-failed',
          probeId: preconditionId,
          message: `Deploy remediation blocked: probe "${preconditionId}" failed — ${preconditionResult.message}`,
        },
      };
    }
  }

  // All preconditions pass — run the deploy executor.
  const deployResult = await runDeployRemediation(probeResult.action);

  return {
    pass: deployResult.pass,
    message: deployResult.message,
    logs: deployResult.logs,
    ...(deployResult.warning ? { warning: deployResult.warning } : {}),
  };
}
