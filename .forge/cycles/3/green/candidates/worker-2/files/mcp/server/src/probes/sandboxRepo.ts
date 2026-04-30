import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export interface ProbeResult {
  pass: boolean;
  message: string;
  action?: undefined;
}

const CLONE_COMMAND =
  'git clone --recurse-submodules https://github.com/MystenLabs/deepbook-sandbox.git ~/workspace/deepbook-sandbox';

export async function probe(): Promise<ProbeResult> {
  const sandboxPath = path.join(os.homedir(), 'workspace', 'deepbook-sandbox');

  try {
    const stat = await fsPromises.stat(sandboxPath);
    if (stat.isDirectory()) {
      return {
        pass: true,
        message: `deepbook-sandbox repo found at ${sandboxPath}.`,
      };
    }
    // Exists but is not a directory (e.g. a file)
    return {
      pass: false,
      message: `${sandboxPath} exists but is not a directory. Clone the sandbox with: ${CLONE_COMMAND}`,
    };
  } catch (_err) {
    return {
      pass: false,
      message: `deepbook-sandbox repo not found. Clone it with: ${CLONE_COMMAND}`,
    };
  }
}
