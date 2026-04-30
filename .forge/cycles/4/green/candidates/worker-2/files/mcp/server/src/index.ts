import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runStart } from './tools/start.js';
import { runPreflightProbe } from './tools/runPreflightProbe.js';
import { selectPath } from './tools/selectPath.js';
import { setPersonalization } from './tools/setPersonalization.js';
import { nextSpot } from './tools/nextSpot.js';
import { verifySpot } from './tools/verifySpot.js';
import { PROBE_ORDER } from './preflight.js';
import { fileURLToPath } from 'node:url';

// Re-export SDK seams for the in-process harness so it can resolve all
// classes from a single import without needing @modelcontextprotocol/sdk
// installed at the workspace root.
export { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export { Client } from '@modelcontextprotocol/sdk/client/index.js';
export { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

export function registerTools(server: McpServer): void {
  server.tool(
    'start',
    'Start the Sui DeepBook course — returns paths, output style status, and preflight info.',
    {
      projectRoot: z.string().describe('Absolute path to the project root'),
    },
    async ({ projectRoot }) => {
      const result = await runStart({ projectRoot });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  server.tool(
    'runPreflightProbe',
    `Run a single preflight probe by id. Valid probe ids (in order): ${PROBE_ORDER.join(', ')}. Use remediate: true to trigger shell action execution (e.g. pnpm deploy-all --quick for sandbox-manifest-reachable).`,
    {
      probeId: z.string().describe('The probe id to run'),
      remediate: z
        .boolean()
        .optional()
        .describe('If true and the probe fails with a shell action, execute the remediation'),
    },
    async ({ probeId, remediate }) => {
      const result = await runPreflightProbe({ probeId, remediate });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  server.tool(
    'selectPath',
    'Select a learning path by slug. Returns personalization prompts and initializes the cursor.',
    {
      projectRoot: z.string().describe('Absolute path to the project root'),
      slug: z.string().describe('The path slug identifier'),
    },
    async ({ projectRoot, slug }) => {
      const result = await selectPath({ projectRoot, slug });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  server.tool(
    'setPersonalization',
    'Set personalization values for the selected path. Pass an empty object to use all defaults.',
    {
      projectRoot: z.string().describe('Absolute path to the project root'),
      values: z.record(z.unknown()).describe('Personalization values to set'),
    },
    async ({ projectRoot, values }) => {
      const result = await setPersonalization({ projectRoot, values: values as Record<string, unknown> });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  server.tool(
    'nextSpot',
    'Get the current spot for the selected path. Returns the phase, spot (with substituted prompt), ladder state, and done flag.',
    {
      projectRoot: z.string().describe('Absolute path to the project root'),
    },
    async ({ projectRoot }) => {
      const result = await nextSpot({ projectRoot });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  server.tool(
    'verifySpot',
    'Verify the current spot. On pass, advances the cursor. Returns { pass, output?, advanced? }.',
    {
      projectRoot: z.string().describe('Absolute path to the project root'),
    },
    async ({ projectRoot }) => {
      const result = await verifySpot({ projectRoot });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );
}

// Only start the stdio transport when this file is executed directly as a script.
const _currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === _currentFile) {
  const server = new McpServer({
    name: 'sui-deepbook-course',
    version: '1.0.0',
  });
  registerTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err: unknown) => {
    process.stderr.write(String(err) + '\n');
    process.exit(1);
  });
}
