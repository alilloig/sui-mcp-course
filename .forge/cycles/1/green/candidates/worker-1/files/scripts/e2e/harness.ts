import { runStart } from '../../mcp/server/src/tools/start.js';
import * as path from 'node:path';

interface HarnessInstance {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  shutdown(): Promise<void>;
}

interface BootOptions {
  projectRoot: string;
}

export async function bootHarness(options: BootOptions): Promise<HarnessInstance> {
  const { projectRoot } = options;

  async function callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (toolName === 'start') {
      const root = typeof args['projectRoot'] === 'string' ? args['projectRoot'] : projectRoot;
      const result = await runStart({ projectRoot: root });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  async function shutdown(): Promise<void> {
    // No-op for in-process harness
  }

  return { callTool, shutdown };
}

export default bootHarness;
