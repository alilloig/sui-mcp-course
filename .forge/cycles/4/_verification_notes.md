# Cycle 4 — Consolidator verification notes

Audit trail for clusters re-derived against source. Other clusters were passed through with light review.

## C001 + C002 — verify.ts re-introduces module-level mutable spawn-test seam (MERGED)

Both clusters cover the same finding. C001 (R1, R4, R6) frames it as correctness/security; C002 (R2, R3, R5) frames it as design/error-handling/tests-vs-impl. Six independent reviewers converged on the same line range (verify.ts:35–67). Merging into one report cluster (**H001**) is the right call — they are not distinct concerns.

**Source verified.** `mcp/server/src/verify.ts` lines 43–52 declare:
```
let _verifyOverride: VerifyOverrideFn | undefined;
export function setVerifyOverride(fn: VerifyOverrideFn): () => void {
  _verifyOverride = fn;
  return () => {
    if (_verifyOverride === fn) {
      _verifyOverride = undefined;
    }
  };
}
```
And lines 64–67 short-circuit `runVerification` on the override BEFORE `opts.spawn` is consulted (line 74). `verifySpot.ts:58` calls `runVerification(verSpec, projectRoot)` with no `opts` argument, so the per-call seam is unreachable from the production tool path; only the harness can drive `opts.spawn`, and even the harness does not — `scripts/e2e/harness.ts:168` uses `setVerifyOverride`. The contract A13 (M005 carry-forward) explicitly retired this exact pattern from `preflight.ts` in the same cycle.

**Severity re-derivation.** Severities split between high (R2-001, R3-003, R4-001, R6-001) and medium (R1-001, R5-002). The security-framed claim (R6-001: "any caller that imports verify.js can hijack ALL subsequent verification dispatches") is technically accurate but the threat model is bounded — `setVerifyOverride` is exported from `verify.ts` but **not** re-exported from `mcp/server/src/index.ts` (verified: only `McpServer`/`Client`/`InMemoryTransport`/`registerTools` are re-exported). The realistic adversary is test pollution + cycle-5 contributors copy-pasting the seam. Adversary path concrete: a test installs `setVerifyOverride(passThroughStub)`, throws between install and `await harness.shutdown()`, the override leaks into the next test or — worse — into subsequent production calls in the same Node process if the harness is co-located with prod code, returning fake `pass: true` for any verifySpot. **Confirmed: high.** Maps to A13 intent violation directly; the contract's load-bearing simplicity claim ("no global mutable test seam in production import surface") is undone on the very file the new tools depend on.

**Verdict: confirm high. Single merged cluster H001.** Recommendation is to thread `VerifyOptions` through `verifySpot` (one extra optional arg through the tool boundary, parallel to how `runPreflightProbe` accepts ProbeOptions) and have the harness install via opts at call time. The infrastructure (`opts?.spawn` in `runVerification` signature) is already there — only the override branch and the tool-side wiring need to change.

## C006 — RegistryWarning union carries 11 kinds vs 8 specified (3 dead alias members)

Three reviewers converged. **Source verified.** `warnings.ts:7–18` lists 11 union members; `registry.ts` grep confirms only 8 producers (lines 31, 46, 63, 76, 88, 99, 115, 127, 137). The three alias kinds (`paths-missing`, `paths-empty`, `path-malformed`) have zero producers anywhere in `mcp/server/src/`. The contract A12 says "exactly the eight kinds registry.ts emits" — explicit. Tests presence/absence: T-254 only asserts the 8 required kinds appear (positive grep), it does not assert closure.

**Severity re-derivation.** Severities split between high (R2-002), medium (R1-002), low (R4-002). This is a type-correctness violation against an explicit contract acceptance criterion (A12), but the dead arms are inert at runtime — switch statements over `kind` against the alias values would compile but never fire. No user-visible impact in cycle 4. The contract's "true discriminated union" promise is undermined but not broken: it is still discriminated, just over-broad.

**Verdict: downgrade to medium.** This is a contract violation worth surfacing prominently but it does not ship a bug to users. It is exactly the same shape as cycle 3's R1-003/R2-001/M002 (loose type encoding mismatched producers), which earned `medium` carry-forward severity. Single cluster M001.

## C017 — advanceCursor uses '__done__' sentinel string for done marker

Two reviewers (R2, R4). **Source verified.** `phaseEngine.ts:103–107`:
```
} else {
  // Past the last spot of the last phase — use a sentinel that getCurrentSpot won't find
  newPhaseId = '__done__';
  newSpotId = '__done__';
}
```
Persisted to disk via `verifySpot.ts:63` `saveState(projectRoot, advancedState)`. Schema accepts any string for cursor.{phase_id,spot_id}. A path manifest authoring `id: '__done__'` for a phase or spot would silently activate completed cursor (low-probability but real). Contract did not require a structured `done` representation, but reviewers correctly flag the schema-to-engine coupling via magic string.

**Verdict: confirm medium.** Defer remediation to cycle 5 alongside the other state-shape work. Single cluster M002.

## C028 — T-286 spawn-zero assertion is tautological under setVerifyOverride

Singleton (R5-001) but tightly coupled to H001. **Source verified.** `verify.ts:65-67` short-circuits before the compile spawn site; `withVerifyStub` installs the override; T-286 asserts spawn was not called. The assertion is true by construction — the override branch executes first and the spawn site is unreachable. Per R5: "If a future refactor moves the compile spawn site BEFORE the override check, T-286 still passes silently."

