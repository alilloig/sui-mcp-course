# Cycle 6 Contract — phase-f-remediation

## Behavior

This is **remediation cycle 6** (remediation #1 of a 3-cycle cap), derived directly from Phase F's six high-severity findings (H001–H005, with H006 merged into H001). Cycles 1–5 shipped the engine surface and 400 passing tests, but the e2e gate failed because (a) `paths/01-orderbook-viewer/phases.json` ships placeholder phase ids (`p2-polling`, `p3-display`) instead of the spec's normative `p2-retry` / `p3-poll` with the `{{ poll_interval_ms }}` substitution, blocking E-014 / E-015 / E-004's tail; (b) `outputStyle.ts` returns bare `{ ok: false }` on the most common refusal paths without naming the plugin, breaking E-002 / AC-1.1; (c) corrupt-state recovery archives `state.json` but never lets `selectPath` mint a fresh state, deadlocking E-006 and leaking N archives on each `/start` retry; (d) `runPreflightProbe` calls `runDeployRemediation` with empty `ProbeOptions`, so harness `withDockerStub` never reaches the precondition gate (E-010 unprovable); and (e) E-008 has no declared `Sui CLI in 1.63.2–1.64.1` precondition, so out-of-range hosts gate-fail before the real deploy runs. The deliverable is six tightly-scoped fixes that bring the e2e gate to 0 critical / 0 high while leaving cycles 1–5's behavior untouched.

## Files

**Existing production source to modify** (each fix maps to one or more H-finding):

- `paths/01-orderbook-viewer/phases.json` — rename `p2-polling` → `p2-retry` (target_range `103-114`); rename `p3-display` → `p3-poll` (target_range `116-145`); embed literal `{{ poll_interval_ms }}` placeholder in p3 prompt; populate `rungs`, `doc_links`, `verification` blocks for phases 2 and 3 to match spec L255-294 verbatim. (H001 / E-014, E-015, E-004 tail.)
- `mcp/server/src/outputStyle.ts` — both bare `return { ok: false };` branches (around L46-64) must return `{ ok: false, warning: { kind: 'output-style-plugin-not-enabled', message: <names plugin "learning-output-style@claude-plugins-official" and the activation step "claude plugins enable learning-output-style@claude-plugins-official"> } }`, mirroring the existing warning shape at L24-31 and L37-44. (H002 / E-002 / AC-1.1; collapses M001.)
- `mcp/server/src/state.ts` — corruption-recovery path: when `archiveCorruptFile` succeeds, the corrupt `state.json` must be unlinked (or the loadState result must carry `archivedTo` so callers can treat the slot as `absent`). De-duplicate the archive emission so a second `loadState` against an already-archived corruption does not generate a second archive. (H003 / E-006 / AC-7.2.)
- `mcp/server/src/tools/selectPath.ts` — when `stateResult.kind === 'corrupt'` AND `stateResult.archivedTo` is defined, treat the slot as `absent` and proceed to mint a fresh `State` via `saveState` (5-line change at the existing L81-88 short-circuit). (H003 / E-006 / AC-7.2.)
- `mcp/server/src/tools/start.ts` — de-duplicate the repeat-archive emission at L54-67 so repeated `/start` calls on identical corrupt bytes do NOT regenerate N archive files under `.sui-deepbook-course/`. (H003 / E-006 / AC-7.2.)
- `mcp/server/src/tools/runPreflightProbe.ts` — extend the tool to accept (or read from `args`) a `probeOpts: Partial<Record<ProbeId, ProbeOptions>>` map; thread it via `(pid) => runProbe(pid as ProbeId, probeOpts[pid] ?? {})` into `runDeployRemediation` (currently L54-57 passes `{}`). (H004 / E-010 / AC-2.4.)
- `.forge/e2e/scenarios.json` — append `"Sui CLI in 1.63.2–1.64.1"` to E-008's `preconditions` array (currently L194-198). (H005 / E-008 / AC-2.5.)
- `scripts/cycle-e2e-pass.sh` — add a skip-with-reason branch for E-008 when the host's `sui --version` is outside `1.63.2-1.64.1`, mirroring the existing `docker info` skip convention. (H005 / E-008.)

**New content files to create** (required for the renamed phases to have loadable assets — H001 follow-on):

- `paths/01-orderbook-viewer/rungs/p2-spot-1/hint.md` — one-paragraph nudge for the `withRetry` helper spot.
- `paths/01-orderbook-viewer/rungs/p2-spot-1/reference.md` — exact `withRetry` reference snippet (mirrors `~/workspace/deepbook-sandbox-evaluation-apps/01-orderbook-viewer/src/App.tsx` lines 103-114).
- `paths/01-orderbook-viewer/rungs/p2-spot-1/auto.md` — auto-write payload (the snippet plus any context the engine needs to splice it cleanly into `target_range 103-114`).
- `paths/01-orderbook-viewer/rungs/p3-spot-1/hint.md` — one-paragraph nudge for the polling tick.
- `paths/01-orderbook-viewer/rungs/p3-spot-1/reference.md` — exact polling-tick reference snippet (mirrors lines 116-145), with the literal `{{ poll_interval_ms }}` placeholder where the personalization value substitutes.
- `paths/01-orderbook-viewer/rungs/p3-spot-1/auto.md` — auto-write payload for the polling tick.
- `paths/01-orderbook-viewer/phases/p2.md` — phase 2 explainer (resilient gRPC simulation calls).
- `paths/01-orderbook-viewer/phases/p3.md` — phase 3 explainer (polling loop with failure tolerance).

**Existing tests that may need amendment** (carry-forward warning):

- `tests/harness.lesson.test.ts` — cycle 4/5 hardcoded "exactly N tools" baselines; if cycle 6 introduces a new MCP tool surface (it does NOT — `runPreflightProbe` gains a parameter, not a new tool), no amendment is needed. **However**: any test that asserts on E-008 preconditions or scans `scenarios.json` may need to widen its expected-array shape. Forge-guard rule 8 still blocks test edits during green; orchestrator should expect to amend if a hardcoded baseline trips.
- Any test that asserts the precise shape of `outputStyle.ts`'s refusal path on the missing/disabled plugin branches — those tests now must assert the *presence* of `warning.kind === 'output-style-plugin-not-enabled'` and `warning.message` containing both the plugin name and the activation step. Test-author for cycle 6 should write these assertions cleanly the first time.

## Acceptance

Each AC cites the spec anchor, the failing E-scenario(s), and states the observable property tests must assert.

1. **(H001 / AC-6.3 / AC-4.2; covers E-014, E-015, E-004 tail)** `paths/01-orderbook-viewer/phases.json` MUST declare phase id `p2-retry` with `target_range: "103-114"` and `explainer_md: "phases/p2.md"`, and phase id `p3-poll` with `target_range: "116-145"` and `explainer_md: "phases/p3.md"`. The p3-spot-1 `prompt` field MUST contain the literal substring `{{ poll_interval_ms }}`. Each of the two phases MUST carry a `rungs` block pointing to `rungs/p2-spot-1/{hint,reference,auto}.md` (resp. `rungs/p3-spot-1/...`), a non-empty `doc_links` array, and a `verification` object whose `mode` matches the spec example (`compile` for p2, `simulate` for p3). After substitution with `poll_interval_ms=5000`, the rendered p3-spot-1 prompt MUST contain the literal `5000` and MUST NOT contain `{{ poll_interval_ms }}`. The phase-engine cursor `{phase_id:'p2-retry', spot_id:'p2-spot-1'}` MUST resolve to a non-`done:true` Spot record. The new content files (rungs/, phases/) MUST exist on disk and MUST be loadable by the existing rung-content reader.

2. **(H002 / AC-1.1; covers E-002)** Both branches of `outputStyle.ts` that previously returned bare `{ ok: false }` (the `enabledPlugins` missing/non-object branch and the plugin-key absent / `!== true` branch) MUST return `{ ok: false, warning }` where `warning.kind === 'output-style-plugin-not-enabled'` and `warning.message` is a string containing both `learning-output-style@claude-plugins-official` AND `claude plugins enable learning-output-style@claude-plugins-official`. The `start` tool's response `warnings` array MUST include this warning whenever `outputStyleOk === false` on either branch. No state file MUST be created on this refusal path (preserve AC-1.3).

3. **(H003 / AC-7.2; covers E-006)** When `loadState` returns `kind === 'corrupt'` and `archiveCorruptFile` succeeded:
   - `selectPath` MUST treat the corrupt slot as `absent` and mint a fresh `State` via `saveState`, returning `{ ok: true, ... }` rather than `{ ok: false, errors: [...] }`. After this call, a fresh `state.json` MUST exist at the expected path with `cursor` at `p1-bootstrap/p1-spot-1` (or whatever the freshly-selected path's first phase/spot is).
   - On a SECOND `/start` against IDENTICAL corrupt bytes (i.e. when an archive for those bytes has already been emitted), the engine MUST NOT generate a second archive file. Concretely: the count of `state.corrupt-*.json` files under `.sui-deepbook-course/` after N consecutive `/start` calls on the same corrupt input MUST equal 1, not N.
   - The original-bytes invariant from Phase F (cluster C009) MUST be preserved: the archive's bytes MUST match the corrupt `state.json`'s pre-recovery bytes exactly.

4. **(H004 / AC-2.4; covers E-010)** `runPreflightProbe` MUST accept a `probeOpts` map (either as a new tool parameter or read from `args.probeOpts`) of shape `Partial<Record<ProbeId, ProbeOptions>>`. The tool MUST forward each entry into the precondition checker via `runProbe(pid, probeOpts[pid] ?? {})` so that the harness's `withDockerStub` (which sets `probeSpawnStubs.set('docker-running', stubSpawn)`) flows through `runPreflightProbe → runDeployRemediation → checkPrecondition`. Observable assertion: with `withDockerStub({exitCode:1})` active and no other probe stubs, the deploy-remediation gate MUST short-circuit with `probeId: 'docker-running'` (not `sui-cli-version` or any other probe), and NO `pnpm deploy-all --quick` invocation MUST be recorded by the harness.

5. **(H005 / AC-2.5; covers E-008)** `.forge/e2e/scenarios.json` E-008's `preconditions` array MUST include the string `Sui CLI in 1.63.2–1.64.1` (matching spec L374's wording). `scripts/cycle-e2e-pass.sh` MUST detect when the host's `sui --version` is outside that range and emit a skip-with-reason for E-008 (analogous to the existing `docker info` skip), so out-of-range hosts do not produce false-fail signals. Observable assertion: on a host with `sui 1.69.2`, running `cycle-e2e-pass.sh` against E-008 MUST produce a structured "skipped: sui-cli out of supported range" record (not a failure), and the run MUST NOT spawn `pnpm deploy-all --quick`. On a host with sui in range, E-008 still runs as before.

6. **(H001 follow-on / E-004 ladder traversal)** With the renamed phases in place, E-004's full ladder traversal (rung 1 → 2 → 3 at p1-spot-1, then cursor advance to p2-retry/p2-spot-1, then a syntactically-broken edit at p2-spot-1 triggering auto-verify and ladder re-offer) MUST be reachable end-to-end. Observable assertion: after rung-3 auto-write at p1-spot-1 passes verification, `nextSpot` MUST return `{ phase_id: 'p2-retry', spot_id: 'p2-spot-1', done: false }`, and the rung content packs at `rungs/p2-spot-1/{hint,reference,auto}.md` MUST be readable by `requestHint` for that cursor.

---

## Notes for test-author / implementer

**Carry-forward from cycle 5 synthesis-notes (read these before writing tests).**

- Forge-guard rule 8 blocks test-file edits during green. Cycles 1–5 each required orchestrator amendments because of recurring test bugs: (a) `vi.spyOn(fsPromises, 'writeFile')` followed by capturing `realWriteFile = fsPromises.writeFile` AFTER the spy was installed (causes self-recursion → "Maximum call stack size exceeded"); (b) hardcoded "exactly N tools" baselines that break on every new MCP tool; (c) off-by-one comparators between counter-based assertions (`saveOrder > tgtIdx` should be `>=` when the side-effect being measured doesn't tick the counter). Cycle 6 test-author MUST avoid all three patterns the first time:
  - For any test that needs to forward through a spied async fs method, capture the real reference BEFORE installing the spy, OR forward via the sync API (`fs.writeFileSync`), OR use `vi.mocked(...).mockImplementation((...args) => fsPromises.writeFile.mock.original?.apply(...))` only with explicit care.
  - Avoid hardcoded "tools.length === 7" baselines. Cycle 6 does NOT add a new MCP tool (it extends `runPreflightProbe`'s param shape), so the existing `harness.lesson.test.ts` count of 7 should hold — but if the implementer adds a `resetState` tool as an alternate fix to H003, the baseline MUST be amended to 8.
  - For counter-based ordering assertions, use `>=` when the asserted side-effect is NOT what the counter tracks, and `>` only when it is.

- **T-091 lesson (carry-forward)**: the right invariant for "shell-action emission" is "no NEW tool emits `kind: 'shell'`", NOT "the literal string `kind: \"shell\"` appears only in `runPreflightProbe.ts`". The current allowed-emitter set is `{runPreflightProbe.ts, preflight.ts, manifest.ts}`. Cycle 6 adds NO new shell emitters; if the implementer inadvertently adds one, that is a real defect.

**Cumulative test count expected.**

- Cycles 1–5 = 400 tests passing + 1 skipped (T-157, Phase F deferral). Cycle 6 should add roughly **6–12 new tests**, one per AC plus targeted edge cases:
  - AC-1: at least one test asserting the renamed phase ids resolve via the engine's `getCurrentSpot`; at least one test asserting the `{{ poll_interval_ms }}` substitution renders `5000` (not the placeholder) when personalization sets `poll_interval_ms=5000`; one test asserting the new content files load.
  - AC-2: one test per refusal branch (missing `enabledPlugins`, plugin key absent, plugin key `false`) asserting the warning shape; one test asserting `start.tool` propagates the warning; one negative-AC test asserting no `state.json` is written on the refusal path.
  - AC-3: one test asserting `selectPath` mints a fresh state when `kind === 'corrupt' + archivedTo`; **one test for archive de-duplication** (call `/start` twice on identical corrupt bytes; assert only one `state.corrupt-*.json` file exists); one test asserting archive bytes equal pre-recovery bytes.
  - AC-4: one test that wires `withDockerStub` through `runPreflightProbe(probeOpts={...})` and asserts the deploy-remediation gate fails with `probeId: 'docker-running'`, not `sui-cli-version`.
  - AC-5: one test asserting `scenarios.json` E-008 preconditions contain the new string; **one test for skip-with-reason** in `cycle-e2e-pass.sh` (or a unit test of the helper that determines skip eligibility).
  - AC-6: one test asserting `nextSpot` returns the p2-retry cursor after rung-3 advance (this is an integration-level assertion that confirms AC-1's manifest renames + cycle-5's ladder protocol cooperate).

**Scope discipline.**

The 6 ACs above are the COMPLETE scope. Do NOT introduce:
- Medium / low items (M001-M004, L001-L004) — those are deferred to a follow-up cycle.
- A `resetState` MCP tool (option (a) from the recommendation is preferred — the 5-line `selectPath.ts` change — because it does NOT add a new tool to the surface and does NOT break cycle-5's "exactly 7 tools" baseline).
- Wider Sui CLI version range in `suiCli.ts:4-5` — that is option (2) of the H005 recommendation; option (1) (precondition + skip) is preferred and already in scope.
- New course content beyond the p2/p3 packs listed in `## Files`.
- Probe-result `class` discriminator (L004) — defer.
- Wording fixes for L002 / M003 — defer (low / medium).

If the implementer encounters a scope question not answered here, halt and escalate to the orchestrator rather than widening.
