import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { validateState, type State } from './schemas/state.js';

export const STATE_SCHEMA_VERSION = 1;

const STATE_DIR = '.sui-deepbook-course';
const STATE_FILE = 'state.json';

export type LoadStateResult =
  | { kind: 'absent' }
  | { kind: 'ok'; state: State }
  | { kind: 'corrupt'; archivedTo?: string; message: string }
  | { kind: 'schema-mismatch'; foundVersion: number; message: string };

let _archiveCounter = 0;

function makeArchiveName(): string {
  const now = new Date();
  // Use a filesystem-safe ISO-8601 variant: replace `:` with `-`
  const iso = now.toISOString().replace(/:/g, '-');
  // Counter ensures uniqueness within the same millisecond
  const counter = String(_archiveCounter++).padStart(3, '0');
  return `state.corrupt-${iso}-${counter}.json`;
}

export async function loadState(projectRoot: string): Promise<LoadStateResult> {
  const stateDir = path.join(projectRoot, STATE_DIR);
  const statePath = path.join(stateDir, STATE_FILE);

  let raw: string;
  try {
    raw = await fsPromises.readFile(statePath, 'utf8');
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return { kind: 'absent' };
    }
    // Other read errors (EACCES, ENOTDIR, etc.) → corrupt with read-error message
    return {
      kind: 'corrupt',
      message: `Failed to read state file (${e.code ?? 'unknown error'}): ${e.message ?? String(e)}`,
    };
  }

  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_parseErr: unknown) {
    // Corrupt: archive original bytes and return corrupt result
    const archiveName = makeArchiveName();
    const archivedTo = path.join(stateDir, archiveName);
    await fsPromises.writeFile(archivedTo, raw, 'utf8');
    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file is corrupt; archived original to ${archivedTo}.`,
    };
  }

  // JSON-valid: check schema_version exists and is a number
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['schema_version'] !== 'number'
  ) {
    // Treat as corrupt if schema_version is missing/non-numeric
    const archiveName = makeArchiveName();
    const archivedTo = path.join(stateDir, archiveName);
    await fsPromises.writeFile(archivedTo, raw, 'utf8');
    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file is corrupt (missing schema_version); archived original to ${archivedTo}.`,
    };
  }

  const obj = parsed as Record<string, unknown>;
  const foundVersion = obj['schema_version'] as number;

  if (foundVersion !== STATE_SCHEMA_VERSION) {
    return {
      kind: 'schema-mismatch',
      foundVersion,
      message: `State file has incompatible schema_version ${foundVersion}. Manual migration required.`,
    };
  }

  // Validate full shape
  const validation = validateState(parsed);
  if (!validation.ok) {
    const archiveName = makeArchiveName();
    const archivedTo = path.join(stateDir, archiveName);
    await fsPromises.writeFile(archivedTo, raw, 'utf8');
    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file is corrupt (invalid shape: ${validation.error}); archived original to ${archivedTo}.`,
    };
  }

  return { kind: 'ok', state: validation.value };
}

export async function saveState(projectRoot: string, state: State): Promise<void> {
  const stateDir = path.join(projectRoot, STATE_DIR);

  // Ensure the directory exists (saveState is permitted to create it)
  await fsPromises.mkdir(stateDir, { recursive: true });

  const statePath = path.join(stateDir, STATE_FILE);
  const bytes = JSON.stringify(state, null, 2);

  // Unique tmp path under the same directory (same filesystem → atomic rename on POSIX)
  const tmpPath = path.join(stateDir, `state.tmp-${process.pid}-${Date.now()}.json`);

  // 1. Write to tmp
  await fsPromises.writeFile(tmpPath, bytes, 'utf8');

  // 2. fsync the tmp file to flush to disk
  const fd = fs.openSync(tmpPath, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // 3. Atomic rename tmp → canonical
  await fsPromises.rename(tmpPath, statePath);
}