**Verdict: confirm medium.** This is a direct downstream consequence of H001; if H001 is fixed (drop the override seam, route via `opts.spawn`), T-286 becomes meaningful automatically. Single cluster M003.

## C022 — validatePersonalizationValues throws on null/non-object values input

Singleton (R3-006). **Source verified.** `personalization.ts:75` `for (const key of Object.keys(values))`. With `values: null` from a malformed MCP client, `Object.keys(null)` throws TypeError synchronously. `setPersonalization.ts` calls into this with no guard; the typed `Record<string, unknown>` is a compile-time fiction across the wire. Same hazard for arrays/primitives.

**Verdict: confirm medium.** Trivially exploitable by a malformed client and produces an opaque transport error instead of a structured `{ ok: false, errors }`. One-line guard fixes it.

## C009 — saveState rejection in tools surfaces as unhandled MCP transport error

Singleton (R3, two findings R3-004 + R3-005). The cluster mixes two distinct concerns:
1. (R3-004) `verifySpot` calls `runVerification` with no `opts` — already covered by H001.
2. (R3-005) The `saveState` calls in selectPath/setPersonalization/verifySpot have no try/catch, so an `ENOSPC`/`EACCES` reject propagates as an opaque MCP transport error.

**Source verified.** `verifySpot.ts:63` `await saveState(...)` with no try/catch; same in `selectPath.ts:129` and `setPersonalization.ts:104`. The opaque "MCP error ..." text observed in `red.log:74-77` confirms the failure mode the reviewer describes.

**Verdict: split.** The `opts.spawn` half merges into H001. The error-handling half stays as M004 (medium). The `verifySpot` pass branch is the worst case — verification ran, the user "passed", but the cursor never advanced and no signal reaches the client.

## Other clusters

C003/C004/C005 (low — verify.ts spawn-error context, command split brittleness) — verified, low severity stands; latent in cycle 4 since only `pnpm build` is used.

C007 (low — verifySpot has no defensive handler for VerificationModeUnsupportedError) — verified at verifySpot.ts:58. Forward-looking only; cycle-4 phases all use `compile`. Low severity stands.

C008 (low — `(spot.verification as unknown) as VerificationSpec` cast) — verified at verifySpot.ts:54-56. Low severity stands; downstream of C016 schema dual-mode.

C010 (low — selectPath silently wipes cursor/ladder on re-selection) — verified at selectPath.ts:118-129. Latent: cycle 4 ships one path so re-selection rare; low stands.

C011/C015/C023 (low — buildPrompts duplication / personalization range duplication / DeclaredOptions union shape) — three reviewers (R2, R4) flag overlapping design smells in personalization.ts and the two tools. All medium-or-low; pass through.

C013 (low — new tools have no outputStyleOk gate) — verified. Contract A11(c) explicitly accepts protocol-only enforcement; current behavior matches the contract. R6-004 itself rated this low. Pass through.

C014/C026 (low — duplicated state-load preamble across 3-4 tools) — verified. Standard refactoring opportunity; low severity stands.

C016 (medium — validatePhases dual-mode hasAnyNewField) — verified at schemas/phases.ts. Worth surfacing because it weakens A2's tightening. Medium stands.

C017 (medium) — handled above as M002.

C018/C019 (low — LoadPhasesError reason blob, no slug sanitization) — verified. R6-003's slug sanitization is defense-in-depth; the trust model places projectRoot under user control. Low stands.

C020/C021 (low — selected_path string-vs-empty, OptionDesc parallel shapes) — design smells; low stands.

C025 (medium — saveState close() error swallows sync() error) — verified at state.ts:145-150. Real durability bug under disk pressure. Medium stands.

C029 (medium — T-224 SHA-256 baseline only runs on author's machine) — verified. CI silently skips byte-equality assertion against the upstream source. The pre-computed `REFERENCE_APP_TSX_SHA256_AT_AUTHOR` constant exists but is never compared against the bundled file unconditionally. Medium stands; this is a real coverage hole for AC-A9.

C030/C031/C032/C033/C034/C035 (low — various test-vs-impl shortcuts: T-291 placeholder-only, T-254 grep-only, T-258 grep-only, T-215 static-grep instead of runtime sentinel, T-267 round-trip ambiguity, T-231 fully-mocked) — singletons from R5. All accurate; all low. Synthesis-notes already documents the orchestrator amendments. Pass through; collapse into Test posture section.

C024/C027/C036 (info — positive findings: hasOwnProperty guard correct; verification.command surfaced to LLM context; AC-1.3/A11/A12/A21 invariants hold) — pass through; surface in summary.

## Mega-cluster check

C001+C002 are the only candidate (3+ categories at overlapping line ranges). Confirmed they cover the same concrete finding via the same six lines (43–52 of verify.ts) — not a split situation; merge as H001.

## AC-1.3 / A11 carry-forward

`tools/start.ts:24-36` returns from the outputStyleOk=false branch before any `loadState` call. No filesystem writes. The four new tools (selectPath/setPersonalization/nextSpot/verifySpot) each call `saveState` unconditionally on their own success branches but they are not reachable from `start`'s outputStyleOk=false path — a misbehaving client could call them out-of-order over MCP, but the contract A11(c) explicitly accepts "protocol-only enforcement." The reviewer dimension R6-004 rated this low itself; AC-1.3 holds at the `start` boundary.
