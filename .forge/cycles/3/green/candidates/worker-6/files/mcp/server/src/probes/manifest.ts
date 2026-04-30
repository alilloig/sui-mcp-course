import * as os from 'node:os';
import * as path from 'node:path';
import type { ProbeResult, ShellAction } from '../preflight.js';

const MANIFEST_URL = 'http://localhost:9009/manifest';
const DEPLOY_TIMEOUT_MS = 420000; // 7 minutes

function sandboxCwd(): string {
  return path.join(os.homedir(), 'workspace', 'deepbook-sandbox', 'sandbox');
}

function buildShellAction(): ShellAction {
  return {
    kind: 'shell',
    command: 'pnpm deploy-all --quick',
    cwd: sandboxCwd(),
    timeoutMs: DEPLOY_TIMEOUT_MS,
  };
}

export async function probeManifest(_opts: { remediate?: boolean } = {}): Promise<ProbeResult> {
  try {
    const resp = await fetch(MANIFEST_URL);
    if (resp.ok && resp.status === 200) {
      return { pass: true, message: 'Sandbox manifest is reachable at http://localhost:9009/manifest.' };
    }
    return {
      pass: false,
      message: `Sandbox manifest returned HTTP ${resp.status}. Run pnpm deploy-all --quick in the sandbox directory.`,
      action: buildShellAction(),
    };
  } catch (_err) {
    return {
      pass: false,
      message: `Sandbox manifest is not reachable at ${MANIFEST_URL}. Run pnpm deploy-all --quick in the sandbox directory.`,
      action: buildShellAction(),
    };
  }
}

// ---------------------------------------------------------------------------
// Deploy executor — two-mode: stub (E2E_DEPLOY_STUB=1) vs real spawn
// A14: E2E_DEPLOY_STUB is the single exclusive entry point to the stub branch.
// ---------------------------------------------------------------------------

export interface DeployResult {
  pass: boolean;
  message: string;
  logs?: string[];
  warning?: {
    kind: 'preflight-deploy-timeout' | 'preflight-deploy-precondition-failed';
    probeId?: string;
    message: string;
    logs?: string[];
  };
}

/**
 * Stub deploy — called when E2E_DEPLOY_STUB === '1'.
 * Never spawns a real subprocess.
 */
function runDeployStub(): DeployResult {
  return {
    pass: false,
    message: '[deploy-stub] pnpm deploy-all --quick (stub) exited 0 but manifest is still down. Suggestion: run pnpm down to clean up.',
    logs: ['[deploy-stub] stub deploy executed'],
  };
}

/**
 * Real deploy — spawns pnpm deploy-all --quick, streams lines, enforces timeout,
 * then re-probes manifest up to 3 times.
 */
export async function runRealDeploy(cwd: string): Promise<DeployResult> {
  const { spawn } = await import('node:child_process');

  const logs: string[] = [];

  return new Promise<DeployResult>((resolve) => {
    const child = spawn('pnpm', ['deploy-all', '--quick'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    function finish(result: DeployResult): void {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      resolve(result);
    }

    // Collect stdout lines
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split('\n').filter((l) => l.length > 0);
      for (const l of lines) logs.push(l);
    });

    // Collect stderr lines
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split('\n').filter((l) => l.length > 0);
      for (const l of lines) logs.push(l);
    });

    // Timeout
    timeoutHandle = setTimeout(() => {
      if (!settled) {
        child.kill();
        finish({
          pass: false,
          message: `Deploy timed out after ${DEPLOY_TIMEOUT_MS / 1000}s. Run: pnpm down to clean up.`,
          logs: [...logs],
          warning: {
            kind: 'preflight-deploy-timeout',
            message: `pnpm deploy-all --quick timed out. Suggestion: run pnpm down to clean up containers.`,
            logs: [...logs],
          },
        });
      }
    }, DEPLOY_TIMEOUT_MS);

    child.on('close', async (code) => {
      if (settled) return;

      // Re-probe manifest up to 3 times
      let manifestUp = false;
      for (let i = 0; i < 3; i++) {
        const r = await probeManifest();
        if (r.pass) {
          manifestUp = true;
          break;
        }
      }

      if (manifestUp) {
        finish({
          pass: true,
          message: 'Deploy succeeded and manifest is reachable.',
          logs: [...logs],
        });
      } else {
        finish({
          pass: false,
          message: `pnpm deploy-all --quick exited ${code} but manifest is still unreachable after 3 retries. Suggestion: run pnpm down to clean up.`,
          logs: [...logs],
        });
      }
    });
  });
}

type RunProbeFn = (probeId: string, opts: Record<string, unknown>) => Promise<ProbeResult>;

/**
 * Main deploy remediation entry point.
 * A14: E2E_DEPLOY_STUB === '1' is the sole entry to the stub branch.
 * A13: Gates on probes #1 (docker-running), #4 (sui-cli-version), #6 (sandbox-repo-present).
 */
export async function runDeployRemediation(
  action: ShellAction,
  runProbe: RunProbeFn,
): Promise<DeployResult> {
  // A14: sole entry to stub branch
  if (process.env.E2E_DEPLOY_STUB === '1') {
    return runDeployStub();
  }

  // A13: gate on preconditions #1, #4, #6 (real mode only)
  const gates: string[] = ['docker-running', 'sui-cli-version', 'sandbox-repo-present'];
  for (const probeId of gates) {
    const result = await runProbe(probeId, {});
    if (!result.pass) {
      return {
        pass: false,
        message: `Cannot deploy: precondition probe '${probeId}' is not passing.`,
        warning: {
          kind: 'preflight-deploy-precondition-failed',
          probeId,
          message: `Deploy precondition failed: ${probeId} is not passing. Fix this probe before attempting remediation.`,
        },
      };
    }
  }

  return runRealDeploy(action.cwd ?? sandboxCwd());
}
