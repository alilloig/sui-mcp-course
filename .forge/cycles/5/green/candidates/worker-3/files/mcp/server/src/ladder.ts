import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import type { State } from './schemas/state.js';
import type { SpotData } from './schemas/phases.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutoWriteErrorKind =
  | 'target-file-missing'
  | 'target-range-invalid'
  | 'snapshot-write-failed'
  | 'overwrite-failed'
  | 'target-path-outside-project'
  | 'snapshot-path-invalid';

export class AutoWriteError extends Error {
  public readonly kind: AutoWriteErrorKind;
  constructor(kind: AutoWriteErrorKind, message: string) {
    super(message);
    this.name = 'AutoWriteError';
    this.kind = kind;
  }
}

export interface AutoWriteResult {
  backupPath: string;
  bytesWritten: number;
}

// ---------------------------------------------------------------------------
// containedPath — security helper
// ---------------------------------------------------------------------------

/**
 * Resolve `untrusted` relative to `root` and assert the result is strictly
 * inside `root` (i.e. the resolved path starts with `root + path.sep`).
 *
 * Rejects:
 *   - Absolute paths (path.join(root, '/etc/passwd') === '/etc/passwd')
 *   - Dotdot traversals ('../../etc/passwd')
 *   - The root itself (resolved === root, not inside)
 *
 * Returns the resolved absolute path on success, or null on containment failure.
 */
function containedPath(root: string, untrusted: string): string | null {
  // path.join collapses but does NOT reject absolute untrusted paths on its own.
  // path.resolve gives us the canonical absolute path.
  const resolved = path.resolve(root, untrusted);
  const rootNorm = path.resolve(root);
  // Must be strictly inside: starts with root + sep (not equal to root itself)
  if ((resolved + path.sep).startsWith(rootNorm + path.sep) && resolved !== rootNorm) {
    return resolved;
  }
  return null;
}

// ---------------------------------------------------------------------------
// recordRungUse — append-only ladder mutations (AC-5.2)
// ---------------------------------------------------------------------------

/**
 * Returns a new State whose ladder[spotId] has the rung's flag set to true.
 * Rung 1 → hint_used
 * Rung 2 → reference_shown
 * Rung 3 → auto_completed + auto_write_attempted
 * Never sets a flag from true to false.
 */
export function recordRungUse(state: State, spotId: string, rung: 1 | 2 | 3): State {
  const existing = state.ladder[spotId] ?? {
    hint_used: false,
    reference_shown: false,
    auto_completed: false,
    auto_write_attempted: false,
  };

  const updated = { ...existing };

  if (rung === 1) {
    updated.hint_used = true;
  } else if (rung === 2) {
    updated.reference_shown = true;
  } else {
    // rung === 3
    updated.auto_completed = true;
    updated.auto_write_attempted = true;
  }

  return {
    ...state,
    ladder: {
      ...state.ladder,
      [spotId]: updated,
    },
  };
}

// ---------------------------------------------------------------------------
// canAdvanceRung — rung gating (AC-5.1)
// ---------------------------------------------------------------------------

export type CanAdvanceRungResult =
  | { ok: true }
  | { ok: false; missingFlag: 'hint_used' | 'reference_shown'; requiredPriorRung: 1 | 2 };

/**
 * Check whether the given rung can be requested.
 * Rung 1: always ok.
 * Rung 2: requires hint_used === true.
 * Rung 3: requires reference_shown === true.
 */
export function canAdvanceRung(
  state: State,
  spotId: string,
  rung: 1 | 2 | 3,
): CanAdvanceRungResult {
  if (rung === 1) {
    return { ok: true };
  }

  const entry = state.ladder[spotId];

  if (rung === 2) {
    if (entry?.hint_used === true) {
      return { ok: true };
    }
    return { ok: false, missingFlag: 'hint_used', requiredPriorRung: 1 };
  }

  // rung === 3
  if (entry?.reference_shown === true) {
    return { ok: true };
  }
  return { ok: false, missingFlag: 'reference_shown', requiredPriorRung: 2 };
}

// ---------------------------------------------------------------------------
// runAutoWrite — snapshot-then-overwrite (A7)
// ---------------------------------------------------------------------------

const STATE_DIR = '.sui-deepbook-course';
const SNAPSHOTS_DIR = 'snapshots';

/**
 * Snapshot the existing target_range bytes to a .bak file, then overwrite
 * that range with the substituted payload.
 *
 * Step ordering:
 *  (a) Read target_file (reject on ENOENT)
 *  (b) Parse + validate target_range
 *  (c) Write snapshot .bak (wx + 0o600), rotate any existing .bak first
 *  (d) Overwrite target_file with the spliced payload
 *
 * Returns { backupPath, bytesWritten }.
 */
