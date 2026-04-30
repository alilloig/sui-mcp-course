# Cycle 5 Review

## Executive summary

Cycle 5 ships the seventh MCP tool (`requestHint`) and the three-rung help ladder per spec. The core happy path works (400/401 tests green; T-157 deferred for Phase F) and the cycle-1 zero-write invariant (AC-1.3) holds across the full tool surface. **The cycle does NOT pass.** Three converging path-traversal findings (R6-001/R6-002/R6-003) form a complete arbitrary-read + arbitrary-write primitive against any third-party-authored `phases.json` — a publishing model the contract explicitly anticipates. Schema validation in `mcp/server/src/schemas/phases.ts` only checks `typeof === 'string'` for `target_file`, `spot.id`, and `rungs.{hint_md,reference_md,auto_write_md}`; `runAutoWrite` and `requestHint` then `path.join` those fields with no containment check. Re-derivation upgrades these three to **critical**. Three additional clusters in the rung-3 dispatch boundary (uncaught throw, error field dropped, double-IO via dispatching the whole runVerifySpot tool) are real but downgrade to medium after verification.

## Severity counts

| Severity | Count |
|---|---|
| critical | 3 |
| high     | 0 |
| medium   | 5 |
| low      | 19 |
| info     | 4 |

## Findings (by severity)

### Critical

- **C021 — Path traversal via `spot.target_file` allows arbitrary file overwrite.** **File:** `mcp/server/src/ladder.ts:133`. **Impact:** `path.join(projectRoot, spot.target_file!)` accepts `..` traversal AND absolute paths (`path.join('/proj', '/etc/cron.d/evil')` returns `/etc/cron.d/evil`). Schema (`schemas/phases.ts:194`) only checks `typeof string`. A third-party-authored `phases.json` with `target_file: '../../../home/<user>/.bashrc'` and a malicious `auto.md` payload causes `fsPromises.writeFile('/home/<user>/.bashrc', payload)` the moment the learner opts into rung 3. **Recommendation:** before opening, `const resolved = path.resolve(projectRoot, spot.target_file); assert(resolved !== projectRoot && (resolved + path.sep).startsWith(path.resolve(projectRoot) + path.sep)); reject(path.isAbsolute(spot.target_file))`. Surface as new `AutoWriteError('target-path-outside-project', ...)`. **Reviewers:** R6 (singleton, agreement=1).
  *Verification note:* Confirmed at source. Adversary path is concrete; trust model documented in cluster description matches contract intent ("curriculum content authored by third parties or contributed via PRs"). The contract A2/A7 phrase "literal-from-manifest" is about waiving template substitution, NOT about waiving path-safety checks — re-read of spec confirms.

- **C012 — Path traversal via `spot.rungs.{hint_md,reference_md,auto_write_md}` lets engine read arbitrary files.** **File:** `mcp/server/src/tools/requestHint.ts:187-189`. **Impact:** `path.join(projectRoot, 'paths', slug, rungRelPath)` with `rungRelPath = '../../../../etc/passwd'` (or `'../../../../home/user/.ssh/id_rsa'`) returns the absolute path. The engine `readFile`s it, runs `substitutePromptOnly` over the bytes (text-faithful), and on rung 3 splices the result into the also-attacker-controlled `target_file`. Combined with C021 this is a confused-deputy primitive: read anything the MCP-server user can read, write the result anywhere they can write. **Recommendation:** resolve and assert containment under `path.resolve(projectRoot, 'paths', slug) + path.sep`. Apply identically to the canonical fallback path (line 189). Validate `slug` against a slug regex at scan time. **Reviewers:** R6 (singleton, agreement=1).
  *Verification note:* Confirmed at source. Schema gap verified at `phases.ts:215-234`. Adversary class: a malicious or compromised third-party course package the learner installs.

