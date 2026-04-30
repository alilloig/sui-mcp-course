import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { validateState } from './schemas/state.js';
import type { State } from './schemas/state.js';

export type { State };

export const STATE_SCHEMA_VERSION = 1;

const STATE_DIR = '.sui-deepbook-course';
const STATE_FILE = 'state.json';

// Monotonic counter to ensure uniqueness within the same millisecond
let archiveCounter = 0;

// Content-hash → archive path cache for deduplication (H003).
// Keyed by SHA-256 hex of the corrupt bytes; value is the archive path
// already written. Resets per process but survives multiple loadState calls
// within the same process lifetime.
const archiveDedupeCache = new Map<string, string>();

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
    // Other read errors (EACCES, ENOTDIR, etc.) → corrupt classification.
    // archivedTo is omitted (no archive was written; the file couldn't be read).
    return {
      kind: 'corrupt',
      message: `Failed to read state file: ${e.message ?? String(e)}`,
    };
  }

  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_parseErr) {
    // Not valid JSON — archive and return corrupt. If the archive write
    // itself fails, degrade to corrupt-without-archivedTo so the corruption
    // diagnostic still surfaces (C008a remediation).
    return await classifyCorrupt(stateDir, raw, 'invalid JSON');
  }

  // JSON is valid — check schema_version
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

  // Validate shape
  const validation = validateState(parsed);
  if (!validation.ok) {
    return await classifyCorrupt(stateDir, raw, `schema validation failed: ${validation.error}`);
  }

  return { kind: 'ok', state: validation.value };
}

// Helper to archive corrupt bytes and build the LoadStateResult. If the
// archive write fails (ENOSPC / EACCES on .sui-deepbook-course / etc.), we
// degrade to corrupt-without-archivedTo so the primary corruption diagnostic
// still surfaces. Without this guard, the SDK turns the rejection into a
// generic transport error and cycle 4's recovery flow loses its dispatch
// signal. See review.md cluster C008a.
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
  // H003: deduplicate archive emission by content hash.
  // If we have already archived these exact bytes (same SHA-256), return the
  // existing archive path without writing a new file.
  const contentHash = createHash('sha256').update(content, 'utf8').digest('hex');
  const existing = archiveDedupeCache.get(contentHash);
  if (existing !== undefined) {
    // Verify the file still exists on disk; if it was deleted externally,
    // fall through to re-create it.
    try {
      await fsPromises.access(existing);
      return existing;
    } catch {
      // File was removed — fall through to write a new archive.
      archiveDedupeCache.delete(contentHash);
    }
  }

  // Ensure the state directory exists (it should, but be safe)
  await fsPromises.mkdir(stateDir, { recursive: true });

  // Build an ISO-8601-ish timestamp that is filesystem-safe (no `:`)
  const ts = new Date().toISOString().replace(/:/g, '-');

  // Include a monotonic counter for same-millisecond collisions
  archiveCounter += 1;
  const suffix = `${ts}-${archiveCounter}`;
  const archiveName = `state.corrupt-${suffix}.json`;
  const archivePath = path.join(stateDir, archiveName);

  // A19: use wx flag (refuse if file exists) and mode 0o600
  await fsPromises.writeFile(archivePath, content, { flag: 'wx', mode: 0o600 });

  // Cache so subsequent calls with identical bytes skip the write.
  archiveDedupeCache.set(contentHash, archivePath);

  return archivePath;
}

export async function saveState(projectRoot: string, state: State): Promise<void> {
  const stateDir = path.join(projectRoot, STATE_DIR);
  const statePath = path.join(stateDir, STATE_FILE);

  // Create directory if it doesn't exist (saveState is permitted to mkdir)
  await fsPromises.mkdir(stateDir, { recursive: true });

  const bytes = JSON.stringify(state, null, 2);
  const tmpPath = path.join(stateDir, `state.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  // A19: use wx flag (refuse if file exists) and mode 0o600
  await fsPromises.writeFile(tmpPath, bytes, { flag: 'wx', mode: 0o600 });

  // A18: durably flush via the FileHandle returned by fsPromises.open.
  // M001 carry-forward (cycle 4): handle.sync() + handle.close() only;
  // the legacy fs-level sync call is removed.
  const handle = await fsPromises.open(tmpPath, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }

  // Atomic rename tmp → canonical
  await fsPromises.rename(tmpPath, statePath);
}
