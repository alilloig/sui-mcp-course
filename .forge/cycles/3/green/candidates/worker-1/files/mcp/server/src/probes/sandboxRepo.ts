import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProbeResult } from './types.js';

const CLONE_CMD =
  'git clone --recurse-submodules https://github.com/MystenLabs/deepbook-sandbox.git ~/workspace/deepbook-sandbox';

export async function runSandboxRepoProbe(): Promise<ProbeResult> {
  const sandboxPath = path.join(os.homedir(), 'workspace', 'deepbook-sandbox');

  let stat: Awaited<ReturnType<typeof fsPromises.stat>>;
  try {
    stat = await fsPromises.stat(sandboxPath);
  } catch {
    return {
      pass: false,
      message: `deepbook-sandbox repository not found. Clone it with: ${CLONE_CMD}`,
    };
  }

  if (!stat.isDirectory()) {
    return {
      pass: false,
      message: `deepbook-sandbox path exists but is not a directory. Remove it and clone: ${CLONE_CMD}`,
    };
  }

  return {
    pass: true,
    message: `deepbook-sandbox repository found at ${sandboxPath}.`,
  };
}
