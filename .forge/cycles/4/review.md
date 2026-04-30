# Cycle 4 Review

## Executive summary

Cycle 4 lands the four new phase-loop tools, the verify adapter, the personalization machinery, and the path-1 manifest with all 113 cycle-4 tests green (292/293 pass + 1 deferred to Phase F). The contract is **substantively delivered** but **does not pass the cycle gate** as written: a single confirmed `high` cluster — verify.ts re-introduces the exact module-level mutable spawn-test seam that A13/M005 retired from preflight.ts in this very cycle (six independent reviewers converged on it, four rated `high`, two `medium`). One additional dispute (registry warning union over-broadens to 11 kinds vs 8 specified — A12 violation) downgrades to `medium` after re-derivation. Top risks for cycle 5: the `_verifyOverride` seam (architectural regression on the tools the cycle just shipped), the dual-mode `validatePhases` softening A2 ("hasAnyNewField" branch), and the `__done__` string sentinel in cursor state that persists to disk.

## Severity counts

| Severity | Count |
|---|---|
| critical | 0 |
| high     | 1 |
| medium   | 8 |
| low      | 21 |
| info     | 3 |

Disputed-after-verification: 0 (C001 and C002 merged to H001 confirmed high; C006 downgraded high→medium with reason recorded).

## Findings (by severity)

### Critical
(none)

### High

- **H001** — verify.ts re-introduces module-level mutable spawn-test seam (M005 anti-pattern A13 just retired). **File:** `mcp/server/src/verify.ts:35-67` (and consumers `mcp/server/src/tools/verifySpot.ts:58`, `scripts/e2e/harness.ts:164-168`). **Impact:** the cycle's load-bearing simplicity invariant — "no global mutable test seam on the production import surface" — is violated on the very file the four new tools depend on. The `setVerifyOverride`/`_verifyOverride` pair short-circuits `runVerification` *before* the per-call `opts.spawn` seam is consulted (verify.ts:65-67), and `verifySpot.ts:58` calls `runVerification(verSpec, projectRoot)` with no `opts` argument — making the contract-specified per-call seam unreachable from production callers. Test-pollution adversary path: a test installs the override, throws between install and `await harness.shutdown()`, the override leaks into the next test run; the next caller of `runVerification` (production or test) silently receives the stub. Cycle 5+ contributors will reasonably read `verify.ts` as endorsing the pattern and propagate it to the next three verification adapters. **Recommendation:** delete `setVerifyOverride` / `_verifyOverride` / the early-return at lines 65-67; thread `VerifyOptions` through `verifySpot`'s tool boundary (parallel to how `runPreflightProbe` accepts `ProbeOptions`); migrate `withVerifyStub` to install through opts at the call site or via a harness-internal map keyed on a stable id. The `opts.spawn` infrastructure already exists at the runVerification signature — only the override branch and the tool-side wiring need to change. Maps to A13 verbatim. **Reviewers:** R1, R2, R3, R4, R5, R6 (agreement=6 across two clusters merged; severities split high×4 / medium×2). *Verification note:* see `_verification_notes.md` § C001+C002.

### Medium

- **M001** — RegistryWarning union carries 11 kinds vs 8 specified by A12; three are dead-arm aliases. **File:** `mcp/server/src/warnings.ts:7-18`. **Impact:** A12 explicitly mandates exactly the eight kinds `registry.ts` emits. Grep across `registry.ts` confirms producers for the eight canonical kinds only; `paths-missing`, `paths-empty`, `path-malformed` have zero producers anywhere in `mcp/server/src/`. Code branching `if (w.kind === 'paths-missing')` typechecks (the type lies) but is dead at runtime. T-254 only positively asserts the eight required kinds appear; it does not assert closure at exactly eight. Same shape of mismatch cycle 3's M002 carry-forward addressed for the loose `kind: string` form — only now the orphans are encoded as named literal members. **Recommendation:** delete the three alias members; if any consumer was relying on them (none in cycle-4 source) update it to the canonical kind. Re-confirm via T-254 amended to assert the union has exactly eight members. **Reviewers:** R1, R2, R4 (agreement=3, severities high/medium/low — re-derived to medium: contract violation, no user-visible runtime bug). *Verification note:* see `_verification_notes.md` § C006.

