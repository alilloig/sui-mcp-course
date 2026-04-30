// Probe #6: sandbox-repo-present
// Checks ~/workspace/deepbook-sandbox/ is a directory.

import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProbeOpts, ProbeResult } from '../probeTypes.js';

const CLONE_CMD =
  'git clone --recurse-submodules https://github.com/MystenLabs/deepbook-sandbox.git ~/workspace/deepbook-sandbox';

const FAIL_MESSAGE = `The deepbook-sandbox repository is not present. Clone it with:\n${CLONE_CMD}`;

export async function run(_opts: ProbeOpts): Promise<ProbeResult> {
  const sandboxPath = path.join(os.homedir(), 'workspace', 'deepbook-sandbox');

  try {
    const stat = await fsPromises.stat(sandboxPath);
    if (!stat.isDirectory()) {
      return { pass: false, message: FAIL_MESSAGE };
    }
    return { pass: true, message: `deepbook-sandbox repository found at ${sandboxPath}.` };
  } catch (_err) {
    return { pass: false, message: FAIL_MESSAGE };
  }
}
