import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

export interface ShellAction {
  kind: 'shell';
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface ProbeResult {
  pass: boolean;
  message: string;
  action?: ShellAction;
}

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

const MANIFEST_URL = 'http://localhost:9009/manifest';
const DEPLOY_TIMEOUT_MS = 420000; // 7 minutes
const MAX_REPROBE_ATTEMPTS = 3;

function getSandboxCwd(): string {
  return path.join(os.homedir(), 'workspace', 'deepbook-sandbox', 'sandbox');
}

async function checkManifest(): Promise<boolean> {
  try {
    const res = await (globalThis.fetch as typeof fetch)(MANIFEST_URL);
    return res.ok && res.status === 200;
  } catch (_err) {
    return false;
  }
}

export async function probe(): Promise<ProbeResult> {
  try {
    const res = await (globalThis.fetch as typeof fetch)(MANIFEST_URL);
    if (res.ok && res.status === 200) {
      return {
        pass: true,
        message: 'Sandbox manifest is reachable at http://localhost:9009/manifest.',
      };
    }
  } catch (_err) {
    // fall through to fail path
  }

  const cwd = getSandboxCwd();
  return {
    pass: false,
    message: 'Sandbox manifest is not reachable at http://localhost:9009/manifest.',
    action: {
      kind: 'shell',
      command: 'pnpm deploy-all --quick',
      cwd,
      timeoutMs: DEPLOY_TIMEOUT_MS,
    },
  };
}

/**
 * Deploy executor — two strictly disjoint modes:
 * - E2E_DEPLOY_STUB === '1': stub branch (in-process, no subprocess)
 * - anything else: real branch (spawns pnpm deploy-all --quick)
 *
 * This is the SOLE location of E2E_DEPLOY_STUB in mcp/server/src/.
 * Preconditions (#1 docker-running, #4 sui-cli-version, #6 sandbox-repo-present)
 * are checked by the caller (runPreflightProbe.ts) before calling this function.
 */
export async function runDeployRemediation(
  action: ShellAction,
): Promise<DeployResult> {
  // Single exclusive entry point to stub branch.
  // E2E_DEPLOY_STUB is the ONLY env var switch for this executor.
  if (process.env['E2E_DEPLOY_STUB'] === '1') {
    return runDeployStub();
  }
  return runDeployReal(action);
}

async function runDeployStub(): Promise<DeployResult> {
  // Deterministic in-process stand-in — never spawns a real subprocess.
  const logs = ['[stub] deploy-all --quick stub branch fired'];

  // Re-probe the manifest up to MAX_REPROBE_ATTEMPTS times.
  for (let i = 0; i < MAX_REPROBE_ATTEMPTS; i++) {
    const ok = await checkManifest();
    if (ok) {
      return {
        pass: true,
        message: '[stub] deploy completed and manifest is up.',
        logs,
      };
    }
  }

  return {
    pass: false,
    message:
      '[stub] Deploy stub exited 0 but manifest is still unreachable after 3 attempts. Try: pnpm down',
    logs,
    warning: {
      kind: 'preflight-deploy-timeout',
      message:
        'Manifest did not come up after deploy stub. Run pnpm down and try again.',
      logs,
    },
  };
}

async function runDeployReal(action: ShellAction): Promise<DeployResult> {
  const cwd = action.cwd ?? getSandboxCwd();
  const timeoutMs = action.timeoutMs ?? DEPLOY_TIMEOUT_MS;

  const logs: string[] = [];

  return new Promise<DeployResult>((resolve) => {
    const child = spawn('pnpm', ['deploy-all', '--quick'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split('\n').filter((l: string) => l.length > 0);
        logs.push(...lines);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split('\n').filter((l: string) => l.length > 0);
        logs.push(...lines);
      });
    }

    child.on('close', async (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);

      if (timedOut || signal === 'SIGTERM') {
        resolve({
          pass: false,
          message: `Deploy timed out after ${timeoutMs / 1000}s. Run pnpm down to clean up.`,
          logs,
          warning: {
            kind: 'preflight-deploy-timeout',
            message: `Deploy timed out after ${timeoutMs / 1000}s. Run pnpm down to clean up.`,
            logs,
          },
        });
        return;
      }

      // Re-probe manifest up to MAX_REPROBE_ATTEMPTS times.
      for (let i = 0; i < MAX_REPROBE_ATTEMPTS; i++) {
        const ok = await checkManifest();
        if (ok) {
          resolve({
            pass: true,
            message: 'Deploy completed and manifest is up.',
            logs,
          });
          return;
        }
      }

      // All re-probes failed.
      resolve({
        pass: false,
        message: `Deploy exited with code ${code ?? 'null'} but manifest is still unreachable after ${MAX_REPROBE_ATTEMPTS} attempts. Run pnpm down and try again.`,
        logs,
        warning: {
          kind: 'preflight-deploy-timeout',
          message: `Manifest did not come up after deploy. Run pnpm down and try again.`,
          logs,
        },
      });
    });
  });
}
