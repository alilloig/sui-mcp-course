# Phase F (E2E) review — round 2 (post cycle-6 remediation)

## Summary

- 17 verified clusters from 21 raw findings across 6 dimensional reviewers (one per scenario family).
- **Severity profile**: 0 critical, 1 high, 1 medium, 0 low, 15 info.
- **Gate verdict: PASS.** No critical clusters; the single high (C013) is a partial-coverage harness-wiring issue, not a contract regression. 4 of the 5 round-1 highs are now fully closed; the 5th (H004 / E-010) shows production-side fix in place but harness wiring incomplete — narrow, well-scoped.
- All 16 e2e scenarios E-001..E-016 exercised; 15 pass cleanly, 1 partial-coverage (E-010 passes via env-var trick).

## Round-1 → Round-2 closure tally

| Round-1 high | Cycle 6 fix | Round-2 status |
|---|---|---|
| H001 / E-014 / E-015 (manifest p2-polling/p3-display) | phases.json renamed to p2-retry/p3-poll + 8 content packs | **CLOSED** (R1, R3) |
| H002 / E-002 (outputStyle bare {ok:false}) | warning shape with kind='output-style-plugin-not-enabled' on both branches | **CLOSED** (R2) |
| H003 / E-006 (state.json wedge + archive leak) | content-hash dedup + selectPath fresh-state mint | **CLOSED** (R3) |
| H004 / E-010 (probeOpts not threaded) | runPreflightProbe accepts probeOpts param | **PARTIAL** — production OK, harness wiring missed (C013/R5) |
| H005 / E-008 (sui-cli precondition undeclared) | scenarios.json + cycle-e2e-pass.sh skip-with-reason | **CLOSED** (R4) |

## High

### H001 — E-010 partial: production probeOpts threading is correct, but harness never forwards stubs through the new parameter

**File:** `scripts/e2e/harness.ts:80-104` (callTool intercept) + `scripts/e2e/harness.ts:177-196` (withDockerStub / withSuiCliStub).
**Reviewer:** R5 (R5-001). Cluster C013.

**Evidence**:
- Cycle 6 H004 correctly added `probeOpts?: Partial<Record<ProbeId, ProbeOptions>>` to `runPreflightProbe.ts` and threads it via `(pid) => runProbe(pid as ProbeId, probeOpts[pid] ?? {})` into `runDeployRemediation`'s precondition checker. T-312 verifies this with a direct `runPreflightProbe({...probeOpts: {'docker-running': {spawn: stub}}})` call. Production is correct.
- BUT `scripts/e2e/harness.ts`'s callTool intercept only short-circuits when the OUTER `args.probeId` matches a stub key in `probeSpawnStubs`. When a test calls `runPreflightProbe('sandbox-manifest-reachable', {remediate: true})` through the harness, the intercept does NOT match (probeId is 'sandbox-manifest-reachable', not 'docker-running'), so the call passes through to production. Production's runDeployRemediation then calls precondition checker for 'docker-running', but `probeOpts` was never passed in by the test (no harness API exposes it), so the empty-probeOpts default fires → real docker-info runs.
- T-159 currently passes only because the test suite is run with `DOCKER_HOST=tcp://127.0.0.1:1` — that env var causes the REAL docker-info command to fail, so the precondition gate fails on `docker-running` for the right reason but for the wrong cause. Without the env-var trick, on a host with Docker actually running and sui-cli out of range (e.g. 1.69.2), the precondition gate would fail on `sui-cli-version`, not `docker-running`, and the test assertion `JSON.stringify(r7.warning).toContain('docker-running')` would fail.

**Impact**:
- Narrow today: tests pass under the established `DOCKER_HOST` convention. The structural assertion (E-010 step "Docker fail short-circuits remediation before any deploy attempt") is verifiable via T-312 directly even if T-159 is environment-dependent.
- Carry-forward risk: any future test that legitimately wants to assert "docker-running stub was injected end-to-end through the harness" cannot do so today. The harness does not expose a way to thread per-probe spawn stubs through `runPreflightProbe`'s probeOpts.

**Recommendation**:
- Extend `harness.ts` callTool intercept: when `toolName === 'runPreflightProbe'` and `args.probeId` is a deploy-remediation-trigger probe (e.g. 'sandbox-manifest-reachable'), build a `probeOpts` map from the registered `probeSpawnStubs` and forward it via the args. Concretely, ~10 lines of code at `harness.ts:85-104`. T-159 then passes for the right reason regardless of host environment; T-312 continues to assert the production-side plumbing directly.
- Alternatively, expose `withDockerStub` / `withSuiCliStub` as a "build the probeOpts map" helper rather than only an intercept-time hook.
- Below the gate threshold (passes today, no AC regression). Recommend folding into a follow-up cycle or addressing inline as a 1-paragraph commit. NOT a remediation cycle trigger.

## Medium

### M001 — E-011 carries forward 'version' word divergence between scenario and production

