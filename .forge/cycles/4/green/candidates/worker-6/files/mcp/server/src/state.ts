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
  | { kind: 'corrupt'; archivedTo?: string; message: string }
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
    return {
      kind: 'corrupt',
      message: `Failed to read state file: ${e.message ?? String(e)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_parseErr) {
    return await classifyCorrupt(stateDir, raw, 'invalid JSON');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['schema_version'] !== 'number'
  ) {
    return await classifyCorrupt(stateDir, raw, 'missing schema_version');
  }

  const foundVersion = (parsed as Record<string, unknown>)['schema_version'] as number;

  if (foundVersion !== STATE_SCHEMA_VERSION) {
    return {
      kind: 'schema-mismatch',
      foundVersion,
      message: `State file has incompatible schema_version ${foundVersion}. Manual migration required before resuming.`,
    };
  }

  const validation = validateState(parsed);
  if (!validation.ok) {
    return await classifyCorrupt(stateDir, raw, `schema validation failed: ${validation.error}`);
  }

  return { kind: 'ok', state: validation.value };
}

async function classifyCorrupt(
  stateDir: string,
  raw: string,
  reason: string,
): Promise<LoadStateResult> {
  try {
    const archivedTo = await archiveCorruptFile(stateDir, raw);
    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file was corrupt (${reason}); archived original to ${archivedTo}.`,
    };
  } catch (archiveErr) {
    const aerr = archiveErr as NodeJS.ErrnoException;
    return {
      kind: 'corrupt',
      message: `State file was corrupt (${reason}); archive write also failed (${aerr.code ?? aerr.message ?? 'unknown'}).`,
    };
  }
}

async function archiveCorruptFile(
  stateDir: string,
  content: string,
): Promise<string> {
  await fsPromises.mkdir(stateDir, { recursive: true });

  const ts = new Date().toISOString().replace(/:/g, '-');
  archiveCounter += 1;
  const suffix = `${ts}-${archiveCounter}`;
  const archiveName = `state.corrupt-${suffix}.json`;
  const archivePath = path.join(stateDir, archiveName);

  await fsPromises.writeFile(archivePath, content, { flag: 'wx', mode: 0o600 });
  return archivePath;
}

export async function saveState(projectRoot: string, state: State): Promise<void> {
  const stateDir = path.join(projectRoot, STATE_DIR);
  const statePath = path.join(stateDir, STATE_FILE);

  await fsPromises.mkdir(stateDir, { recursive: true });

  const bytes = JSON.stringify(state, null, 2);
  const tmpPath = path.join(stateDir, `state.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  await fsPromises.writeFile(tmpPath, bytes, { flag: 'wx', mode: 0o600 });

  // A18: fsync the tmp file using the FileHandle from fsPromises.open.
  // A14: use handle.sync() only (M001 carry-forward: redundant sync removed).
  const handle = await fsPromises.open(tmpPath, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }

  await fsPromises.rename(tmpPath, statePath);
}
