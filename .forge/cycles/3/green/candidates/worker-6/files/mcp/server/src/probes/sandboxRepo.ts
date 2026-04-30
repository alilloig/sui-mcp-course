import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProbeResult } from '../preflight.js';

const CLONE_COMMAND =
  'git clone --recurse-submodules https://github.com/MystenLabs/deepbook-sandbox.git ~/workspace/deepbook-sandbox';

export async function probeSandboxRepo(_opts: Record<string, unknown> = {}): Promise<ProbeResult> {
  const repoPath = path.join(os.homedir(), 'workspace', 'deepbook-sandbox');

  try {
    const stat = await fsPromises.stat(repoPath);
    if (stat.isDirectory()) {
      return { pass: true, message: `Sandbox repo found at ${repoPath}.` };
    }
    // Exists but is not a directory (ENOTDIR equivalent)
    return {
      pass: false,
      message: `${repoPath} exists but is not a directory. Clone it with: ${CLONE_COMMAND}`,
    };
  } catch (_err) {
    return {
      pass: false,
      message: `Sandbox repo not found at ~/workspace/deepbook-sandbox. Clone it with: ${CLONE_COMMAND}`,
    };
  }
}
