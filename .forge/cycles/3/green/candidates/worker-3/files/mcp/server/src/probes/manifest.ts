// Probe #7: sandbox-manifest-reachable
// Fetches http://localhost:9009/manifest; non-200 or error → fail with shell action.
// On fail, attaches action: { kind: 'shell', command: 'pnpm deploy-all --quick', ... }
//
// The deploy executor lives here: runDeployRemediation().
// Two-mode branching driven exclusively by process.env.E2E_DEPLOY_STUB === '1'.
// NOTE: The precondition gate (#1/#4/#6) is enforced by the caller (runPreflightProbe.ts)
// before invoking runDeployRemediation, to avoid a circular dependency with preflight.ts.

import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProbeOpts, ProbeResult, ShellAction } from '../probeTypes.js';
import type { PreflightDeployTimeoutWarning } from '../warnings.js';

const MANIFEST_URL = 'http://localhost:9009/manifest';
const SANDBOX_CWD = path.join(os.homedir(), 'workspace', 'deepbook-sandbox', 'sandbox');
const DEPLOY_TIMEOUT_MS = 420000; // 7 minutes

function buildShellAction(): ShellAction {
  return {
    kind: 'shell',
    command: 'pnpm deploy-all --quick',
    cwd: SANDBOX_CWD,
    timeoutMs: DEPLOY_TIMEOUT_MS,
  };
}

export async function run(_opts: ProbeOpts): Promise<ProbeResult> {
  try {
    const response = await fetch(MANIFEST_URL);
    if (response.ok && response.status === 200) {
      return { pass: true, message: 'Sandbox manifest is reachable at http://localhost:9009/manifest.' };
    }
    return {
      pass: false,
      message: `Sandbox manifest returned HTTP ${response.status}. Run pnpm deploy-all --quick in ~/workspace/deepbook-sandbox/sandbox/.`,
      action: buildShellAction(),
    };
  } catch (_err) {
    return {
      pass: false,
      message: `Sandbox manifest is not reachable (${_err instanceof Error ? _err.message : String(_err)}). Run pnpm deploy-all --quick in ~/workspace/deepbook-sandbox/sandbox/.`,
      action: buildShellAction(),
    };
  }
}

export interface DeployRemediationResult {
  pass: boolean;
  message: string;
  logs?: string[];
  warning?: PreflightDeployTimeoutWarning;
}

/**
 * runDeployRemediation — called by the tool when remediate: true, probe #7 failed,
 * and preconditions (#1/#4/#6) have already been verified by the caller.
 *
 * Implements two strictly-disjoint modes based on process.env.E2E_DEPLOY_STUB === '1'.
 * The E2E_DEPLOY_STUB env var is the SOLE switch to the stub branch.
 */
export async function runDeployRemediation(action: ShellAction): Promise<DeployRemediationResult> {
  // Mode branch: stub vs real — exclusively driven by E2E_DEPLOY_STUB === '1'.
  if (process.env.E2E_DEPLOY_STUB === '1') {
    return runDeployStub();
  }

  return runDeployReal(action);
}

/** Stub branch: deterministic in-process stand-in. Never spawns. */
function runDeployStub(): DeployRemediationResult {
  return {
    pass: false,
    message: '[E2E_DEPLOY_STUB] Deploy stub ran (exit 0) but manifest did not come up. Run pnpm down to clean up.',
    logs: ['[stub] deploy-all --quick (stub exit 0)'],
  };
}

/** Real branch: spawns pnpm deploy-all --quick and re-probes manifest up to 3 times. */
async function runDeployReal(action: ShellAction): Promise<DeployRemediationResult> {
  const cwd = action.cwd ?? SANDBOX_CWD;
  const timeoutMs = action.timeoutMs ?? DEPLOY_TIMEOUT_MS;
  const logs: string[] = [];

  // Spawn the real process.
  const child = spawn('pnpm', ['deploy-all', '--quick'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let timedOut = false;
  let resolved = false;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      if (!resolved) {
        child.kill();
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter((l) => l.length > 0);
      logs.push(...lines);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter((l) => l.length > 0);
      logs.push(...lines);
    });

    child.on('close', () => {
      resolved = true;
      clearTimeout(timer);
      resolve();
    });
  });

  if (timedOut) {
    const warning: PreflightDeployTimeoutWarning = {
      kind: 'preflight-deploy-timeout',
      message: `Deploy timed out after ${timeoutMs / 1000}s. Run pnpm down in ${cwd} to clean up.`,
      logs,
    };
    return {
      pass: false,
      message: `Deploy timed out after ${timeoutMs / 1000}s. Run pnpm down to clean up.`,
      logs,
      warning,
    };
  }

  // Re-probe manifest up to 3 times.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(MANIFEST_URL);
      if (response.ok && response.status === 200) {
        return {
          pass: true,
          message: `Deploy succeeded. Sandbox manifest is now reachable at ${MANIFEST_URL}.`,
          logs,
        };
      }
    } catch (_err) {
      // fetch failed — keep trying
    }
  }

  // All 3 re-probes failed.
  return {
    pass: false,
    message: `Deploy completed but sandbox manifest is still unreachable after 3 attempts. Run pnpm down to clean up and try again.`,
    logs,
  };
}