- **M002** — advanceCursor uses `'__done__'` string sentinel; persists into on-disk state.json. **File:** `mcp/server/src/phaseEngine.ts:103-107`. **Impact:** `verifySpot.ts:63` saves the sentinel-bearing state to disk; a phases.json that names a phase or spot `'__done__'` (low-probability but legitimate slug) silently re-activates a completed cursor. Cross-cycle resumption logic in cycle 5+ must learn the convention. **Recommendation:** widen `Cursor` to a discriminated union `{ phase_id: string; spot_id: string } | { done: true }`, OR add a top-level `state.completed: boolean` flag. The schema bump can ride the cycle-2 C008 carry-forward (state-shape-invalid kind) when STATE_SCHEMA_VERSION next bumps. **Reviewers:** R2, R4 (agreement=2).

- **M003** — T-286 spawn-zero assertion is tautological under setVerifyOverride. **File:** `tests/harness.lesson.test.ts:406-442`. **Impact:** withVerifyStub installs the module-level override, which short-circuits before the compile spawn site ever runs. "Spawn was not called" is true by construction; if a future refactor moved the spawn site before the override check, T-286 still passes silently. Coverage of "compile path does not spawn when stubbed via opts.spawn" is therefore not actually exercised. **Recommendation:** resolves automatically when H001 is fixed; if H001 is deferred, split T-286 into two cases: one with override active (current), one with no override and a no-op `opts.spawn` recorder. **Reviewers:** R5 (singleton; closely tied to H001).

- **M004** — saveState rejection in selectPath / setPersonalization / verifySpot surfaces as opaque MCP transport error. **Files:** `mcp/server/src/tools/verifySpot.ts:63`, `selectPath.ts:129`, `setPersonalization.ts:104`. **Impact:** an `ENOSPC` / `EACCES` / Windows antivirus lock during `saveState` rejects with the raw fs error and the MCP server turns it into the cryptic "MCP error ..." text seen in `red.log:74-77`. In the verifySpot pass branch this is the worst case — verification ran (potentially against a real `pnpm build`), the user "passed", but the cursor never advanced and the skill receives no structured signal. **Recommendation:** wrap each `saveState` in try/catch; for verifySpot return `{ pass: true, advanced: false, output, error: 'verification passed but state persist failed: ...' }`; for selectPath/setPersonalization return `{ ok: false, errors: [...] }`. **Reviewers:** R3 (singleton; split out of C009 — the other half of C009 merged into H001).

- **M005** — saveState close() error swallows the original sync() error. **File:** `mcp/server/src/state.ts:145-150`. **Impact:** the durability sequence `try { handle.sync() } finally { handle.close() }` runs `close()` unconditionally; if `close()` itself rejects (EBADF after sync invalidated the handle, or any I/O error), the close error replaces the sync error and the diagnostic surface lies about which operation failed. Plus on persistent failures, the `state.tmp-<ts>-<rand>.json` file is never unlinked — orphan tmp files accumulate. **Recommendation:** capture the sync error explicitly (`let syncErr; try { sync } catch ...`); close in a separate try; throw the sync error in preference; unlink the tmp file on any failure path before re-throwing. **Reviewers:** R3 (singleton).

- **M006** — validatePhases dual-mode (`hasAnyNewField` branch) softens A2's tightening. **File:** `mcp/server/src/schemas/phases.ts:180-243`. **Impact:** the validator only enforces all-four-fields (target_file/target_range/prompt/verification) when at least one of them is present; otherwise it accepts a stub spot with just `{id, title?}`. nextSpot.ts then carries a runtime guard re-checking the same four fields and emits a separate "Spot is a stub spot ..." error. The schema is no longer a strong invariant: a manifest can ship a spot the engine cannot serve, and the failure surfaces at nextSpot/verifySpot call time as a runtime error string instead of at registry-scan time. Cycle 5 will populate phases 2/3 and may forget to re-tighten. **Recommendation:** introduce an explicit `placeholder: true` flag on the spot that schema and runtime guards both consult, OR migrate phases 2/3 to full-spec spots with `verification.command: 'echo TBD; exit 1'` so the dual-mode disappears. **Reviewers:** R2 (singleton, but contract-direct).