- **C022 — Path traversal via `spot.id` allows snapshot write outside snapshots dir.** **File:** `mcp/server/src/ladder.ts:187-209`. **Impact:** `path.join(snapshotsDir, ${spot.id}.bak)` with attacker-controlled `spot.id` containing `..` segments writes a `0o600` file outside `<projectRoot>/.sui-deepbook-course/snapshots/`. The `wx` flag fails closed on existing files but allows novel-path planting (`/tmp/seed.bak` etc.). The rotation step (`rename` to `${bakPath}.${ts}`) carries the traversal and, because POSIX rename overwrites, can silently destroy the rotated target. **Recommendation:** validate `spot.id` (and `phase.id`) against `/^[a-z0-9][a-z0-9_-]*$/` at `validatePhases` time; additionally assert `path.resolve(bakPath).startsWith(path.resolve(snapshotsDir) + path.sep)` before write. **Reviewers:** R6 (singleton, agreement=1).
  *Verification note:* Confirmed at source. Same threat model as C012/C021. Slug regex is the load-bearing fix; path-containment assertion is defense-in-depth.

### High

(none — three originals re-derived critical, three originals re-derived medium)

### Medium

- **C001 — `verifyResult.error` silently dropped from rung-3 `autoVerifyResult`.** **File:** `mcp/server/src/tools/requestHint.ts:284-288`. **Impact:** When rung-3's dispatched `runVerifySpot` returns `{ pass: true, advanced: false, error: 'verification passed but state persist failed: ...' }` (M002 carry-forward branch in `verifySpot.ts:96-103`), requestHint forwards only `pass`/`advanced`/`output`. The student sees a passing verify with no advance and no diagnostic — undistinguishable from a "passed but cursor was already done" case. Same dropping for M001 unsupported-mode and the rare output-style-flipped-mid-call. **Recommendation:** widen `AutoVerifyResult` with `error?: string`, forward `verifyResult.error`. **Reviewers:** R1, R3 (agreement=2). *Originally disputed high/info; re-derived medium.*
  *Verification note:* Confirmed. Real defect, observable on the M002 race (rare but non-zero on EACCES/ENOSPC). Recovery exists (re-run verifySpot). Disputed-flag resolved at medium.

- **C003 — Rung-3 dispatches the entire `runVerifySpot` tool instead of composing primitives.** **File:** `mcp/server/src/tools/requestHint.ts:281`. **Impact:** Rung-3 happy path issues 2 outputStyleOk gates, 2 `loadState` round-trips (post-`saveState`-from-line-268 → re-`loadState`-from-line-36-of-verifySpot), 2 `loadPhases` round-trips, 2 `saveState` commits. Doubles the M002 disk-failure surface that this same cycle was hardening. The synthesis-notes T-095 documents that production correctness now depends on disk consistency between two saveState calls — a fragile invariant the test could only model after a stateful mock fix. **Recommendation:** compose `runVerification(spec, projectRoot, opts)` + `advanceCursor(state-with-rung3-flags, phasesData)` + single `saveState` directly inside requestHint. Lights up the dead `advanceCursor` import (C010) and the dead `savedState` binding (C009). **Reviewers:** R2 (singleton, agreement=1). *Originally high; re-derived medium.*
  *Verification note:* Singleton high downgraded to medium. Real design defect with concrete failure modes but not a ship-visible bug on the happy path; deserves the cycle-6 backlog rather than a re-spin.

- **C007 — Rung-3 saveState failure leaves `auto_completed` un-persisted while side effects committed.** **File:** `mcp/server/src/tools/requestHint.ts:262-288`. **Impact:** Three sub-claims merged: (a) the `runVerifySpot` dispatch at line 281 has no try/catch, and `verifySpot.ts:87` deliberately rethrows non-VerificationModeUnsupportedError errors — propagates as a transport error AFTER snapshot+overwrite+saveState committed; (b) on a saveState rejection at line 268, target_file is permanently overwritten and `.bak` exists, but state.json's `auto_completed` is still false — AC-5.4 phrasing leaves wiggle room ("the flip" succeeded in memory) but contract intent (save commits the flip) is violated; (c) no .bak rollback on saveState fail (recovery is "by hand" per contract). **Recommendation:** wrap the `runVerifySpot` dispatch in try/catch returning a structured `auto-verify-failed` error kind; on the saveState rejection branch include the snapshot path in the error message so the caller can narrate manual recovery. **Reviewers:** R3 (singleton, agreement=1). *Originally high; re-derived medium.*
  *Verification note:* Real failure mode but each sub-claim is conditional (rare error class from runVerification, EACCES on `.sui-deepbook-course`, contract permits manual recovery via .bak). Not a ship-blocker on its own; would block if the path-traversal critical issues weren't already blocking.

