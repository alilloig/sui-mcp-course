# Cycle 5 verification notes

Adjudication of every cluster matching: max_severity ∈ {critical, high}, disputed_severity, singleton-high, or category count ≥ 3.

## C001 — verifySpot.error dropped on rung-3 path (disputed: high → info)

**Cited:** `mcp/server/src/tools/requestHint.ts:281-295`. **Verified at source.**

The handler builds `AutoVerifyResult` from `runVerifySpot`'s return at lines 284-288 reading only `pass`, `advanced`, `output`. `verifySpot.ts:96-103` constructs `{ pass: true, output, advanced: false, error: 'verification passed but state persist failed: ...' }` on the M002 saveState-failure branch — that `error` string is dropped. `AutoVerifyResult` (requestHint.ts:17-21) declares no `error` field at all.

Three branches return error fields from runVerifySpot: M001 unsupported-mode (line 81-85), M002 pass-but-save-fails (lines 96-103), output-style-disabled-flipped-mid-call (line 32). All three are dropped.

**Adjudication: confirm with re-derived severity = medium.** Real defect. User-visible on the M002 race (rare but non-zero on EACCES/ENOSPC). Recovery path exists (re-run verifySpot). Disputed-flag resolved (was high/info; my call is medium).

## C003 — rung-3 dispatches whole runVerifySpot tool (singleton high)

**Cited:** `mcp/server/src/tools/requestHint.ts:281`. **Verified at source.**

Confirmed: `runVerifySpot({ projectRoot }, opts)` at line 281 re-runs the entire tool handler. Concretely it re-runs probeOutputStyle, re-loads state from disk (just written one statement earlier at line 268), re-loads phases (lines 51-56 of verifySpot.ts), re-fetches getCurrentSpot, re-checks the verification spec, runs runVerification, advances cursor, saves state again. So rung-3 happy path issues 2 outputStyleOk gates, 2 loadState round-trips, 2 loadPhases round-trips, 2 saveState commits.

The synthesis-notes corroborate: T-095 was the "stale-state bug" — production correctness depends on disk consistency between requestHint's saveState (line 268) and verifySpot's loadState (line 36). The contract Behavior section says "dispatches runVerifySpot" — taken literally, the implementation is contract-compliant. But the right primitive to compose is `runVerification` + `advanceCursor` + `saveState`, which would also light up the dead `advanceCursor` import (C004/C010) and the dead `savedState` binding (C009).

**Adjudication: confirm with re-derived severity = medium.** Design smell with concrete failure modes (double-IO, fragile-disk-consistency, M002 race surface doubled), but not a defect that ships visible to the user on the happy path. Single-reviewer; downgrade from high to medium.

## C007 — rung-3 saveState failure leaves auto_completed un-persisted while side effects committed (singleton high)

**Cited:** `mcp/server/src/tools/requestHint.ts:262-288`. **Verified at source.**

Three sub-claims merged into this cluster:

1. **Uncaught runVerifySpot throw** (R3-001): line 281 `await runVerifySpot(...)` has no try/catch. `verifySpot.ts:87` deliberately re-throws non-VerificationModeUnsupportedError errors. An unexpected exception (a future verification adapter, a spawnFn that synchronously rejects) propagates as a rejected promise after snapshot+overwrite+saveState committed. **Confirm.**

2. **AC-5.4 violation under saveState failure** (R3-003): on saveState rejection at line 268, the in-memory `auto_completed = true` flip is discarded but on disk: target_file is permanently overwritten, .bak holds the original. Contract Behavior says "auto_completed is set as soon as the rung-3 read+write+flip atomic block completes — the only way to 'not set' it is for the read or snapshot or overwrite to fail before the flag flip." The flip succeeded in memory; disk does not reflect it. Real, but the contract phrasing leaves wiggle room (depends whether saveState counts as part of "the flip" or as a downstream commit). **Confirm.**

3. **No rollback from .bak on saveState fail** (R3-006): correct, no rollback path. Contract Behavior says "a crash mid-overwrite leaves both the snapshot and the (partially written) target_file recoverable by hand." A saveState failure is a process-level failure; engine could synchronously roll back. Recovery is "by hand" via the .bak. **Confirm but acceptable per contract.**