- **M007** — validatePersonalizationValues throws TypeError on `null` / non-object values input. **File:** `mcp/server/src/personalization.ts:75`. **Impact:** `Object.keys(null)` throws synchronously; setPersonalization passes the wire-deserialized `values` straight in with no input guard. A malformed MCP client sending `{ values: null }` (JSON-valid, crosses the wire) gets an opaque transport error instead of `{ ok: false, errors: ['values must be an object'] }`. Same hazard for arrays and primitives. **Recommendation:** add a top-of-function guard `if (typeof values !== 'object' || values === null || Array.isArray(values)) return { ok: false, errors: ['values must be an object'] };` and an equivalent guard at setPersonalization's entry. **Reviewers:** R3 (singleton).

- **M008** — T-224 SHA-256 byte-equality skips on any machine without the upstream checkout. **File:** `tests/phaseEngine.test.ts:622-636`. **Impact:** `it.skipIf(!fs.existsSync(REFERENCE_SOURCE))` guards on `~/workspace/deepbook-sandbox-evaluation-apps/...`; on CI and any reviewer machine the test silently skips, and the fallback T-225 only checks size > 0. The pre-computed `REFERENCE_APP_TSX_SHA256_AT_AUTHOR` constant exists but is never compared against the bundled `paths/01-orderbook-viewer/reference/App.tsx` unconditionally. Contract AC-A9 byte-for-byte invariant is therefore unverifiable in CI — only the original author can ever fail this test. **Recommendation:** compare the bundled file's SHA-256 against `REFERENCE_APP_TSX_SHA256_AT_AUTHOR` unconditionally; reserve the source-existence skip ONLY for the optional second branch that re-hashes the upstream copy on the author's machine. **Reviewers:** R5 (singleton).

### Low

21 low-severity findings, grouped by area:

**verify.ts adapter robustness (latent in cycle 4 because only `pnpm build` ships):**
- C003 — spawn-error catch returns bare error code as `output` (loses cmd/cwd context).
- C004 — `command.split(' ')` breaks on quoted args / multi-space / shell metacharacters.
- C005 — same split issue framed under security (no shell:true, so not exploitable; brittle parser).
- C007 — verifySpot has no try/catch around `runVerification`; `VerificationModeUnsupportedError` for cycle-5 modes will surface as opaque MCP transport error.
- C008 — `as unknown as VerificationSpec` cast launders the type system; downstream of M006.

**selectPath / setPersonalization design smells:**
- C010 — selectPath silently wipes cursor/ladder on re-selection of the same slug (no warning, no preserve-existing branch).
- C011 / C015 / C023 — buildPrompts loop in selectPath duplicates declaredOptions construction in setPersonalization, including the hardcoded fallback ranges; OptionDesc parallel shape exists only to support test-fixture ergonomics.
- C012 — selectPath/setPersonalization re-read and re-validate path.json after scanRegistry already did; PathInfo drops `personalization_ranges` and the tools work around it.
- C013 — new tools have no outputStyleOk gate (contract A11(c) accepts protocol-only enforcement; reviewer rated low).
- C014 / C026 — four tools repeat the same loadState short-circuit preamble (`stateResult.kind === 'corrupt' / 'schema-mismatch' / 'absent'`); LoadPhasesError's typed slug+reason fields are stringified by every caller.

**phaseEngine error-handling and slug surface:**
- C018 — LoadPhasesError carries an unstructured reason blob; the `phase-engine-phases-load-failed` warning kind exists but tools don't construct it.
- C019 — loadPhases performs no slug sanitization; nextSpot/verifySpot pass `state.selected_path` straight to `path.join` (defense-in-depth concern under self-attack trust model).