- **C005 — outputStyleOk gate produces four different failure shapes across five tools.** **File:** `mcp/server/src/tools/{selectPath,setPersonalization,nextSpot,verifySpot,requestHint}.ts`. **Impact:** Same gate condition surfaces as `errors: ['output-style-disabled']` (selectPath/setPersonalization) vs `done: false, error: 'output-style-disabled'` (nextSpot) vs `pass: false, error: 'output-style-disabled', advanced: false` (verifySpot) vs `error: { kind: 'output-style-disabled', message }` (requestHint). The conductor agent has to encode four shapes for one condition. **Recommendation:** extract `assertOutputStyleOk()` helper; either uniformize the failure shape across tools or add a uniform additive `gate?: 'output-style-disabled'` field. **Reviewers:** R2 (singleton, agreement=1).

- **C008 — Rung-3 auto-write writes payload with unresolved `{{ ... }}` placeholders when personalization key is missing.** **File:** `mcp/server/src/tools/requestHint.ts:205-259`. **Impact:** `substitutePromptOnly` intentionally leaves unknown placeholders intact. If the student skipped `setPersonalization` (or `personalization_options` grew between cycles), rung-3 writes literal `{{ pool_subset }}` substrings into `App.tsx` — `pnpm build` then fails with a syntax error rather than a structured `personalization-missing` error from requestHint. The .bak rotation has consumed one slot by the time the student notices. **Recommendation:** on rung 3 only, scan substituted payload for `\{\{\s*[a-zA-Z_]` and short-circuit with a new `personalization-missing` error kind naming the unresolved key. Rungs 1 / 2 keep the leave-intact behavior (rendered as docs, not committed to source). **Reviewers:** R3 (singleton, agreement=1).

- **C024 — Three new warning kinds exported but never constructed.** **File:** `mcp/server/src/warnings.ts:101-122`. **Impact:** `StateSaveFailedWarning`, `AutoWriteFailedWarning`, `OutputStyleDisabledWarning` are added to `EngineWarning` but no production code constructs them — selectPath/setPersonalization emit string arrays, verifySpot emits bare strings, requestHint emits its own discriminated `RequestHintError` shape. Same anti-pattern as cycle-3 R1-003 (registry warning declared with no producer). **Recommendation:** either wire the four error sites to construct typed `EngineWarning` values, or remove the three interfaces from the union. Pick one. **Reviewers:** R2 (singleton, agreement=1).

### Low

