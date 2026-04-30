import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import type { ProbeResult, ShellAction } from '../preflight.js';
import { runProbe } from '../preflight.js';
import type { PreflightWarning } from '../warnings.js';

const MANIFEST_URL = 'http://localhost:9009/manifest';
const SANDBOX_CWD = path.join(os.homedir(), 'workspace', 'deepbook-sandbox', 'sandbox');
const DEPLOY_TIMEOUT_MS = 420000; // 7 minutes

function makeSandboxAction(): ShellAction {
  return {
    kind: 'shell',
    command: 'pnpm deploy-all --quick',
    cwd: SANDBOX_CWD,
    timeoutMs: DEPLOY_TIMEOUT_MS,
  };
}

export async function probeSandboxManifestReachable(): Promise<ProbeResult> {
  try {
    const res = await fetch(MANIFEST_URL);
    if (res.ok) {
      return { pass: true, message: 'Sandbox manifest is reachable at http://localhost:9009/manifest.' };
    }
    return {
      pass: false,
      message: `Sandbox manifest returned HTTP ${res.status}. Run pnpm deploy-all --quick in the sandbox directory.`,
      action: makeSandboxAction(),
    };
  } catch (err) {
    return {
      pass: false,
      message: `Sandbox manifest is not reachable: ${err instanceof Error ? err.message : String(err)}. Run pnpm deploy-all --quick in the sandbox directory.`,
      action: makeSandboxAction(),
    };
  }
}

// Precondition probe IDs that must pass before spawning the REAL deploy.
// A13: only gates the real-mode spawn (not the stub).
const PRECONDITION_PROBES = ['docker-running', 'sui-cli-version', 'sandbox-repo-present'] as const;
type PreconditionProbeId = typeof PRECONDITION_PROBES[number];

export interface DeployRemediationResult {
  pass: boolean;
  message: string;
  logs?: string[];
  warning?: PreflightWarning;
}

/**
 * Run the deploy remediation (pnpm deploy-all --quick).
 *
 * The sole env-var switch for the stub branch is E2E_DEPLOY_STUB === '1'.
 * No other env var, flag, or config routes to the stub.
 *
 * Precondition gate (A13) only applies to the real-mode spawn. In stub mode
 * (E2E_DEPLOY_STUB=1), the stub fires immediately without checking preconditions,
 * because the stub never spawns a real process.
 */
export async function runDeployRemediation(action: ShellAction): Promise<DeployRemediationResult> {
  // Branch first: stub vs real
  // A14: E2E_DEPLOY_STUB === '1' is the SOLE entry point to the stub branch.
  if (process.env.E2E_DEPLOY_STUB === '1') {
    return runDeployStub();
  }

  // A13: Gate the real-mode spawn on preconditions.
  for (const probeId of PRECONDITION_PROBES) {
    const result = await runProbe(probeId as PreconditionProbeId, {});
    if (!result.pass) {
      return {
        pass: false,
        message: `Cannot deploy: prerequisite probe '${probeId}' failed. ${result.message}`,
        warning: {
          kind: 'preflight-deploy-precondition-failed',
          message: `Prerequisite probe '${probeId}' must pass before deploying. ${result.message}`,
          probeId,
        },
      };
    }
  }

  return runRealDeploy(action);
}

function runDeployStub(): DeployRemediationResult {
  return {
    pass: false,
    message: '[E2E_DEPLOY_STUB] Deploy stub executed — manifest not brought up. Run pnpm down to clean up.',
    logs: ['[stub] pnpm deploy-all --quick (stub branch)'],
  };
}

async function runRealDeploy(action: ShellAction): Promise<DeployRemediationResult> {
  const cwd = action.cwd ?? SANDBOX_CWD;
  const timeoutMs = action.timeoutMs ?? DEPLOY_TIMEOUT_MS;
  const logs: string[] = [];

  return new Promise<DeployRemediationResult>((resolve) => {
    const child = spawn('pnpm', ['deploy-all', '--quick'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      // After timeout, resolve with timeout warning.
      resolve({
        pass: false,
        message: `Deploy timed out after ${timeoutMs}ms. Run \`pnpm down\` in the sandbox directory to clean up.`,
        logs,
        warning: {
          kind: 'preflight-deploy-timeout',
          message: `pnpm deploy-all --quick exceeded ${timeoutMs}ms. Run \`pnpm down\` in the sandbox directory to clean up.`,
          logs,
        },
      });
    }, timeoutMs);

    if (child.stdout !== null) {
      child.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter((l) => l.length > 0);
        logs.push(...lines);
      });
    }

    if (child.stderr !== null) {
      child.stderr.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter((l) => l.length > 0);
        logs.push(...lines);
      });
    }

    child.on('close', (_code: number | null) => {
      if (settled) return;
      clearTimeout(timer);

      // After spawn completes (regardless of exit code), re-probe manifest up to 3 times.
      probeManifestWithRetries(3, logs).then((finalResult) => {
        if (!settled) {
          settled = true;
          resolve(finalResult);
        }
      }).catch(() => {
        if (!settled) {
          settled = true;
          resolve({
            pass: false,
            message: `Deploy finished but manifest never came up. Run \`pnpm down\` in the sandbox directory to clean up.`,
            logs,
          });
        }
      });
    });
  });
}

async function probeManifestWithRetries(maxAttempts: number, logs: string[]): Promise<DeployRemediationResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(MANIFEST_URL);
      if (res.ok) {
        return {
          pass: true,
          message: 'Sandbox manifest is now reachable.',
          logs,
        };
      }
    } catch {
      // Network error — keep retrying
    }
  }

  return {
    pass: false,
    message: `Sandbox manifest still not reachable after ${maxAttempts} re-probes. Run \`pnpm down\` in the sandbox directory to clean up.`,
    logs,
  };
}