**state.ts schema seams:**
- C020 — `state.selected_path` is required-string but treated as optional everywhere via `!stateResult.state.selected_path`; empty-string vs absent are wire-equivalent failure modes spelled differently.
- C021 — Personalization OptionDesc declared in two parallel shapes with a normalize step (~25 LOC overhead).

**Test-vs-impl shortcuts (singletons from R5; the cycle-4 amendments record explains some):**
- C030 — T-291 only asserts `{{ pool_subset }}` placeholder presence in hint.md, never exercises substitution against the rung payload.
- C031 — T-254 RegistryWarning union check is string-grep over file bytes; would pass with kinds buried in comments.
- C032 — T-258 phase-engine warning kinds tested by string-grep only; payload shape (`slug`, `reason`, `errors[]`, `mode`) not asserted.
- C033 — substitutePromptOnly internal-assertion guard test the contract specified is missing; T-214/T-215 are static greps with a 160-char window heuristic.
- C034 — T-267 round-trip seeds `auto_write_attempted: false` so the loader's normalize-absent-to-false branch makes save-then-load deep-equal pass even if saveState dropped the field.
- C035 — T-231 "integration with state.ts" is fully-mocked vi.mock; not an integration test.

### Info

- C024 — substitutePromptOnly's `Object.prototype.hasOwnProperty.call` guard is correct against prototype pollution. Worth retaining against future "simplifications."
- C027 — nextSpot returns `verification.command` verbatim into the LLM context; not a current exposure but worth documenting for future curriculum authors.
- C036 — AC-1.3 / A11(a) `kind: 'shell'` invariant / A11(b)/A21 slug-literal invariant / A13 `setSpawnOverride` symbol-removal invariant all hold via grep across `mcp/server/src/`. Note: A13's *intent* is partially undermined by H001 (parallel anti-pattern under a different name).

## Test & coverage plan

- 113 cycle-4 tests green (cycle 1's 44 + cycle 2's 53 + cycle 3's 82 + cycle 4's 113 = 292 + 1 skipped Phase F = 293 total). The orchestrator amendments recorded in `green/synthesis-notes.md` (T-061 reduction, T-272 scope narrowing, T-286 spy-mode mock, A15 fixture/helper updates, the trivial state.ts comment fix) were each verified against the audit trail; none weakened intent at the suite level. T-267 alone weakened (covered by C034 / M-cluster aggregate; T-269 + T-271 still pin the round-trip).
- Concrete priority-ordered list of test scenarios for follow-up:
  1. **Verify-seam regression test** (after H001 fix) — install `opts.spawn` recorder via the new tool boundary; assert `runVerification` actually invokes `opts.spawn` exactly once with `(cmd, args, { cwd: projectRoot })`. Replaces the tautological T-286.
  2. **Reference snapshot SHA-256 unconditional** (M008) — bundled `paths/01-orderbook-viewer/reference/App.tsx` hashed and compared against `REFERENCE_APP_TSX_SHA256_AT_AUTHOR` unconditionally. Skip-if-source-absent only for the optional cross-check branch.
  3. **RegistryWarning union closure** (M001) — at compile time via `Equal<RegistryWarning, KindLiteral8Union>`, plus a producer-coverage test that asserts `registry.ts`'s emit sites cover all and only the eight canonical kinds.
  4. **`null` / non-object values guard** (M007) — direct vitest case for `setPersonalization({ values: null })` returning `{ ok: false, errors: ['values must be an object'] }` rather than throwing.
  5. **saveState durability error precedence** (M005) — fault-injected `handle.sync()` reject + `handle.close()` reject; assert the sync error wins and the tmp file is unlinked.
  6. **Cursor-done sentinel hardening** (M002) — phases.json fixture with phase id `'__done__'`; assert the engine does not silently re-activate completed state.
  7. **substitutePromptOnly runtime-sentinel guard** (C033) — small refactor: optional `field?: string` debug arg the function rejects; restores AC-6.3 boundary at the unit level.
  8. **dual-mode validatePhases tightening** (M006) — fixture with stub spot + assertion that `validatePhases` rejects it pre-runtime.
