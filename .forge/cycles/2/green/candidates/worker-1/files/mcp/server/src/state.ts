import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { validateState } from './schemas/state.js';
import type { StateData } from './schemas/state.js';

export { StateData as State };

export const STATE_SCHEMA_VERSION = 1 as const;

const COURSE_DIR = '.sui-deepbook-course';
const STATE_FILE = 'state.json';

export type LoadStateResult =
  | { kind: 'absent' }
  | { kind: 'ok'; state: StateData }
  | { kind: 'corrupt'; archivedTo?: string; message: string }
  | { kind: 'schema-mismatch'; foundVersion: number; message: string };

// Monotonic counter to guarantee distinct archive names within same millisecond
let archiveCounter = 0;

export async function loadState(projectRoot: string): Promise<LoadStateResult> {
  const stateDir = path.join(projectRoot, COURSE_DIR);
  const statePath = path.join(stateDir, STATE_FILE);

  let raw: string;
  try {
    raw = await fsPromises.readFile(statePath, 'utf8');
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      return { kind: 'absent' };
    }
    // EACCES or other read errors → corrupt classification with read-error message
    return {
      kind: 'corrupt',
      message: `Failed to read state file due to permission/access error (${nodeErr.code ?? 'read error'}): ${nodeErr.message}`,
    };
  }

  // Try to parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_parseErr) {
    // Not valid JSON → archive and return corrupt
    const archivedTo = await archiveCorrupt(stateDir, raw);
    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file was corrupt (invalid JSON); archived original to ${archivedTo}.`,
    };
  }

  // JSON-parseable — check schema_version first
  const obj = parsed as Record<string, unknown>;
  const foundVersion = obj['schema_version'];

  if (typeof foundVersion !== 'number' || foundVersion !== STATE_SCHEMA_VERSION) {
    const version = typeof foundVersion === 'number' ? foundVersion : -1;
    return {
      kind: 'schema-mismatch',
      foundVersion: version,
      message: `State file has incompatible schema_version ${version}. Manual migration required.`,
    };
  }

  // Validate shape
  const validation = validateState(parsed);
  if (!validation.ok) {
    const archivedTo = await archiveCorrupt(stateDir, raw);
    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file was corrupt (invalid shape: ${validation.error}); archived original to ${archivedTo}.`,
    };
  }

  return { kind: 'ok', state: validation.value };
}

async function archiveCorrupt(stateDir: string, raw: string): Promise<string> {
  // Ensure the state directory exists before archiving
  await fsPromises.mkdir(stateDir, { recursive: true });

  const now = new Date();
  archiveCounter += 1;
  // Use filesystem-safe ISO-8601: replace colons with dashes; include ms + counter for uniqueness
  const isoBase = now.toISOString().replace(/:/g, '-');
  const archiveName = `state.corrupt-${isoBase}-${archiveCounter}.json`;
  const archivePath = path.join(stateDir, archiveName);

  await fsPromises.writeFile(archivePath, raw, 'utf8');
  return archivePath;
}

export async function saveState(projectRoot: string, state: StateData): Promise<void> {
  const stateDir = path.join(projectRoot, COURSE_DIR);
  const statePath = path.join(stateDir, STATE_FILE);

  // Create the directory if it doesn't exist (saveState is permitted to mkdir)
  await fsPromises.mkdir(stateDir, { recursive: true });

  const bytes = JSON.stringify(state, null, 2);

  // Atomic write: write to tmp → fsync → rename to canonical
  const tmpName = `state.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  const tmpPath = path.join(stateDir, tmpName);

  // Step 1: write to tmp
  await fsPromises.writeFile(tmpPath, bytes, 'utf8');

  // Step 2: fsync the tmp file
  const fd = fs.openSync(tmpPath, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Step 3: atomic rename to canonical path
  await fsPromises.rename(tmpPath, statePath);
}
