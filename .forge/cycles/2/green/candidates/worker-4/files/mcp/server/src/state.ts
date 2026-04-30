import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { validateState } from './schemas/state.js';
import type { State } from './schemas/state.js';

export type { State };

export const STATE_SCHEMA_VERSION = 1;

const STATE_DIR = '.sui-deepbook-course';
const STATE_FILE = 'state.json';

function stateDirPath(projectRoot: string): string {
  return path.join(projectRoot, STATE_DIR);
}

function stateFilePath(projectRoot: string): string {
  return path.join(stateDirPath(projectRoot), STATE_FILE);
}

export type LoadStateResult =
  | { kind: 'absent' }
  | { kind: 'ok'; state: State }
  | { kind: 'corrupt'; archivedTo: string; message: string }
  | { kind: 'schema-mismatch'; foundVersion: number; message: string };

// Counter used to disambiguate archives created within the same millisecond.
let _archiveSeq = 0;
let _lastArchiveTs = '';

function makeArchiveSuffix(): string {
  const now = new Date();
  // Use ISO-8601 with `:` replaced by `-` for filesystem safety.
  const ts = now.toISOString().replace(/:/g, '-');
  if (ts === _lastArchiveTs) {
    _archiveSeq += 1;
  } else {
    _archiveSeq = 0;
    _lastArchiveTs = ts;
  }
  return _archiveSeq > 0 ? `${ts}.${_archiveSeq}` : ts;
}

export async function loadState(projectRoot: string): Promise<LoadStateResult> {
  const filePath = stateFilePath(projectRoot);

  let raw: string;
  try {
    raw = await fsPromises.readFile(filePath, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return { kind: 'absent' };
    }
    // Other read errors (EACCES, ENOTDIR, etc.) → corrupt classification
    return {
      kind: 'corrupt',
      archivedTo: '',
      message: `Failed to read state file: ${e.message ?? String(err)}`,
    };
  }

  // Try JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_parseErr) {
    // Not valid JSON → archive original bytes and return corrupt
    const archiveSuffix = makeArchiveSuffix();
    const archiveName = `state.corrupt-${archiveSuffix}.json`;
    const archivedTo = path.join(stateDirPath(projectRoot), archiveName);

    await fsPromises.mkdir(stateDirPath(projectRoot), { recursive: true });
    await fsPromises.writeFile(archivedTo, raw, 'utf8');

    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file was corrupt (invalid JSON); archived original bytes to ${archivedTo}.`,
    };
  }

  // Check schema_version before full validation
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed)
  ) {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj['schema_version'] === 'number') {
      if (obj['schema_version'] !== STATE_SCHEMA_VERSION) {
        const foundVersion = obj['schema_version'];
        return {
          kind: 'schema-mismatch',
          foundVersion,
          message: `State file has incompatible schema_version ${foundVersion}. Manual migration required before resuming.`,
        };
      }
    }
  }

  // Full shape validation
  const validation = validateState(parsed);
  if (!validation.ok) {
    // Shape-invalid but JSON-valid — treat as corrupt and archive
    const archiveSuffix = makeArchiveSuffix();
    const archiveName = `state.corrupt-${archiveSuffix}.json`;
    const archivedTo = path.join(stateDirPath(projectRoot), archiveName);

    await fsPromises.mkdir(stateDirPath(projectRoot), { recursive: true });
    await fsPromises.writeFile(archivedTo, raw, 'utf8');

    return {
      kind: 'corrupt',
      archivedTo,
      message: `State file was corrupt (invalid shape: ${validation.error}); archived original bytes to ${archivedTo}.`,
    };
  }

  return { kind: 'ok', state: validation.value };
}

export async function saveState(projectRoot: string, state: State): Promise<void> {
  const dir = stateDirPath(projectRoot);
  await fsPromises.mkdir(dir, { recursive: true });

  const canonical = stateFilePath(projectRoot);
  const tmpPath = path.join(dir, `state.tmp-${Date.now()}-${process.pid}.json`);

  const bytes = JSON.stringify(state, null, 2);
  await fsPromises.writeFile(tmpPath, bytes, 'utf8');

  // fsync the tmp file before rename for durability
  const fd = fs.openSync(tmpPath, 'r');
  fs.fsyncSync(fd);
  fs.closeSync(fd);

  await fsPromises.rename(tmpPath, canonical);
}
