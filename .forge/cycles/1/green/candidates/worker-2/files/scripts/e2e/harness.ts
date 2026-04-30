import { runStart } from '../../mcp/server/src/tools/start.js';

export interface Harness {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  shutdown(): Promise<void>;
}

export async function bootHarness(_opts: { projectRoot: string }): Promise<Harness> {
  return {
    async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
      if (toolName === 'start') {
        const projectRoot = typeof args['projectRoot'] === 'string' ? args['projectRoot'] : _opts.projectRoot;
        const result = await runStart({ projectRoot });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
      throw new Error(`Unknown tool: ${toolName}`);
    },
    async shutdown(): Promise<void> {
      // no-op for in-process harness
    },
  };
}