export async function runAutoWrite(
  projectRoot: string,
  spot: Pick<SpotData, 'id' | 'target_file' | 'target_range'>,
  payload: string,
): Promise<AutoWriteResult> {
  // Security: validate target_file is contained within projectRoot
  const safeTargetFilePath = containedPath(projectRoot, spot.target_file!);
  if (safeTargetFilePath === null) {
    throw new AutoWriteError(
      'target-path-outside-project',
      `target_file '${spot.target_file}' resolves outside projectRoot: path traversal rejected`,
    );
  }
  const targetFilePath = safeTargetFilePath;

  // (a) Read existing target file
  let existingContent: string;
  try {
    existingContent = await fsPromises.readFile(targetFilePath, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new AutoWriteError('target-file-missing', `Target file not found: ${targetFilePath}`);
    }
    throw new AutoWriteError('target-file-missing', `Failed to read target file: ${e.message}`);
  }

  // (b) Parse and validate target_range (1-indexed inclusive)
  const rangeStr = spot.target_range ?? '';
  const rangeMatch = rangeStr.match(/^(\d+)-(\d+)$/);
  let startLine: number;
  let endLine: number;

  if (!rangeMatch) {
    throw new AutoWriteError(
      'target-range-invalid',
      `Cannot parse target_range: '${rangeStr}' — expected format like '39-58'`,
    );
  }

  startLine = parseInt(rangeMatch[1], 10);
  endLine = parseInt(rangeMatch[2], 10);
  const lines = existingContent.split('\n');
  const totalLines = lines.length;

  if (
    startLine < 1 ||
    endLine < startLine ||
    startLine > totalLines ||
    endLine > totalLines
  ) {
    throw new AutoWriteError(
      'target-range-invalid',
      `target_range '${rangeStr}' is out of bounds (file has ${totalLines} lines, 1-indexed)`,
    );
  }

  // Extract the slice (1-indexed inclusive → 0-indexed)
  const sliceStart = startLine - 1;
  const sliceEnd = endLine; // exclusive for JS slice
  const originalSlice = lines.slice(sliceStart, sliceEnd);
  const snapshotContent = originalSlice.join('\n');

  // (c) Write snapshot to .bak
  const snapshotsDir = path.join(projectRoot, STATE_DIR, SNAPSHOTS_DIR);
  await fsPromises.mkdir(snapshotsDir, { recursive: true });

  // Security: validate spot.id yields a contained snapshot path
  const rawBakPath = path.join(snapshotsDir, `${spot.id}.bak`);
  const safeBakPath = containedPath(snapshotsDir, `${spot.id}.bak`);
  if (safeBakPath === null) {
    throw new AutoWriteError(
      'snapshot-path-invalid',
      `spot.id '${spot.id}' produces a snapshot path outside the snapshots directory: path traversal rejected`,
    );
  }
  const bakPath = rawBakPath;

  // Rotate existing .bak if present
  try {
    await fsPromises.access(bakPath);
    // File exists — rotate it
    const ts = new Date().toISOString().replace(/:/g, '');
    const rotatedPath = `${bakPath}.${ts}`;
    await fsPromises.rename(bakPath, rotatedPath);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // ENOENT means it doesn't exist — that's fine
    if (e.code !== 'ENOENT') {
      throw new AutoWriteError(
        'snapshot-write-failed',
        `Failed to rotate existing snapshot: ${e.message}`,
      );
    }
  }

  // Write the snapshot with wx flag and mode 0o600
  try {
    await fsPromises.writeFile(bakPath, snapshotContent, { flag: 'wx', mode: 0o600 });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    throw new AutoWriteError(
      'snapshot-write-failed',
      `Failed to write snapshot file: ${e.message}`,
    );
  }

  // (d) Splice payload into lines and overwrite target_file
  const payloadLines = payload.split('\n');
  const newLines = [
    ...lines.slice(0, sliceStart),
    ...payloadLines,
    ...lines.slice(sliceEnd),
  ];
  const newContent = newLines.join('\n');

  try {
    await fsPromises.writeFile(targetFilePath, newContent, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    throw new AutoWriteError(
      'overwrite-failed',
      `Failed to overwrite target file: ${e.message}`,
    );
  }

  const bytesWritten = Buffer.byteLength(snapshotContent, 'utf8');

  return {
    backupPath: bakPath,
    bytesWritten,
  };
}