**File:** `mcp/server/src/probes/suiCli.ts:48`. **Reviewer:** R5 (R5-003). Cluster C015.

Production message: `Sui CLI version 1.62.0 is outside the supported range`. Scenario E-011 expects substring `Sui CLI 1.62.0 is outside the supported range` (no inserted "version"). Cycle 6 did not scope this (it's a known low from round 1). T-160 passes only because it under-asserts (checks `1.62.0` and `brew install sui` separately). Below threshold.

**Recommendation**: drop the word `version` from the message; tighten T-160 to assert `expect(r.message).toContain('Sui CLI 1.62.0 is outside the supported range')`. Trivial 1-line fix. Defer.

## Coverage

| Scenario | Round-2 reviewer | Status |
|---|---|---|
| E-001 cold-start | R1 | pass (info) |
| E-002 output-style refusal | R2 | pass (info) — H002 closed |
| E-003 sui-pilot preflight | R2 | pass (info) |
| E-004 help-ladder full traversal | R3 | pass (info) — H001 follow-on closed |
| E-005 registry extensibility | R1 | pass (info) |
| E-006 corrupt-state recovery | R3 | pass (info) — H003 closed |
| E-007 stub deploy | R4 | pass (info) |
| E-008 real deploy / skip-with-reason | R4 | pass (info) — H005 closed |
| E-009 sandbox repo absent | R5 | pass (info) |
| E-010 Docker not running | R5 | **HIGH H001** (partial — production OK, harness wiring incomplete) |
| E-011 unsupported sui-cli | R5 | **MEDIUM M001** (wording carry-forward) |
| E-012 malformed path.json | R6 | pass (info) — wording carry-forward L002 below threshold |
| E-013 empty paths dir | R6 | pass (info) — wording carry-forward L002 below threshold |
| E-014 personalization at p3 | R1 | pass (info) — H001 closed |
| E-015 resume at p2-retry | R1 | pass (info) — H001 closed |
| E-016 schema-version mismatch | R3 | pass (info) |

All 16 scenarios E-001..E-016 covered. **15 pass cleanly, 1 partial.**

## Info (15 — passing assertions)

- **C001 (E-015)**: resume cursor `p2-retry/p2-spot-1` resolves to `done:false` (R1).
- **C002 (E-014)**: p3 prompt substitution renders `5000` from `poll_interval_ms` (R1).
- **C003 (E-005)**: synthetic `paths/04-fake-path/` discovered by registry (R1+R3, agreement 2).
- **C004 (E-002)**: plugin-key=false → warning kind+plugin+activation step + no state.json (R2).
- **C005 (E-002)**: enabledPlugins missing → same warning shape (R2).
- **C006 (E-003)**: sui-pilot preflight remediation message exact + flip recovers (R2).
- **C007 (E-006)**: selectPath mints fresh state on corrupt+archivedTo; 3× /start → 1 archive (R3).
- **C008 (E-016)**: schema_version=999 → clean guided stop, no archive, bytes preserved (R3).
- **C009 (E-004)**: ladder rung 1→2→3 flips all four flags and advances to p2-retry/p2-spot-1 (R3).
- **C010 (E-007)**: stub deploy returns expected message; no real spawn fires (R4).
- **C011 (E-008)**: skip-with-reason path emits structured skip on out-of-range sui (R4).
- **C012 (E-008)**: scenarios.json en-dash precondition byte-verified (R4).
- **C014 (E-009)**: sandbox-repo-absent yields exact clone command (R5).
- **C016 (E-010)**: production probeOpts plumbing in runPreflightProbe is correct (R5).
- **C017**: cycle-6 path-traversal containment intact for new content-pack reads (R6).

## Recommendation

**Phase F round 2: PASS the gate. No remediation cycle 7 required.**

Round 1's 5 highs are 4.5/5 closed:
- E-014, E-015, E-004 tail (H001) — fully closed via cycle 6 phases.json + content packs.
- E-002 (H002) — fully closed via outputStyle warning shape.
- E-006 (H003) — fully closed via content-hash dedup + selectPath fresh-state mint.
- E-008 (H005) — fully closed via scenarios.json precondition + cycle-e2e-pass.sh skip-with-reason.
- E-010 (H004) — production fix landed correctly; harness wiring is the missing piece. Below gate threshold (T-159 passes; T-312 asserts production directly). 

**Carry-forward** for a future fast-follow OR small follow-up cycle:
- C013 (high, harness probeOpts threading): ~10-line patch to `harness.ts` to build a probeOpts map from registered stubs and forward it to runPreflightProbe.
- C015 (medium, E-011 wording): 1-line message fix in `suiCli.ts:48` + 1-line assertion tighten in T-160.
- Cycle 6 review.md's C023 high (warnings.ts kind/union mismatch): pre-existing pre-cycle-6 defect; surface for the same follow-up.

After folding these three (~15 LOC total) into a future fast-follow, the system would have 0 high findings under both cycle-6 internal review and Phase F round 2.

The cycle-e2e-pass.sh gate will exit 0; ship the run.
