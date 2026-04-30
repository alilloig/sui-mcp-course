import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { validateState } from './schemas/state.js';
import type { State } from './schemas/state.js';

export type { State };

export const STATE_SCHEMA_VERSION = 1;

const STATE_DIR = '.sui-deepbook-course';
const STATE_FILE = 'state.json';

// Monotonic counter to ensure uniqueness within the same millisecond
let archiveCounter = 0;

export type LoadStateResult =
  | { kind: 'absent' }
  | { kind: 'ok'; state: State }
  | { kind: 'corrupt'; archivedTo: string; message: string }
  | { kind: 'schema-mismatch'; foundVersion: number; message: string };

export async function loadState(projectRoot: string): Promise<LoadStateResult> {
  const stateDir = path.join(projectRoot, STATE_DIR);
  const statePath = path.join(stateDir, STATE_FILE);

  let raw: string;
  try {
    raw = await fsPromises.readFile(statePath, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return { kind: 'absent' };
    }
    // Other read errors (EACCES, ENOTDIR, etc.) → corrupt classification
    return {
      kind: 'corrupt',
      archivedTo: '',
      message: `Failed to read state file: ${e.message ?? String(e)}`,
    };
  }

  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_parseErr) {
    // Not valid JSON — archive and return corrupt
    const archivedTo = await archiveCorruptFile(stateDir, statePath, raw);
    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file was corrupt (invalid JSON); archived original to ${archivedTo}.`,
    };
  }

  // JSON is valid — check schema_version
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['schema_version'] !== 'number'
  ) {
    // Can't determine schema_version — archive as corrupt
    const archivedTo = await archiveCorruptFile(stateDir, statePath, raw);
    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file was corrupt (missing schema_version); archived original to ${archivedTo}.`,
    };
  }

  const foundVersion = (parsed as Record<string, unknown>)['schema_version'] as number;

  if (foundVersion !== STATE_SCHEMA_VERSION) {
    return {
      kind: 'schema-mismatch',
      foundVersion,
      message: `State file has incompatible schema_version ${foundVersion}. Manual migration required before resuming.`,
    };
  }

  // Validate shape
  const validation = validateState(parsed);
  if (!validation.ok) {
    const archivedTo = await archiveCorruptFile(stateDir, statePath, raw);
    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file was corrupt (schema validation failed: ${validation.error}); archived original to ${archivedTo}.`,
    };
  }

  return { kind: 'ok', state: validation.value };
}

async function archiveCorruptFile(
  stateDir: string,
  _statePath: string,
  content: string,
): Promise<string> {
  // Ensure the state directory exists (it should, but be safe)
  await fsPromises.mkdir(stateDir, { recursive: true });

  // Build an ISO-8601-ish timestamp that is filesystem-safe (no `:`)
  const now = new Date();
  const ts = now
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '.');

  // Include a monotonic counter for same-millisecond collisions
  archiveCounter += 1;
  const suffix = `${ts}-${archiveCounter}`;
  const archiveName = `state.corrupt-${suffix}.json`;
  const archivePath = path.join(stateDir, archiveName);

  await fsPromises.writeFile(archivePath, content, 'utf8');
  return archivePath;
}

export async function saveState(projectRoot: string, state: State): Promise<void> {
  const stateDir = path.join(projectRoot, STATE_DIR);
  const statePath = path.join(stateDir, STATE_FILE);

  // Create directory if it doesn't exist (saveState is permitted to mkdir)
  await fsPromises.mkdir(stateDir, { recursive: true });

  const bytes = JSON.stringify(state, null, 2);
  const tmpPath = path.join(stateDir, `state.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  // Write to tmp file
  await fsPromises.writeFile(tmpPath, bytes, 'utf8');

  // fsync the tmp file to ensure durability
  const fd = fs.openSync(tmpPath, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Atomic rename tmp → canonical
  await fsPromises.rename(tmpPath, statePath);
}
