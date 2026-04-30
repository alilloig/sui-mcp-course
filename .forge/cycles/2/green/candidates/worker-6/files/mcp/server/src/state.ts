import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { validateState } from './schemas/state.js';
import type { State } from './schemas/state.js';

export const STATE_SCHEMA_VERSION = 1;

const STATE_DIR = '.sui-deepbook-course';
const STATE_FILE = 'state.json';

function stateDir(projectRoot: string): string {
  return path.join(projectRoot, STATE_DIR);
}

function statePath(projectRoot: string): string {
  return path.join(projectRoot, STATE_DIR, STATE_FILE);
}

// Counter to disambiguate archive filenames created in the same millisecond.
let _archiveCounter = 0;

function makeArchivePath(projectRoot: string): string {
  const now = new Date();
  // Use filesystem-safe ISO-8601: replace colons in time part with dashes
  const isoSafe = now.toISOString().replace(/:/g, '-');
  const counter = _archiveCounter++;
  const suffix = counter === 0 ? isoSafe : `${isoSafe}-${counter}`;
  return path.join(projectRoot, STATE_DIR, `state.corrupt-${suffix}.json`);
}

export type LoadStateResult =
  | { kind: 'absent' }
  | { kind: 'ok'; state: State }
  | { kind: 'corrupt'; archivedTo?: string; message: string }
  | { kind: 'schema-mismatch'; foundVersion: number; message: string };

export async function loadState(projectRoot: string): Promise<LoadStateResult> {
  const filePath = statePath(projectRoot);

  let raw: string;
  try {
    raw = await fsPromises.readFile(filePath, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return { kind: 'absent' };
    }
    // Other read errors (EACCES, ENOTDIR, etc.) are treated as corrupt
    return {
      kind: 'corrupt',
      message: `Failed to read state file (${e.code ?? 'unknown'}): permission or access error. ${e.message}`,
    };
  }

  // Try to parse the JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_parseErr) {
    // Not valid JSON — archive the original bytes and classify as corrupt
    const dir = stateDir(projectRoot);
    // Ensure the directory exists for the archive
    await fsPromises.mkdir(dir, { recursive: true });
    const archivePath = makeArchivePath(projectRoot);
    await fsPromises.writeFile(archivePath, raw, 'utf8');
    return {
      kind: 'corrupt',
      archivedTo: archivePath,
      message: `State file contains corrupt/invalid JSON; original bytes archived to ${path.basename(archivePath)}.`,
    };
  }

  // Check schema_version before full validation
  const obj = parsed as Record<string, unknown>;
  const foundVersion = obj['schema_version'];
  if (typeof foundVersion !== 'number' || foundVersion !== STATE_SCHEMA_VERSION) {
    const ver = typeof foundVersion === 'number' ? foundVersion : -1;
    return {
      kind: 'schema-mismatch',
      foundVersion: ver,
      message: `State file has incompatible schema_version ${ver}. Manual migration required before resuming.`,
    };
  }

  // Full structural validation
  const validation = validateState(parsed);
  if (!validation.ok) {
    // Shape is wrong despite parseable JSON — treat as corrupt
    const dir = stateDir(projectRoot);
    await fsPromises.mkdir(dir, { recursive: true });
    const archivePath = makeArchivePath(projectRoot);
    await fsPromises.writeFile(archivePath, raw, 'utf8');
    return {
      kind: 'corrupt',
      archivedTo: archivePath,
      message: `State file has corrupt structure: ${validation.error}. Original bytes archived.`,
    };
  }

  return { kind: 'ok', state: validation.value };
}

export async function saveState(projectRoot: string, state: State): Promise<void> {
  const dir = stateDir(projectRoot);

  // Create directory if needed (saveState is allowed to mkdir; loadState is not)
  await fsPromises.mkdir(dir, { recursive: true });

  const canonical = statePath(projectRoot);
  const tmpPath = path.join(dir, `state.tmp-${process.pid}-${Date.now()}.json`);
  const bytes = JSON.stringify(state, null, 2);

  // Step 1: write to tmp
  await fsPromises.writeFile(tmpPath, bytes, 'utf8');

  // Step 2: fsync the tmp file
  const fd = fs.openSync(tmpPath, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Step 3: rename tmp → canonical (atomic on POSIX)
  await fsPromises.rename(tmpPath, canonical);
}
