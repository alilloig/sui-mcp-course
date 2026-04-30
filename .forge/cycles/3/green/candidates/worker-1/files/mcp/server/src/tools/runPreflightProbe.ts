import { PROBE_ORDER, runProbe } from '../preflight.js';
import type { ProbeId, ProbeResult } from '../preflight.js';
import { runDeployRemediation } from '../probes/manifest.js';
import type { PreflightWarning } from '../warnings.js';

export interface RunPreflightProbeInput {
  probeId?: string;
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
  warning?: PreflightWarning;
}

export async function runPreflightProbe(
  input: RunPreflightProbeInput,
): Promise<RunPreflightProbeResult> {
  const { probeId, remediate = false } = input;

  // Validate probeId
  if (!probeId || !(PROBE_ORDER as readonly string[]).includes(probeId)) {
    return {
      pass: false,
      message: `Unknown probe id: '${probeId ?? ''}'. Valid ids are: ${PROBE_ORDER.join(', ')}`,
    };
  }

  const validProbeId = probeId as ProbeId;

  // Run the requested probe
  const probeResult: ProbeResult = await runProbe(validProbeId, {});

  // If no shell action is attached, or remediate is not requested, return as-is
  if (!remediate || !probeResult.action || probeResult.action.kind !== 'shell') {
    return probeResult;
  }

  // remediate: true AND probe returned a shell action — invoke deploy executor
  // First, check preconditions (#1 docker-running, #4 sui-cli-version, #6 sandbox-repo-present)
  const dockerResult = await runProbe('docker-running', {});
  if (!dockerResult.pass) {
    return {
      pass: false,
      message: 'Cannot remediate: Docker is not running.',
      warning: {
        kind: 'preflight-deploy-precondition-failed',
        message: 'Deploy remediation refused: docker-running precondition failed.',
        probeId: 'docker-running',
      },
    };
  }

  const suiCliResult = await runProbe('sui-cli-version', {});
  if (!suiCliResult.pass) {
    return {
      pass: false,
      message: 'Cannot remediate: Sui CLI version is out of range.',
      warning: {
        kind: 'preflight-deploy-precondition-failed',
        message: 'Deploy remediation refused: sui-cli-version precondition failed.',
        probeId: 'sui-cli-version',
      },
    };
  }

  const sandboxRepoResult = await runProbe('sandbox-repo-present', {});
  if (!sandboxRepoResult.pass) {
    return {
      pass: false,
      message: 'Cannot remediate: sandbox repository is absent.',
      warning: {
        kind: 'preflight-deploy-precondition-failed',
        message: 'Deploy remediation refused: sandbox-repo-present precondition failed.',
        probeId: 'sandbox-repo-present',
      },
    };
  }

  // All preconditions pass — invoke the deploy executor
  const deployResult = await runDeployRemediation(probeResult.action, {
    dockerPass: true,
    suiCliPass: true,
    sandboxRepoPass: true,
  });

  return {
    pass: deployResult.pass,
    message: deployResult.message,
    logs: deployResult.logs,
    warning: deployResult.warning,
  };
}