**Adjudication: confirm with re-derived severity = medium.** Cluster is real but each sub-claim is conditional (rare error classes, EACCES/ENOSPC on .sui-deepbook-course, contract phrasing covers manual recovery). Worth fixing but not a ship-blocker. Singleton; downgrade from high to medium.

## C012 — Path traversal via spot.rungs.* lets engine read arbitrary files (singleton high, security)

**Cited:** `mcp/server/src/tools/requestHint.ts:187-189`. **Verified at source.**

```ts
const rungContentPath = rungRelPath
  ? path.join(projectRoot, 'paths', slug, rungRelPath)
  : path.join(projectRoot, 'paths', slug, 'rungs', spot.id, rungFile);
```

`path.join('/proj', 'paths', 'slug', '../../../../etc/passwd')` returns `/etc/passwd`. No containment check. **Schema validation at `mcp/server/src/schemas/phases.ts:215-234` only checks `typeof === 'string'` for `hint_md`, `reference_md`, `auto_write_md`.** No slug regex; no `path.isAbsolute` rejection; no `path.resolve(...).startsWith(projectRoot + sep)` assertion.

**Adversary path:** A third-party curriculum (publishing model the contract explicitly anticipates: "curriculum content authored by third parties or contributed via PRs") ships a `phases.json` with `rungs.auto_write_md: '../../../../home/user/.ssh/id_rsa'`. Learner clones the curriculum, runs `selectPath`, advances to the spot, opts into rung 3. The engine reads `/home/user/.ssh/id_rsa` from disk, runs `substitutePromptOnly` over the bytes (text content is byte-faithful), then C021 below splices the result into `<projectRoot>/<spot.target_file>` — which the same attacker also controls.

**Adjudication: confirm with re-derived severity = critical.** Singleton, but the source verification is unambiguous; the schema gap is unambiguous; the adversary path is concrete and named in the contract's own threat model.

## C021 — Path traversal via spot.target_file allows arbitrary file overwrite (singleton high, security)

**Cited:** `mcp/server/src/ladder.ts:133`. **Verified at source.**

```ts
const targetFilePath = path.join(projectRoot, spot.target_file!);
```

Same pattern. `path.join('/proj', '/etc/cron.d/evil')` → `/etc/cron.d/evil` (POSIX `path.join` with absolute second arg returns the absolute arg). `path.join('/proj', '../../etc/passwd')` → `/etc/passwd`. Schema `phases.ts:194` only checks string type.

**Adversary path:** Same third-party curriculum, sets `target_file: '../../../home/user/.bashrc'` and ships an `auto.md` with a malicious shell-init payload. Rung 3 → `fsPromises.writeFile('/home/user/.bashrc', payload)` succeeds.

The contract A2/A7 phrase "literal-from-manifest" was intended to mean "no `{{...}}` template substitution applied to paths" — NOT "no path-safety validation applied." The implementer reasonably interpreted it as the latter. Recommendation in the cluster (resolve + assert containment + reject `path.isAbsolute`) is correct.

**Adjudication: confirm with re-derived severity = critical.** This is the load-bearing arbitrary-write half of the read+write primitive. Concrete adversary; concrete blast radius (anything writable by the MCP-server process); contract explicitly contemplates third-party curricula.

## C022 — Path traversal via spot.id allows snapshot write outside snapshots dir (singleton high, security)

**Cited:** `mcp/server/src/ladder.ts:187-209`. **Verified at source.**

```ts
const bakPath = path.join(snapshotsDir, `${spot.id}.bak`);
```

Schema only validates `typeof spot.id === 'string'` (`phases.ts:175`). A `spot.id: '../../../tmp/evil'` produces `bakPath = <projectRoot>/.sui-deepbook-course/tmp/evil.bak`. `mkdir({ recursive: true })` at line 185 creates the parent dirs; `wx + 0o600` writeFile at line 209 plants the file.

The `wx` flag fails closed on existing files (good — prevents in-place overwrite via traversal), but allows novel-path planting. The rotation step (`fsPromises.rename(bakPath, rotatedPath)`) carries the traversal forward; rotation is destructive (POSIX rename overwrites).

**Adversary path:** A `phases.json` with `id: '../../../home/user/.ssh/authorized_keys'` (with a `target_file` and `auto.md` engineered such that the SLICE captured into `.bak` is an attacker-controlled SSH key) plants `<projectRoot>/.sui-deepbook-course/home/user/.ssh/authorized_keys.bak` — which is bounded inside snapshotsDir. To escape `<projectRoot>`, attacker uses `id: '../../../../../../tmp/x'` (enough `..` segments). Then `path.join(snapshotsDir, '../../../../../../tmp/x.bak')` resolves outside the project. The wx flag prevents replacing existing files but allows planting new ones.