- Suggested test utilities and assertion targets:
  - Add a `withSelectedPath<T>(projectRoot, fn)` helper in `tools/_phaseToolBase.ts` (recommended by C014/C026) so each new tool's preamble collapses to one line.
  - Add a `buildDeclaredOptions(pathData)` helper in `personalization.ts` (recommended by C011/C015) so personalization range fallbacks live in exactly one place.
  - Type-level helper `Equal<A, B>` in `tests/_typeEqual.ts` to make union-closure assertions compile-time first-class.

## Build reproducibility & ops

No dep/build issues rise to merge-block severity. Concrete ops checklist for cycle 5 / hardening:

- Resolve H001 before cycle 5 begins so the new verification adapters (`test`/`simulate`/`custom`) inherit the right pattern from day one. The fix is purely subtractive on `verify.ts` (delete 18 lines: type alias + module-level `let` + `setVerifyOverride` + early-return) plus additive on `verifySpot.ts` (one optional `opts` arg) and `harness.ts` (rewire `withVerifyStub` to install via opts).
- M001 fix is a 3-line deletion in `warnings.ts:9,11,14` plus an amended T-254 to assert union closure.
- Carry-forward debt still deferred (cycle-3 review): R4-004 (defaultSpawn duplication across docker/pnpm/suiCli probes), R3-005 (fetch timeout in checkManifest), C008 from cycle 2 (state-shape-invalid kind — would land alongside M002 at the next STATE_SCHEMA_VERSION bump).
- Comment-text tripwire (synthesis-notes carry-forward): future state.ts edits should avoid the literal substring `fsyncSync` in comments — T-265 would re-fire. The cycle-4 fix rephrased the comment but the trap remains.
- The `setVerifyOverride` symbol is exported from `verify.ts` but **not** re-exported from `mcp/server/src/index.ts` (verified: only `McpServer`/`Client`/`InMemoryTransport`/`registerTools`/`*` from the server core are public). The blast radius for H001's "global mutable surface" claim is therefore in-process imports only — but every test+harness file in this repo imports the seam directly, so the test-pollution path is fully realized.

## Methodology

- 6 reviewers dispatched: R1 (correctness), R2 (design), R3 (error-handling), R4 (simplicity), R5 (tests-vs-impl), R6 (security). Six independent reviewers converged on H001 across two pre-merge clusters (C001+C002) — strong signal.
- Coverage: 14 cycle-4 source files × 6 reviewers; flag rate ≈ 36 clusters / 6 reviewers ≈ 6 findings per reviewer, in line with prior cycles.
- Clusters before split: 36 from `cycle-consolidate.mjs`. After consolidator merge of C001+C002 into H001 and the C009 split (opts.spawn half → H001, saveState half → M004): **34 distinct clusters in this report**, of which 1 high + 8 medium + 21 low + 3 info = 33 (the C009 opts.spawn half is absorbed into H001 and not double-counted; the table reflects 1+8+21+3=33 — minor discrepancy because cluster_ids are kept stable for traceability, see `_verification_notes.md` for the merge map).
- Verification: 6 critical/high/disputed clusters re-derived against source — C001, C002, C006, C009, C017, C022. Two singletons re-derived (C022, C028) due to high contract relevance. All findings traced back to file:line; no findings rejected.
- `cycle-pass.sh` result: **FAIL** (1 confirmed `high`).


---

## Remediation log (post-review)

After the gate fail on three disputed clusters (C001/C002 high — verify.ts re-introduces the M005 setSpawnOverride anti-pattern; C006 medium — RegistryWarning union has 3 zombie alias kinds), the orchestrator remediated:

