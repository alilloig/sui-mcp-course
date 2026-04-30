import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProbeResult, ShellAction } from './types.js';
import type { PreflightWarning } from '../warnings.js';

const MANIFEST_URL = 'http://localhost:9009/manifest';
const DEPLOY_CMD = 'pnpm deploy-all --quick';
const DEPLOY_TIMEOUT_MS = 420000; // 7 minutes

function getSandboxCwd(): string {
  return path.join(os.homedir(), 'workspace', 'deepbook-sandbox', 'sandbox');
}

function buildShellAction(): ShellAction {
  return {
    kind: 'shell',
    command: DEPLOY_CMD,
    cwd: getSandboxCwd(),
    timeoutMs: DEPLOY_TIMEOUT_MS,
  };
}

async function fetchManifest(): Promise<boolean> {
  try {
    const res = await fetch(MANIFEST_URL);
    return res.ok;
  } catch {
    return false;
  }
}

export async function runManifestProbe(): Promise<ProbeResult> {
  const ok = await fetchManifest();
  if (ok) {
    return {
      pass: true,
      message: 'Sandbox manifest is reachable at http://localhost:9009/manifest.',
    };
  }
  return {
    pass: false,
    message: 'Sandbox manifest is not reachable at http://localhost:9009/manifest.',
    action: buildShellAction(),
  };
}

export interface DeployRemediationResult {
  pass: boolean;
  message: string;
  logs?: string[];
  warning?: PreflightWarning;
}

/**
 * Execute the deploy remediation. Requires probes #1, #4, and #6 to pass
 * as preconditions before spawning.
 *
 * CRITICAL: E2E_DEPLOY_STUB=1 is the SOLE entry to the stub branch.
 * No other env var, flag, or config switch routes to the stub.
 */
export async function runDeployRemediation(
  action: ShellAction,
  preconditionResults: { dockerPass: boolean; suiCliPass: boolean; sandboxRepoPass: boolean },
): Promise<DeployRemediationResult> {
  // Gate: check preconditions
  if (!preconditionResults.dockerPass) {
    return {
      pass: false,
      message: 'Cannot deploy: Docker is not running (probe #1 failed).',
      warning: {
        kind: 'preflight-deploy-precondition-failed',
        message: 'Deploy remediation refused: docker-running precondition failed.',
        probeId: 'docker-running',
      },
    };
  }
  if (!preconditionResults.suiCliPass) {
    return {
      pass: false,
      message: 'Cannot deploy: Sui CLI version is out of range (probe #4 failed).',
      warning: {
        kind: 'preflight-deploy-precondition-failed',
        message: 'Deploy remediation refused: sui-cli-version precondition failed.',
        probeId: 'sui-cli-version',
      },
    };
  }
  if (!preconditionResults.sandboxRepoPass) {
    return {
      pass: false,
      message: 'Cannot deploy: sandbox repository is absent (probe #6 failed).',
      warning: {
        kind: 'preflight-deploy-precondition-failed',
        message: 'Deploy remediation refused: sandbox-repo-present precondition failed.',
        probeId: 'sandbox-repo-present',
      },
    };
  }

  // SOLE stub entry: E2E_DEPLOY_STUB === '1'
  if (process.env.E2E_DEPLOY_STUB === '1') {
    return runDeployStub();
  }

  // Real deploy branch
  return runRealDeploy(action);
}

function runDeployStub(): DeployRemediationResult {
  // Stub branch: never spawns child_process, returns deterministic result.
  return {
    pass: false,
    message: '[E2E_DEPLOY_STUB] deploy stub ran but manifest did not come up. Run pnpm down to clean up.',
    logs: ['[stub] deploy-all --quick exited 0'],
  };
}

function runRealDeploy(action: ShellAction): Promise<DeployRemediationResult> {
  return new Promise((resolve) => {
    const cwd = action.cwd ?? getSandboxCwd();
    const timeoutMs = action.timeoutMs ?? DEPLOY_TIMEOUT_MS;
    const logs: string[] = [];

    const child = spawn('pnpm', ['deploy-all', '--quick'], {
      cwd,
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.length > 0) logs.push(line);
        }
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.length > 0) logs.push(line);
        }
      });
    }

    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({
          pass: false,
          message: `Deploy timed out after ${timeoutMs}ms. Run pnpm down to clean up and try again.`,
          logs,
          warning: {
            kind: 'preflight-deploy-timeout',
            message: `pnpm deploy-all --quick timed out after ${timeoutMs}ms. Captured logs attached. Run pnpm down to clean up.`,
            logs,
          },
        });
        return;
      }
      // After spawn completes, re-probe manifest up to 3 times
      reProbeManifest(logs).then(resolve);
    });
  });
}

async function reProbeManifest(logs: string[]): Promise<DeployRemediationResult> {
  const MAX_ATTEMPTS = 3;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const ok = await fetchManifest();
    if (ok) {
      return {
        pass: true,
        message: 'Sandbox manifest is reachable after deploy.',
        logs,
      };
    }
  }
  return {
    pass: false,
    message: `Sandbox manifest did not come up after ${MAX_ATTEMPTS} re-probes. Run pnpm down to clean up and try again.`,
    logs,
  };
}