**Adjudication: confirm with re-derived severity = critical.** Singleton, but the verification is direct and the recommendation (slug regex `/^[a-z0-9][a-z0-9_-]*$/` + path containment assert) is one-liners. Same adversary as C012/C021.

## C023 — AutoWriteFailedWarning uses kind_detail, breaks discriminated-union convention (disputed: medium → info)

**Cited:** `mcp/server/src/warnings.ts:107-112`. **Verified at source.**

```ts
export interface AutoWriteFailedWarning {
  kind: 'auto-write-failed';
  spotId: string;
  kind_detail: 'target-file-missing' | 'target-range-invalid' | 'snapshot-write-failed' | 'overwrite-failed';
  message: string;
}
```

Contract A12 specifies the inner classifier as `kind: '...'` nested. The implementation renamed it to `kind_detail` because TS discriminated unions can't have two same-named fields with different literal sets on one interface. **The renaming was a forced engineering choice; the contract phrasing didn't anticipate the type-system constraint.**

Critically: this warning interface is currently DEAD CODE. No producer constructs an `AutoWriteFailedWarning` value. requestHint.ts emits `error.message: 'auto-write-failed (${err.kind}): ${err.message}'` as a string; nothing types as `AutoWriteFailedWarning`. So consumer-facing impact is zero today.

**Adjudication: confirm with re-derived severity = low.** The right fix per cluster recommendation (rename to `reason: AutoWriteErrorKind` or expand to four sibling kinds) is one diff. Three reviewers agreed; severity spread (medium/medium/info) reflects honest disagreement. Disputed-flag resolved at low.

## Mega-cluster check

C001, C003, C007 all touch overlapping ranges in requestHint.ts (lines 262-296). Are they distinct concerns?
- C001 = error field dropped from response shape (correctness/observability)
- C003 = wrong primitive composition (design)
- C007 = uncaught throw + AC-5.4 violation under save-fail (error-handling)

All three are genuinely different concerns. **Not a mega-cluster.** Keep as three findings.

## Orchestrator amendment audit

R5's verdict ("structurally sound, no load-bearing weakening") is correct. Spot-checks:

1. T-179/T-180 expanded "exactly 6 tools" → 7 to admit `requestHint` — necessary baseline update for cycle 5's seventh tool. Load-bearing claim (registerTools enumerates the right surface) intact.
2. T-091 widened to basename allowlist `{runPreflightProbe.ts, preflight.ts, manifest.ts}`. C032/R5-001 documents the residual gap (basename match would miss a hypothetical `tools/manifest.ts`); T-148 covers the load-bearing per-tool claim within `mcp/server/src/tools/`. Correct call to widen and rely on T-148.
3. T-090 rephrased a comment-text grep from `setVerifyOverride` literal to "module-level test override seam (cycle-4 H001 fix)" — invariant intact.
4. T-019/T-056/T-103 — the `vi.spyOn` recursion bug pattern is real test-side infrastructure noise. Forwarding via `fs.writeFileSync` is a sound mock-isolation technique.
5. T-095 — stateful saveState mock that asserts every save preserves the append-only flags is strictly stronger than the original "last save shape" check.
6. T-103 off-by-one `>` → `>=` aligns with the impl ordering: saveState fires at-or-after target write.

## A11 / AC-1.3 carry-forward verification

R6 verified outputStyleOk gates at five tool boundaries (selectPath, setPersonalization, nextSpot, verifySpot, requestHint). Confirmed by source-grep at requestHint.ts:81-90, verifySpot.ts:30-33. Cycle-1 zero-write invariant intact across the full tool surface.

C005 (4 different gate failure shapes) is real design-smell but doesn't violate AC-1.3 — fail-closed is satisfied uniformly; only the response schema differs. Severity = medium per consolidator's pre-derivation.

## Auto_completed permanence (A6)

Source-grep `auto_completed\s*=\s*false` against `mcp/server/src/` returned zero matches. Invariant holds in practice. C033 documents that the test only greps two cycle-5 files; the wider scope is currently zero by inspection.