- **C002 — `spot.rungs` path resolution has dual-mode ambiguity (manifest path vs canonical fallback).** `requestHint.ts:175-189`. Fallback path is dead in production (fixture populates `rungs`). Either drop the fallback or document it. R1, R2 (agreement=2).
- **C004 — `advanceCursor` and `savedState` are imported/declared but never used.** `requestHint.ts:4,266`. Tighten tsconfig with `noUnusedLocals: true`. R2 (singleton).
- **C006 — Rung-3 casts `spot as SpotData` without nextSpot's stub-spot defensive check.** `requestHint.ts:240`. First curriculum shipping a stub spot crashes with TypeError. R2 (singleton).
- **C009 — Dead local `savedState`.** `requestHint.ts:266`. Same dead-code as C004. R4 (singleton).
- **C010 — Unused import `advanceCursor`.** `requestHint.ts:4`. Same as C004. R4 (singleton).
- **C013 — outputStyleOk gate runs `probeOutputStyle` but ignores its warnings.** `requestHint.ts:81-90`. Diagnostic-only; gate fail-closed is correct. R6 (singleton).
- **C014 — `mkdir` failure during snapshot is not wrapped as `AutoWriteError`.** `ladder.ts:184-186`. Diagnostic loss only. R1, R6 (agreement=2).
- **C015 — `runAutoWrite` reports snapshot byte count as `bytesWritten`, not target_file payload bytes.** `ladder.ts:237-242`. Naming/semantic ambiguity; field has no consumer today. R1, R4 (agreement=2).
- **C016 — Snapshot rotation timestamp doesn't reuse state.ts's collision-counter pattern.** `ladder.ts:189-205`. Sub-ms collision potential. R2 (singleton).
- **C017 — `runAutoWrite` race window between `fsPromises.access` and `fsPromises.rename`.** `ladder.ts:189-205`. TOCTOU; mostly cosmetic. R3 (singleton).
- **C018 — `runAutoWrite` ENOENT vs other read errors collapsed into `target-file-missing`.** `ladder.ts:137-145`. Misleading classification (EACCES → "missing"). R3 (singleton).
- **C019 — Redundant `let`-declarations for `startLine`/`endLine`.** `ladder.ts:150-161`. Style nit. R4 (singleton).
- **C020 — Snapshot rotation collides on millisecond-fast successive rung-3 calls (A7 append-only loose under racy timing).** `ladder.ts:189-216`. Test-side gap; impl quietly papers with rename overwrite. R5 (singleton).
- **C023 — `AutoWriteFailedWarning` uses `kind_detail`; breaks discriminated-union convention.** `warnings.ts:107-112`. *Originally disputed medium/info; re-derived low.* The renaming was a forced TS choice; the warning interface is currently dead code (no consumer). Cosmetic. R1, R2, R6 (agreement=3).
  *Verification note:* Disputed-flag resolved at low. Three reviewers agreed on the surface; the medium/medium/info severity spread reflects honest disagreement on a dead-code interface.
- **C025 — `Cycle5Warning` union types are defined but never imported.** `warnings.ts:101-122`. Same as C024. R4 (singleton).
- **C026 — `course-conductor.md` narrates `autoVerifyResult.advanced` as the success signal — contradicts contract.** `agents/course-conductor.md:52-55`. Should narrate `pass` (verify outcome) separately from `advanced` (cursor outcome). R2 (singleton).
- **C027 — Harness `verifyStub` closure variable widens silently after `withVerifyStub` call.** `scripts/e2e/harness.ts:111-157`. 30 lines duplicated; cannot independently stub verifySpot's first call vs rung-3's nested verifySpot. R2 (singleton).
- **C030 — `AbortSignal.timeout(5000)` on `checkManifest` does not narrow AbortError vs other rejection.** `probes/manifest.ts:15-24`. Diagnostic gap only. R3 (singleton).
- **C031 — `parseCommand` silently strips unbalanced double quotes.** `verify.ts:61-72`. Garbage-in/out for malformed quoting. R3 (singleton).
- **C032 — T-091 amendment widens shell-literal scope to basename match.** `tests/requestHint.test.ts:1104-1127`. Non-load-bearing in practice; T-148 covers the load-bearing tools/ regression. R5 (singleton).
- **C033 — A6 source-grep tests cover only requestHint.ts and ladder.ts.** `tests/requestHint.test.ts:996-1002`. Currently zero matches engine-wide; gap is theoretical. R5 (singleton).

### Info

- **C011 — `rungFilename` + `rungRelPath` dual-path lookup adds branching for an always-defined manifest field.** `requestHint.ts:64-68,174-189`. R4 (singleton).
- **C028 — harness E-004 traversal bypasses MCP transport for requestHint when verifyStub is set.** `scripts/e2e/harness.ts:130-157`. T-107 covers the wire boundary. R5 (singleton).
- **C029 — Harness `withDeployStub` mutates global `process.env` without isolation.** `scripts/e2e/harness.ts:211-227`. Test-only. R6 (singleton).
- **C034 — T-094 back-compat test does not exercise `auto_write_attempted: true` preservation on load.** `tests/requestHint.test.ts:1151-1172`. Theoretical gap. R5 (singleton).

## Test & coverage plan

