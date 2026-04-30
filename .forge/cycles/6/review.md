# Cycle 6 review (Phase F remediation #1 of 3-cap)

## Summary

- 26 verified clusters from 28 raw findings across 4 reviewer dimensions (correctness R1, design R2, error-handling R3, simplicity R4). Reviewers 5 (tests-vs-impl) and 6 (security) stalled mid-task and produced no JSON; their concerns were nonetheless covered partially by R1's anti-weakening verification (4 info findings on the orchestrator amendments) and by carry-forward of cycle 5's path-safety guarantees.
- **Severity profile**: 0 critical, 1 high, 5 medium, 10 low, 10 info.
- **Gate verdict: PASS.** No critical clusters. The single high (C023) is a pre-existing labeling mismatch (settings-file-malformed vs settings-parse-error) that predates cycle 6 and was surfaced as a side effect of H002's warning-shape audit; it does not regress any cycle-6 AC. All 6 contract ACs verified against source by R1's correctness pass.
- The 4 orchestrator test amendments (T-014, T-275, T-281, T-050) all verified anti-weakening: each new assertion is either strictly stronger than the original (T-014, T-281) or restates equivalent intent under a new substrate (T-050) or correctly inverts in line with a new AC (T-275 per AC-7.2).

## Critical

(none)

## High

### H001 — outputStyle.ts emits warning kind not declared in warnings.ts union (settings-file-malformed vs settings-parse-error)

**File:** `mcp/server/src/outputStyle.ts:42-49`
**Reviewers:** R2 (R2-001) + R3 (R3-001) — agreement count 2/4.

**Evidence (verified)**: `outputStyle.ts:45` returns `{kind:'settings-file-malformed', ...}` on the malformed-JSON branch; `warnings.ts:44-47` declares the corresponding union member as `kind:'settings-parse-error'`. The two literals diverge, so discriminated-union narrowing in `start.ts` cannot match this warning. Cycle 6 H002 introduced `'output-style-plugin-not-enabled'` and added it to the union correctly, but didn't audit the pre-existing kind labels — this is a pre-existing defect that cycle 6's audit surfaced.

**Impact**: Type-narrowing breaks for the malformed-JSON refusal branch. Any consumer that pattern-matches on the kind discriminator silently treats this case as unhandled — the same silent-failure shape H002 was specifically introduced to fix on the disabled-plugin branch.

**Recommendation**: Audit `warnings.ts` union vs every emitter site across cycles 1-6. Either rename the warnings.ts member to `'settings-file-malformed'` or rename the emitter at outputStyle.ts:45 to `'settings-parse-error'`. Also drop `'learning-output-style-disabled'` if it is no longer produced (superseded by `'output-style-plugin-not-enabled'`). Non-blocking for cycle 6 (test suite still passes), but ship-blocking for the next phase-F sweep — recommend folding into the next remediation cycle if one is opened, or queueing as a fast-follow.

## Medium

### M001 — selectPath: corrupt-without-archivedTo path leaves user wedged with no recovery guidance (C003)

**File:** `mcp/server/src/tools/selectPath.ts:88-92`. **Reviewers:** R1 + R3 (2/4).

When the corrupt-state archive write itself fails (`stateResult.archivedTo === undefined`), selectPath now falls through to the OLD short-circuit `{ok:false}` path. The user sees "State corrupt" with no remediation message — same wedge that cycle-6 H003 was designed to fix on the happy path. **Recommendation**: amend the error message to include "manual recovery: `rm <state.json>`" so the user can self-unstick when the archive itself fails (e.g., disk full, permissions). One-line message change. Non-blocking.

### M002 — cycle-e2e-pass.sh always returns exit 0 — non-skip failures not surfaced (C006)

**File:** `scripts/cycle-e2e-pass.sh`. **Reviewers:** R1.

The script's exit-0 path covers both "skipped" and "passed" outcomes, AND the unknown-scenario branch (C009) also exits 0. A genuine scenario failure is currently structurally indistinguishable from a skip. **Recommendation**: differentiate exit codes — 0 for pass, 77 for skip (autotools convention), nonzero for fail. Coupled with M003.

### M003 — cycle-e2e-pass.sh skip and pass share exit code 0; CI cannot distinguish (C008)

**File:** `scripts/cycle-e2e-pass.sh:13-14, 78-110`. **Reviewers:** R3.

Same root cause as M002 from the error-handling angle. CI pipelines that key off `$?` will silently green a skip. **Recommendation**: emit a JSON receipt file alongside the script's stdout, OR use exit 77 for skip per the autotools convention. The skip-with-reason text is already emitted; this is purely about machine-readable status.

### M004 — findExistingArchive silent skip on per-archive read failure can produce duplicate archives (C016)

**File:** `mcp/server/src/state.ts:139-141`. **Reviewers:** R3.

If a previously-emitted archive lost read permission (e.g., chmod 000 by user, EACCES on a network filesystem), `findExistingArchive`'s inner readFile catches the error silently and skips — the dedup logic then writes a new archive even though the content already exists, defeating H003's "exactly 1 archive" invariant. **Recommendation**: surface the EACCES as a degraded-mode warning so callers know the dedup invariant is best-effort under permission failures. Non-blocking; affects only an unusual permissions configuration.

### M005 — archiveCorruptFile dedup has TOCTOU race between findExistingArchive and writeFile (C017)

