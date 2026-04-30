import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { validateState } from './schemas/state.js';
import type { State } from './schemas/state.js';

export type { State };

export const STATE_SCHEMA_VERSION = 1 as const;

const STATE_DIR_NAME = '.sui-deepbook-course';
const STATE_FILE_NAME = 'state.json';

// Monotonic counter to disambiguate two archives in the same millisecond.
let archiveCounter = 0;

export type LoadStateResult =
  | { kind: 'absent' }
  | { kind: 'ok'; state: State }
  | { kind: 'corrupt'; archivedTo: string; message: string }
  | { kind: 'schema-mismatch'; foundVersion: number; message: string };

export async function loadState(projectRoot: string): Promise<LoadStateResult> {
  const stateDir = path.join(projectRoot, STATE_DIR_NAME);
  const statePath = path.join(stateDir, STATE_FILE_NAME);

  let raw: string;
  try {
    raw = await fsPromises.readFile(statePath, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return { kind: 'absent' };
    }
    // Other read errors (EACCES, ENOTDIR, etc.) are treated as corrupt
    return {
      kind: 'corrupt',
      archivedTo: '',
      message: `Failed to read state file: ${e.message ?? String(err)}`,
    };
  }

  // Attempt JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_parseErr) {
    // Archive the corrupt bytes
    const archivePath = await archiveCorrupt(stateDir, statePath, raw);
    return {
      kind: 'corrupt',
      archivedTo: archivePath,
      message: `State file was corrupt and has been archived to ${archivePath}`,
    };
  }

  // Check schema_version before full validation
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['schema_version'] !== 'number'
  ) {
    // No schema_version — treat as corrupt
    const archivePath = await archiveCorrupt(stateDir, statePath, raw);
    return {
      kind: 'corrupt',
      archivedTo: archivePath,
      message: `State file was corrupt (missing schema_version) and has been archived to ${archivePath}`,
    };
  }

  const foundVersion = (parsed as Record<string, unknown>)['schema_version'] as number;
  if (foundVersion !== STATE_SCHEMA_VERSION) {
    return {
      kind: 'schema-mismatch',
      foundVersion,
      message: `State file has incompatible schema_version ${foundVersion}. Manual migration required before this state can be used.`,
    };
  }

  // Full schema validation
  const validation = validateState(parsed);
  if (!validation.ok) {
    const archivePath = await archiveCorrupt(stateDir, statePath, raw);
    return {
      kind: 'corrupt',
      archivedTo: archivePath,
      message: `State file failed schema validation and has been archived to ${archivePath}: ${validation.error}`,
    };
  }

  return { kind: 'ok', state: validation.value };
}

async function archiveCorrupt(
  stateDir: string,
  _statePath: string,
  rawBytes: string,
): Promise<string> {
  // Ensure .sui-deepbook-course/ exists for the archive
  await fsPromises.mkdir(stateDir, { recursive: true });

  const ts = new Date().toISOString().replace(/:/g, '-');
  archiveCounter += 1;
  const counter = archiveCounter;
  const archiveName = `state.corrupt-${ts}.${counter}.json`;
  const archivePath = path.join(stateDir, archiveName);
  await fsPromises.writeFile(archivePath, rawBytes, 'utf8');
  return archivePath;
}

export async function saveState(projectRoot: string, state: State): Promise<void> {
  const stateDir = path.join(projectRoot, STATE_DIR_NAME);
  const statePath = path.join(stateDir, STATE_FILE_NAME);

  // Ensure directory exists
  await fsPromises.mkdir(stateDir, { recursive: true });

  const bytes = JSON.stringify(state, null, 2);
  const tmpName = `state.tmp-${Date.now()}-${process.pid}.json`;
  const tmpPath = path.join(stateDir, tmpName);

  // Write to tmp file
  await fsPromises.writeFile(tmpPath, bytes, 'utf8');

  // fsync the tmp file for durability
  const fd = fs.openSync(tmpPath, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Atomic rename: tmp -> canonical
  await fsPromises.rename(tmpPath, statePath);
}