- 400/401 tests pass; T-157 deferred to Phase F per cycle plan. Test posture is healthy; the only convergent failures during the green phase were test-author bugs (recursion in `vi.spyOn` forwards, hardcoded "exactly 6 tools" baselines, off-by-one in T-103) — caught and amended by the orchestrator without weakening load-bearing claims.
- Priority follow-up tests for cycle 6:
  1. **Path-traversal regression suite.** Rejection tests for malicious `spot.target_file`, `spot.id`, `rungs.*` (absolute paths, `..` segments, mixed). Test fixtures: `target_file: '/etc/passwd'`, `target_file: '../../../tmp/escape'`, `id: '../escape'`. Expect `AutoWriteError` (or new `target-path-outside-project` / `snapshot-path-invalid` kinds) — never a `writeFile` to the resolved location. Use a temp-projectRoot fixture and an `fsPromises.writeFile` spy.
  2. **Slug-regex validation in `validatePhases`.** Reject `phases.json` whose `phase.id` or `spot.id` matches `/[\/\\.]|^\.|^-/`. Mirror the strictness against `path.json`'s slug.
  3. **Personalization-missing pre-write check on rung 3** (C008). Fixture with auto.md containing `{{ unset_key }}`; expect a structured `personalization-missing` error kind, no `.bak` rotation, no overwrite.
  4. **Tighten T-091 to per-file allowlist** (C032). Replace basename match with `path.relative` against `['mcp/server/src/preflight.ts', 'mcp/server/src/probes/manifest.ts', 'mcp/server/src/tools/runPreflightProbe.ts']` so a hypothetical `tools/manifest.ts` regression is caught.
  5. **Widen A6 source-grep to `mcp/server/src/**/*.ts`** (C033). Currently zero matches in practice; the test does not enforce A6's stated scope.
  6. **Test for `verifyResult.error` propagation through rung-3** (C001). Stub `runVerifySpot` to return `{ pass: true, advanced: false, error: 'persist failed' }`; assert `requestHint`'s response surfaces the error string.

- Suggested test utilities: a `withTempProjectRoot()` helper that creates an isolated `<tmpdir>/proj/` and returns its absolute path, paired with an `assertNoWritesOutside(tmpRoot)` `fsPromises.writeFile` spy that fails the test if any write resolves outside the temp tree. This pattern would close the path-traversal coverage gap with a single utility used across the new regression suite.

## Build reproducibility & ops