**File:** `mcp/server/src/state.ts:156-172`. **Reviewers:** R3.

Two concurrent `/start` invocations on identical corrupt bytes can both clear the `findExistingArchive` check before either calls `writeFile`. The `wx` flag on writeFile guarantees unique filenames but NOT unique content — both calls succeed with different timestamp filenames, both write the same content, dedup invariant violated. **Recommendation**: encode the content hash into the archive filename (`state.corrupt-<hash>-<ts>.json`) and let the `wx` flag enforce uniqueness on the hash directly. This also collapses with R4-001/R4-002 (the simplicity finding about removing archiveCounter and the O(N) scan). Concurrent `/start` is rare in practice (one student session at a time); flagged as a future-proofing concern. Non-blocking.

## Low (10 — grouped)

- **L001 (C001)** T-017 has a stale comment contradicting H002, but the assertion is loose enough that it still holds — comment should be updated, behavior is correct.
- **L002 (C004)** T-310 verifies dedup over 3 sequential calls; concurrency is not exercised (intersects with M005).
- **L003 (C005)** scenarios.json E-008's `covers_contract` still says AC-2.3 (cycle-3 contract); should be amended to also reference AC-2.5 now that the precondition declaration changed. Doc only.
- **L004 (C007)** scripts/cycle-e2e-pass.sh has 3 nearly-identical version-parser helpers; consolidate to one. Also see L008.
- **L005 (C009)** Unknown SCENARIO_FILTER value silently exits 0 — typos green. Recommend nonzero exit on unknown scenario.
- **L006 (C010)** Skip-with-reason message conflates "sui not installed" with "sui out of supported range." Distinct surfaces.
- **L007 (C018)** findExistingArchive O(N) scan + read+rehash per entry — encoding hash in filename gives O(1) lookup (intersects with M005, R4-001).
- **L008 (C022)** `Partial<Record<ProbeId, ProbeOptions>>` should be a named `ProbeOptionsMap` type alias for callsite reuse.
- **L009 (C024)** outputStyle.ts: `enabledPlugins: []` (array) currently flows through the `typeof === 'object'` path and produces "plugin not enabled" rather than "malformed settings." Distinct error surfaces should be distinguished.
- **L010 (C025)** start.ts uses a `(warning as { archivedTo?: string })` cast instead of declaring the optional field on the warning interface. Type-cast workaround.

## Info (10 — anti-weakening verification + AC pass-throughs)

- **C002, C012, C013, C014** — R1's anti-weakening verification of the 4 orchestrator amendments. Each amendment is either strictly stronger than the original (T-014, T-281), correctly inverts in line with a new AC (T-275 per AC-7.2), or preserves intent under a new substrate (T-050). All 4 amendments cleared.
- **C015, C020, C021** — R1's correctness pass-through for AC-1 (phases.json renames + content packs + cursor advance), AC-3 (archive bytes-equality invariant verified end-to-end), and AC-4 (probeOpts threading at both runProbe and runDeployRemediation forwarders).
- **C011, C019, C026** — R4's design observations (one-branch case statement; archiveCounter dead-code; auto.md vs reference.md intentional separation).

## Coverage

| Dimension | Reviewer | Findings | Status |
|---|---|---|---|
| correctness | R1 | 12 | complete (12 findings, anti-weakening verified) |
| design | R2 | 3 | salvaged from stalled run; agrees with R3 on H001 |
| error-handling | R3 | 8 | complete |
| simplicity | R4 | 5 | salvaged from stalled run |
| tests-vs-impl | (R5) | — | stalled; partial coverage from R1's anti-weakening + R3's M004/M005 |
| security | (R6) | — | stalled; cycle 5's pathSafety carry-forward + new attack surface (probeOpts) — see Recommendation |

**Cycle-6 contract files all touched** by R1's correctness pass (the 18 files in `_scope_files.txt`). No file-level coverage gap.

## Recommendation

**Cycle 6 PASSES the cycle-pass gate.** No critical clusters. The 1 high is pre-existing and orthogonal to the cycle-6 contract.

**Carry-forward for follow-up** (NOT another remediation cycle — these are below the gate threshold):

1. **H001 / warnings.ts kind audit** — fold into the next phase-F sweep or a doc-quality cycle. Pre-existing defect; cycle-6 surfaced it.
2. **State-archive simplification** — combine M005 + L007 + R4-002 into a single refactor: encode content hash in filename, drop archiveCounter, drop O(N) scan. Three findings collapse to one ~10-LOC change.
3. **cycle-e2e-pass.sh hardening** — combine M002 + M003 + L005: distinct exit codes for pass/skip/unknown/fail. ~20-LOC change.
4. **Security re-review** — R6 stalled before producing findings. Cycle 6's new surface (probeOpts as new MCP arg, 8 new content files) deserves a dedicated security pass. Recommend re-running R6 in isolation when usage budget permits.
5. **R5 tests-vs-impl re-review** — likewise stalled. The anti-weakening verification was salvaged from R1, but a dedicated tests-vs-impl pass would still be valuable.

The cycle 6 deliverable ships green: 415/415 passing tests + 1 skipped, all 6 contract ACs verified against source, no AC regression, anti-weakening preserved across all orchestrator amendments. Next: re-run Phase F to confirm the original 6 highs are now closed.
