import { createInMemoryHarness } from '../../mcp/server/src/harness.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface HarnessInstance {
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  shutdown(): Promise<void>;
}

export interface BootOptions {
  projectRoot: string;
}

export async function bootHarness(_options: BootOptions): Promise<HarnessInstance> {
  return createInMemoryHarness();
}

// Fixture helpers for staging state files in tests (exported for test convenience)
export function withCorruptState(projectRoot: string, bytes?: Buffer | string): string {
  const stateDir = path.join(projectRoot, '.sui-deepbook-course');
  fs.mkdirSync(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, 'state.json');
  if (bytes !== undefined) {
    const content = typeof bytes === 'string' ? bytes : bytes.toString('utf8');
    fs.writeFileSync(stateFile, content, 'utf8');
  }
  return stateFile;
}

export function withValidState(projectRoot: string, state?: unknown): string {
  const stateDir = path.join(projectRoot, '.sui-deepbook-course');
  fs.mkdirSync(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, 'state.json');
  const content = JSON.stringify(state ?? {
    schema_version: 1,
    selected_path: 'test-path',
    personalization: {},
    cursor: { phase_id: 'p1', spot_id: 'p1-spot-1' },
    ladder: {},
    history: [],
  }, null, 2);
  fs.writeFileSync(stateFile, content, 'utf8');
  return stateFile;
}

export function withFutureSchemaState(projectRoot: string, version?: number): string {
  const stateDir = path.join(projectRoot, '.sui-deepbook-course');
  fs.mkdirSync(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, 'state.json');
  const content = JSON.stringify({
    schema_version: version ?? 999,
    selected_path: 'test-path',
    personalization: {},
    cursor: { phase_id: 'p1', spot_id: 'p1-spot-1' },
    ladder: {},
    history: [],
  }, null, 2);
  fs.writeFileSync(stateFile, content, 'utf8');
  return stateFile;
}

export default bootHarness;