- No dep/build/infra concerns rise to merge-block severity. `pnpm test` exit 0; tsconfig strict + NodeNext. Worker-2 chosen at 720 LOC vs 1820–2116 for workers 1/3/5 — the synthesis-notes flagged this as a candidate for a code-quality reference pass; not load-bearing for cycle 5.
- Ops checklist for cycle 6:
  - Add `noUnusedLocals: true` and `noUnusedImports: true` to `tsconfig.json` (C004/C009/C010 would self-flag).
  - Adopt the synthesis-notes' suggested protocol changes: pre-flight test-against-reference-impl in red, score test "tightness" before red passes. Five cycles in a row with 2-6 amendments per cycle is a clear signal.
  - Schema author owes a `.bak` rotation with monotonic counter (state.ts's `archiveCounter` pattern, C016) when next bumping `STATE_SCHEMA_VERSION`.

## Methodology

- 6 reviewers dispatched: R1 (correctness), R2 (design), R3 (error-handling), R4 (simplicity), R5 (tests-vs-impl), R6 (security).
- Coverage: ~12 source files × 6 reviewers; 34 clusters surfaced from 56 raw findings (≈40% dedup rate).
- Clusters before split: 34. After split: 34 (no mega-cluster splits required — C001/C003/C007 verified as genuinely distinct concerns at overlapping line ranges in requestHint.ts:262-296).
- Verification: 6 critical/high clusters re-derived against source (C001, C003, C007, C012, C021, C022) + 1 disputed cluster (C023). One disputed cluster (C001) was confirmed-as-medium; one (C023) was confirmed-as-low. The three security clusters (C012/C021/C022) were upgraded from high to critical based on threat-model verification: the contract explicitly anticipates third-party-authored curricula, and the schema validation gap at `phases.ts:175,194,215-234` forms a complete arbitrary-read+arbitrary-write primitive against any malicious phases.json.
- Cycle-pass.sh result: **FAIL** (3 critical clusters; 0 disputed-severity after consolidator adjudication).

## Blocking issues for orchestrator

The cycle does NOT pass. Three converging path-traversal findings (C012, C021, C022) at `mcp/server/src/{ladder.ts:133, ladder.ts:187-209, tools/requestHint.ts:187-189}` form a complete arbitrary-read + arbitrary-write primitive gated only on a third-party-authored `phases.json` and the learner saying "yes" to rung 3. The fix is local and well-scoped: add `path.resolve` + containment assertions at three call sites, plus a slug regex `/^[a-z0-9][a-z0-9_-]*$/` at `validatePhases` time for `phase.id` and `spot.id`. Recommended next step: spawn a corrective cycle 5.5 (or fold into cycle 6) with these three remediations + the C001 / C003 / C007 medium follow-ups in the rung-3 dispatch boundary.

---

## Remediation log (post-review)

After the gate fail on **3 critical path-traversal clusters** (C012/C021/C022 — `target_file`, `spot.id`, `auto_write_md` joined into paths with no containment check, against attacker-controlled `phases.json`), the orchestrator dispatched 3 round-2 implementer-workers (per user direction) tasked specifically with the bounded security fix.

**Pick: worker-1** (5 files, 87 LOC) — added a separate `mcp/server/src/pathSafety.ts` module exporting `containedPath(root, untrusted)` (uses `path.resolve` + at-or-under containment assertion, throws `PathTraversalError` on escape) and `PathTraversalError` class. Wired through:

- `mcp/server/src/ladder.ts:133` — `containedPath(projectRoot, spot.target_file!)` before reading the target file.
- `mcp/server/src/ladder.ts:187` — `containedPath(snapshotsDir, spot.id + '.bak')` before snapshot write. `spot.id` is also validated by the new schema regex (defense in depth).
- `mcp/server/src/tools/requestHint.ts:188-189` — `containedPath(slugContentRoot, rungRelPath)` before reading rung content.
- `mcp/server/src/schemas/phases.ts` — added `SLUG_REGEX = /^[a-z0-9][a-z0-9_-]*$/` validation for `phase.id` and `spot.id`; added `isValidRelPath` rejecting absolute paths and `..` segments for `target_file` and `rungs.{hint_md, reference_md, auto_write_md}`.
- `mcp/server/src/warnings.ts` — added `'path-traversal'` to `AutoWriteFailedWarning.kind_detail` union.

Path-traversal failures translate to a structured `auto-write-failed` warning with `kind_detail: 'path-traversal'` rather than crashing the MCP transport.

**Result:** 400/401 tests pass + 1 skipped (T-157, Phase F deferral). `cycle-pass.sh` exit 0 after marking C001/C023 disputed=false (consolidator's verification re-derived both to medium; not blocking).

## Carry-forward (non-blocking, for Phase F or future hardening)
- C001 (rung-3 silently drops verifySpot's pass-but-saveState-failed error string) — medium. Surface the error in the `autoVerifyResult` envelope.
- C003 (rung-3 dispatches full `runVerifySpot` tool handler instead of composing primitives) — medium. Refactor to extract the verify+advance core so requestHint can call it directly without going through MCP.
- C007 (rung-3's `runVerifySpot` call not wrapped in try/catch) — medium. Wrap to ensure unexpected throws surface as structured warnings.
- C006 (M002 saveState rejection in rung-3 leaves target_file overwritten with no rollback) — medium. Roll target_file back from snapshot on saveState failure.
- C023 (`AutoWriteFailedWarning.kind_detail` non-standard discriminator field) — low/medium. Rename to `kind` nested or flatten.
- C027 (orphan warning kinds in `EngineWarning` union with no production producer) — medium. Either wire the warnings into the dispatcher or remove from the union.
- Various low-severity simplicity findings in synthesis-notes — fold into a future cleanup pass.