**C001 + C002 (high — 6/6 reviewer convergence on the verify-override seam)** — Removed `setVerifyOverride` and `_verifyOverride` from `mcp/server/src/verify.ts` (~15 LOC subtractive). Extended `runVerifySpot` (in `mcp/server/src/tools/verifySpot.ts`) with a per-call `opts: { spawn?: VerifySpawnFn }` parameter that threads through to `runVerification`. Rewrote `scripts/e2e/harness.ts` `withVerifyStub({pass, output})` to store stub state on the harness instance (closure-captured `verifyStub` variable) rather than installing a module-level override, and to intercept `callTool('verifySpot', ...)` calls — the harness builds a synchronous `VerifySpawnFn` from `{pass, output}` and calls `runVerifySpot` directly with it threaded through `opts.spawn`. The production-side `verify.ts` exposes zero test seam; the test-injection concern lives entirely in test infrastructure (the harness, consumed only by tests). T-283 cold-start E-001 still passes because the harness intercept calls the full `runVerifySpot` flow (state load + spot lookup + verification + cursor advance + state save) rather than short-circuiting. T-260 grep clean (the literal `setSpawnOverride` no longer appears anywhere in `mcp/server/src/`).

**C006 (medium → resolved)** — Removed three orphan kinds from `RegistryWarning` union in `mcp/server/src/warnings.ts`: `paths-missing`, `paths-empty`, `path-malformed`. These had been added to satisfy a literal-substring grep but contradicted A12's "exactly the eight kinds emitted by registry.ts" promise — no producer ever surfaced them. The union now has exactly the 8 kinds registry.ts emits (`no-paths-dir`, `empty-paths-dir`, `missing-path-json`, `malformed-path-json`, `invalid-path-json`, `missing-phases-json`, `malformed-phases-json`, `invalid-phases-json`).

**Result:** 292/293 unit tests pass + 1 skipped (T-157 Phase F deferral). `cycle-pass.sh` exits 0. Cycle 4 advances.

## Architectural lesson recorded

The cycle-4 review consolidated a useful general principle: **test seams belong on the test side of the production/test boundary, not on the production import surface**. Cycle 3 introduced this rule in concrete form via M005 (per-call `ProbeOptions.spawn`); cycle 4 contract bundled it as A13. Worker-4's verify.ts shipped a renamed-but-isomorphic violation of the same principle, caught by 6/6 reviewers — strong validation of the parallel-reviewer pattern.

The consolidator's recommended fix mirrors the runPreflightProbe pattern's *intent* (per-call opts) rather than its *current implementation* (which itself has a renamed module-level Map via the harness's own `probeSpawnStubs`). For runPreflightProbe specifically, the harness intercepts `callTool('runPreflightProbe', ...)` and routes through `runProbe(probeId, { spawn })` — the same harness-boundary intercept pattern we now apply to `verifySpot`. Both routes preserve the principle: the production tool handler doesn't know it's being stubbed, and no module-level mutable seam ships in the production binary.

## Carry-forward (non-blocking, for cycle 5 / Phase F)
- M001 **`runVerifySpot` does not catch `VerificationModeUnsupportedError`** (R1-003 / R3-010) — when cycle 5 wires the `test/simulate/custom` adapters or path content references one, the throw bubbles out of the MCP handler unhandled. Cycle 5's first task should be wrapping the dispatch in try/catch and surfacing a `verification-mode-unsupported` warning.
- M002 **`saveState` rejection unhandled in selectPath/setPersonalization/verifySpot** (R3-005) — disk-full / permission-denied during state write surfaces as a cryptic SDK transport error. Wrap saveState calls in try/catch and surface `state-save-failed` warnings.
- L001 **command.split(' ')** in compile adapter (R1-004 / R6-002) — naive splitting breaks on quoted args and paths with spaces. Curriculum authors will hit it when phase 1's build_command becomes anything beyond `pnpm build`.
- L002 **A11(c) AC-1.3 carry-forward not gated on the new tools** (R6-004) — `selectPath/setPersonalization/nextSpot/verifySpot` write state without checking outputStyleOk first. Cycle-5 should add an outputStyleOk gate at the registerTools layer or in each tool's preamble.
- Tool preamble duplication (R2-006 / R4-006) — extract a `loadStateAndPath(projectRoot)` helper that all four tools share.
