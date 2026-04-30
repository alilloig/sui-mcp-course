# Phase F (E2E) review

## Summary

- 20 verified clusters across 16 e2e scenarios (E-001..E-016); 6 high, 4 medium, 4 low, 6 info.
- **Gate verdict: FAIL.** A remediation cycle is required. Three high clusters block the gate at the manifest layer (E-014, E-015, E-004's p2-retry tail) because production `paths/01-orderbook-viewer/phases.json` ships `p2-polling`/`p3-display` placeholder phases instead of the spec's normative `p2-retry`/`p3-poll` with target ranges 103-114 and 116-145; this single content defect is the largest source of e2e failures. Two more highs target real wiring bugs: corrupt-state recovery never unlinks `state.json` (E-006 wedges on second call), and `runPreflightProbe` calls `runDeployRemediation` with an empty `ProbeOptions` so harness probe stubs never reach the precondition gate (E-010 cannot prove docker-fail short-circuits). One high (E-002 output-style refusal) is a missing warning emission on the most common refusal path. One high (E-008 sui-cli precondition gate) is a scenario/precondition declaration mismatch on hosts running sui-cli outside 1.63.2-1.64.1 (this host is 1.69.2).
- All 6 high clusters were verified against current source; none could be dropped or downgraded. Estimated remediation scope: ~6 file edits (phases.json content, state.ts unlink, runPreflightProbe ProbeOptions plumbing, outputStyle.ts warning attachment, scenarios.json E-008 precondition row) plus rungs/p2-spot-1, rungs/p3-spot-1 content. This is remediation cycle #0 of a 3-cycle cap.

## Critical

(none)

## High

### H001 — E-014 / E-004 / E-015 cannot pass: phases.json ships p2-polling / p3-display placeholders, not the spec's p2-retry / p3-poll with substitution-bearing prompts

**File:** `paths/01-orderbook-viewer/phases.json:30-63`
**Spec anchors:** `spec.md:230-294` (normative phases.json example), `spec.md:410-411` (substitution table), AC-6.3.
**Reviewers:** R1 (singleton-high; verified against source).

**Evidence (verified against source)**:
- `phases.json:31` declares `"id": "p2-polling"`; spec L255 normatively requires `"id": "p2-retry"`.
- `phases.json:35-39` declares `target_range: "1-1"` and prompt `"TBD in cycle 5+: Implement the polling loop..."`; spec L262 requires `target_range: "103-114"`.
- `phases.json:48` declares `"id": "p3-display"`; spec L275 requires `"id": "p3-poll"`.
- `phases.json:54-56` declares `target_range: "1-1"` and prompt with no `{{ poll_interval_ms }}` placeholder; spec L282 requires `target_range: "116-145"` and prompt L283 contains the literal placeholder `every {{ poll_interval_ms }} ms`.
- Phases 2 and 3 lack `rungs` and `doc_links` blocks; the spec example carries both.
- `paths/01-orderbook-viewer/` ls confirms only `rungs/` (only `p1-spot-1/` content present); no `phases/p2.md`, `phases/p3.md` explainers exist.

**Impact**: E-014's load-bearing p3 substitution assertion (`assert prompt contains "5000"`) is unreachable — the manifest has no placeholder to substitute into. E-015's seeded cursor `{phase_id:'p2-retry', spot_id:'p2-spot-1'}` resolves to `done:true` because `getCurrentSpot` cannot find a phase named `p2-retry` (verified at `phaseEngine.ts:60-74`: `phases.phases.find((p) => p.id === phase_id)` returns undefined → branch returns `{done: true}` at L65). E-004's tail step `assert cursor advanced to p2-retry/p2-spot-1` cannot hold for the same reason. AC-6.3's second clause is structurally unverifiable in the deliverable.

**Scenarios**: E-014 (primary), E-015 (resume cursor), E-004 (cursor advance after rung-3).

**Recommendation**: Rename and re-content phases 2-3 in `paths/01-orderbook-viewer/phases.json` to match the spec's Registry Schema example verbatim — phase id `p2-retry` with `target_range "103-114"`, phase id `p3-poll` with `target_range "116-145"` and the `{{ poll_interval_ms }}` placeholder in the polling-tick prompt. Author `rungs/p2-spot-1/{hint,reference,auto}.md`, `rungs/p3-spot-1/{hint,reference,auto}.md`, `phases/p2.md`, `phases/p3.md`. The alternative — amending spec.md and scenarios.json — would relax the AC-6.3 substitution proof and is not preferred.

### H002 — E-002 output-style refusal returns no warning naming `learning-output-style` on the disabled / missing-key paths

**File:** `mcp/server/src/outputStyle.ts:46-64`
**Spec anchor:** AC-1.1 — "If `learning-output-style@claude-plugins-official` is not enabled in `~/.claude/settings.json`, `/sui-deepbook-course:start` returns a refusal naming the plugin and the activation step."
**Reviewers:** R2 (singleton-high; verified against source).

**Evidence (verified against source)**:
- `outputStyle.ts:53` returns bare `{ ok: false }` when `enabledPlugins` is missing or non-object — no `warning` attached.
- `outputStyle.ts:63` returns bare `{ ok: false }` when the plugin key is absent or `!== true` — no `warning` attached.
- Compare to L24-31 (settings file missing) and L37-44 (settings malformed), which both attach a `warning` with a `kind` and a `message`.
- `start.ts:24-36` propagates `styleResult.warning` into the response only when it is defined; nothing else composes a `learning-output-style`-named refusal. So the bare-`{ok:false}` branches reach the wire with no plugin-named diagnostic.

**Impact**: AC-1.1 is silently violated for the most common failure path (plugin entry exists with value `false`, or plugin entry absent from `enabledPlugins`). The student receives `outputStyleOk:false` and warnings that do not name the plugin or the activation step.

**Scenarios**: E-002.

**Recommendation**: Make both bare-`{ok:false}` branches return a structured warning, e.g. `{ ok: false, warning: { kind: 'output-style-plugin-not-enabled', message: 'learning-output-style@claude-plugins-official is not enabled. Run: claude plugins enable learning-output-style@claude-plugins-official' } }`. Add a `start.tool.test.ts` assertion that `response.warnings` includes a `learning-output-style`-naming entry whenever `outputStyleOk === false`.

### H003 — Corrupt state.json is archived but never unlinked; selectPath short-circuits forever (E-006 deadlock)

**File:** `mcp/server/src/state.ts:81-127`, `mcp/server/src/tools/selectPath.ts:81-88`
**Spec anchor:** AC-7.2 — "An invalid-JSON state file produces the corruption recovery prompt and archives the original."
**Reviewers:** R3 (singleton-high; verified against source).

**Evidence (verified against source)**:
- `state.ts:108-127` (`archiveCorruptFile`) writes the archive with `flag: 'wx'` and returns the archive path. There is no subsequent `fsPromises.unlink(path.join(stateDir, STATE_FILE))` — verified by reading the entire function body.
- `selectPath.ts:81-85` short-circuits: `if (stateResult.kind === 'corrupt') { return { ok: false, errors: [\`State corrupt: ...\`] }; }`. The user cannot transition out of the corrupt state through the documented MCP surface.
- `start.ts:54-67` re-archives every call when `stateResult.kind === 'corrupt'` — N retries produce N archives.
- No `resetState` tool exists in `mcp/server/src/tools/` (confirmed: `selectPath.ts`, `start.ts`, `nextSpot.ts`, `setPersonalization.ts`, `verifySpot.ts`, `requestHint.ts`, `runPreflightProbe.ts` are the full set; no recovery action).

**Impact**: AC-7.2's full intent — "the student is offered 'resume from phase 0' or 'abort'" (spec L122, L427) — is unimplemented. A real student who hits state corruption is wedged unless they `rm state.json` outside the plugin. Each `/start` retry leaks another archive file under `.sui-deepbook-course/`, growing without bound.

**Scenarios**: E-006 step 4 (`choose "resume from phase 0"; assert a fresh state.json is created`).

**Recommendation**: Two clean options. (a) Add a `resetState` MCP tool that unlinks `state.json` after archiving — the skill calls it after the user picks "resume from phase 0". (b) In `selectPath.ts`, when `stateResult.kind === 'corrupt'` AND `stateResult.archivedTo` is defined, treat the corrupt state as `absent` for the purposes of constructing the new `State` (the existing archive preserves the original bytes; selectPath already mints a fresh state via `saveState`). Option (b) is a 5-line change. Either way, also de-duplicate the archive emission in `start.ts:54-67` so repeated `/start` calls on identical bytes do not regenerate archives.

### H004 — runPreflightProbe calls runDeployRemediation with empty ProbeOptions; harness probe stubs cannot reach the precondition gate (E-010 unprovable)

**File:** `mcp/server/src/tools/runPreflightProbe.ts:54-57`
**Spec anchor:** AC-2.4 — "If Docker is not running, preflight emits an explicit stop and does not attempt deploy."
**Reviewers:** R5 (singleton-high; verified against source).

**Evidence (verified against source)**:
- `runPreflightProbe.ts:54-57` literal:
  ```
  const deployResult = await runDeployRemediation(
    probeResult.action,
    (pid) => runProbe(pid as ProbeId, {}),
  );
  ```
  The closure passes an empty `ProbeOptions` object `{}` — no `spawn` field, no path to inject the harness's `probeSpawnStubs.get('docker-running')` stub.
- `manifest.ts:84-101` (verified) iterates `['docker-running', 'sui-cli-version', 'sandbox-repo-present']` and calls `checkPrecondition(probeId)` on each — each call hits the production probe against the real host.
- `harness.ts:180-184` `withDockerStub` writes into `probeSpawnStubs.set('docker-running', stubSpawn)`, but this map is consumed only by the top-level `runProbe` call paths the harness itself dispatches — it does not flow through `runPreflightProbe → runDeployRemediation → checkPrecondition` on `:54-57`.

**Impact**: On any developer machine where Docker is running, E-010's `withDockerStub({exitCode:1})` does not actually flip the docker-running probe under the deploy-remediation gate. The first failing precondition becomes `sui-cli-version` (this host: 1.69.2 → outside 1.63.2-1.64.1), and the warning carries `probeId: 'sui-cli-version'` rather than `'docker-running'`. AC-2.4's structural assertion is unverifiable through the current wiring. The orchestrator could believe "deploy was blocked because Docker was off" when in fact a different probe blocked it.

**Scenarios**: E-010.

**Recommendation**: Thread the harness's `spawnByProbe` map into the precondition checker. Concretely: extend `runPreflightProbe.ts` to accept (or read from `args`) a `probeOpts` map and forward it via `(pid) => runProbe(pid as ProbeId, probeOpts[pid] ?? {})`. Alternatively, have `runDeployRemediation` accept `opts.spawnByProbe` and have it construct each precondition's `ProbeOptions` from that map.

### H005 — E-008 real-deploy precondition gate rejects on hosts with sui-cli outside 1.63.2-1.64.1; scenario does not declare this precondition

**File:** `mcp/server/src/probes/manifest.ts:84-105`, `mcp/server/src/probes/suiCli.ts:43-50`
**Spec anchor:** AC-2.5 — "An unsupported Sui CLI version is a guided stop, not a hard stop."
**Reviewers:** R4 (singleton-high; verified against source).

**Evidence (verified against source)**:
- `suiCli.ts:4-5`: `MIN_VERSION = [1, 63, 2]`, `MAX_VERSION = [1, 64, 1]`.
- `manifest.ts:84` (real-mode branch): `const preconditions = ['docker-running', 'sui-cli-version', 'sandbox-repo-present'];` — gate enforces all three before spawning `pnpm deploy-all`.
- Host check: `sui --version` returns `sui 1.69.2-33ef98b23370` → fails the gate with `Sui CLI version 1.69.2 is outside the supported range (1.63.2–1.64.1). Run: brew install sui` (verified at `suiCli.ts:47-50`).
- `scenarios.json:194-198` (E-008 preconditions): lists "Docker Desktop running", "learning-output-style enabled, sui-pilot enabled", "~/workspace/deepbook-sandbox checkout present with submodules", "sandbox NOT currently deployed at suite start". The sui-cli version range is not declared.

**Impact**: E-008 short-circuits in ~0.1s on common developer machines without ever spawning `pnpm deploy-all`, never exercising the real deploy mechanics that AC-2.3 requires. The cycle-3 docker-info skip-with-reason convention does not cover this case, so reviewers / CI will incorrectly conclude "E-008 fails" when the truth is "E-008 was gated by an undeclared precondition." Note: cluster C012 documents that one reviewer (R4-003) on a machine with sui in range successfully drove the real deploy in 151.3s — proving the deploy itself works; the defect is purely the gate / precondition declaration.

**Scenarios**: E-008.

**Recommendation**: Three options in preference order. (1) Add "Sui CLI in 1.63.2–1.64.1" to E-008 preconditions in `scenarios.json` and have `cycle-e2e-pass.sh` skip-with-reason analogous to the docker-info skip when the host's sui-cli is out of range. (2) Widen the supported range to admit current Sui (e.g. 1.63.2 to 1.69.x) — empirically the sandbox shape matches; confirm against deepbook-sandbox README. (3) Add an opt-in env var (`E2E_DEPLOY_SKIP_PRECONDITIONS=1`) consumed by the harness when the orchestrator chooses to drive the real deploy on out-of-range hosts. Option (1) is cheapest and matches existing convention.

### H006 — Confirmed by H001 above (no separate H006); merged into H001

(intentionally elided — see H001)

## Medium

### M001 — outputStyle probe contract divergence (warning shape inconsistent across failure branches)

**File:** `mcp/server/src/outputStyle.ts:33-64`
**Reviewers:** R2 (single source).
**Evidence**: Branches at L23-31 and L36-44 attach `warning`; branches at L53 and L63 do not. Same probe interface, two different shapes downstream consumers must handle.
**Impact**: Encourages the silent-missing-data bug demonstrated by H002. Design-quality issue.
**Recommendation**: Folded into H002's fix (return `warning` on every `!ok` branch).

### M002 — E-004 "auto-verifySpot after spot complete" is unimplemented in MCP surface

**File:** `mcp/server/src/tools/verifySpot.ts`, `mcp/server/src/tools/index.ts`
**Reviewers:** R3 (single source; verified — no `signalSpotComplete` or `completeSpot` tool exists in `mcp/server/src/tools/`).
**Evidence**: E-004's last 4 steps presuppose a "spot complete" signal that auto-runs `verifySpot`. `requestHint` rung 3 auto-dispatches `verifySpot` (this is wired); a generic non-ladder spot-complete event is not.
**Impact**: AC-4.3 ("Verification runs after every spot completion; failure routes to the help ladder") is partially covered — only the rung-3 path. A hand-edit completion has no engine-side trigger.
**Recommendation**: Cheapest fix is documentation: amend spec.md / E-004 to specify that the skill body always calls `verifySpot` after the student signals done. The alternative — adding a `completeSpot` tool that wraps `runVerifySpot` and falls through to ladder routing — is a larger surface change.

### M003 — sui-cli-version probe message wording diverges from E-011 scenario substring

**File:** `mcp/server/src/probes/suiCli.ts:47-50`
**Reviewers:** R5 (single source; verified at scenarios.json:269).
**Evidence**: Production message: `Sui CLI version 1.62.0 is outside the supported range...`. Scenario expects substring `Sui CLI 1.62.0 is outside the supported range` (no inserted word "version"). Existing test T-160 checks only `1.62.0` and `brew install sui` — too weak to catch the divergence.
**Impact**: A literal-substring scenario runner fails E-011 spuriously; the existing test does not gate on the spec wording.
**Recommendation**: Cheapest: drop the word `version` from the message: `Sui CLI ${versionStr} is outside the supported range (1.63.2–1.64.1). Run: brew install sui`. Tighten T-160 to `expect(r!.message).toContain('Sui CLI 1.62.0 is outside the supported range')`.

### M004 — `withSandboxRepoAbsent` harness fixture is a no-op documentation comment

**File:** `scripts/e2e/harness.ts:198-205`
**Reviewers:** R5 (single source; verified — fixture body literally says "No-op: the test controls HOME via beforeEach.").
**Evidence**: The fixture's name implies active staging; the body is empty. Only the existing Vitest `beforeEach` (`tests/harness.preflight.test.ts:73`) makes E-009 hermetic. A different runner that calls `bootHarness` without that `beforeEach` would exercise the developer's real `~/workspace/deepbook-sandbox`.
**Impact**: AC-2.2 coverage is environment-dependent. False-pass risk for E-009 across runners.
**Recommendation**: Make the fixture self-sufficient: capture the original HOME, assign a fresh tempdir for the lifetime of the harness, and restore on cleanup. Or: have `probeSandboxRepoPresent` read an injected `homeDir` from `ProbeOptions` and have the fixture set it explicitly.

## Low

### L001 — runStart projectRoot vs plugin-root paths/ ambiguity (C001 tail)
**File:** `mcp/server/src/tools/start.ts:19-36`. Reviewers: R1, R3, R6 (3-way agreement, downgraded from initial conflicting severities — verified harmless for current scenario set).
The registry resolves `pathsRoot` from `projectRoot`, but the spec's plugin-layout sketch (spec L166-180) puts `paths/` under the plugin root. For all 16 scenarios, the harness arranges `<projectRoot>/paths/` to match, so the divergence is invisible. **Recommendation**: clarify in spec.md whether `paths/` is plugin-rooted (per architecture) or project-rooted (per code) and align — does not block the gate.

### L002 — `malformed-path-json` warning lacks "skipped" / "parse error" wording (C002)
**File:** `mcp/server/src/registry.ts:82-93`. Reviewers: R1, R6 (2 sources).
Production message: `Failed to parse <abs path>: <detail>`. Scenario E-012 expects `skipped paths/99-broken/path.json: parse error`. The `kind` discriminator (`malformed-path-json`) matches the regex variant in the scenario; only the literal phrasing differs. **Recommendation**: reword to `Skipped <path>: parse error: <detail>` for symmetry with the other malformed-* warnings. Likewise reword `empty-paths-dir` message to embed `no paths installed` (AC-3.3 wording).

### L003 — E-007 "harness invokes pnpm deploy-all from sandbox/" is ambiguous under the stub branch (C014)
**File:** `.forge/e2e/scenarios.json:176-189`. Reviewers: R4 (1 source).
Stub branch (`E2E_DEPLOY_STUB=1`) deliberately never spawns; assertion has no observable subprocess. Cluster C012 confirms E-007 passes operationally with stub returning the expected envelope. **Recommendation**: tighten E-007 step 4 to assert `action.cwd` and `action.command` shape, not subprocess invocation; reserve the spawn-observation assertion for E-008 (real-deploy variant).

### L004 — ProbeResult lacks an explicit failure-class discriminator (C020)
**File:** `mcp/server/src/preflight.ts:19-23`. Reviewers: R5 (1 source).
Spec L86 promises `auto-recoverable | guided | stop` classification; the engine infers it from `action` presence/absence. Works for E-010/E-011 today, but is structurally fragile for future probe authors. **Recommendation**: add `class: 'auto-recoverable' | 'guided' | 'stop'` to `ProbeResult` and assert on it from scenarios. Non-blocking.

## Info (passes)

- **C007 / E-003** — sui-pilot disabled produces exact remediation `claude plugins enable sui-pilot`; flip-and-re-probe recovers (R2).
- **C009 / E-016** — schema_version=999 produces guided stop with `incompatible` + `migration` wording; no archive emitted; canonical bytes preserved (R3).
- **C010 / E-004** — Help-ladder full traversal (rung 1 → 2 → 3) works end-to-end against `withVerifyStub`: `hint_used`/`reference_shown`/`auto_completed` all flip; rung 3 auto-verify advances cursor; `auto_completed` survives restart. (Note: the p2-retry tail is broken via H001, not via the ladder protocol itself.) (R3).
- **C012 / E-007 + E-008 stub-and-real evidence** — Stub deploy returns expected `{pass:false, message:'[stub] deploy-all ran but manifest is not up. Run: pnpm down to clean up.'}` envelope without spawning. Real deploy on a host inside the sui-cli range completed in 151.3s and produced a valid manifest at :9009 (R4).
- **C015 / E-011 dispatch vs scenarios.json** — Dispatch prompt says `1.50.0`; scenario asserts `1.62.0`. Both yield structurally identical probe paths; flagging for future drift. (R5).
- **C016 / E-009** — sandbox-repo-present probe returns the exact clone command verbatim when `~/workspace/deepbook-sandbox` is absent (T-158 corroborates) (R5). See M004 for the harness-fixture caveat.

## Coverage

Mapping each E-ID to the reviewer(s) that drove or analyzed it:

| Scenario | Reviewers | Status |
|---|---|---|
| E-001 cold-start happy path | R1 (R1-001), R3 (R3-001), R6 (R6-005) | pass (info) |
| E-002 output-style refusal | R2 (R2-001) | **HIGH H002** |
| E-003 preflight + sui-pilot remediation | R2 (R2-002) | pass (info) |
| E-004 help-ladder full traversal | R3 (R3-004 pass; R3-005 medium-gap) | partial: ladder OK, p2-retry tail blocked by H001; M002 documents auto-verify gap |
| E-005 registry extensibility (04-fake-path) | R1 (R1-002) | pass (info) |
| E-006 corrupt-state recovery | R3 (R3-002) | **HIGH H003** |
| E-007 sandbox-unreachable-after-deploy (stub) | R4 (R4-001) | pass; L003 documents wording ambiguity |
| E-008 real sandbox deploy | R4 (R4-002, R4-003 success on in-range host) | **HIGH H005** (precondition gate undeclared) |
| E-009 sandbox repo absent | R5 (R5-001) | pass; M004 fixture concern |
| E-010 Docker not running | R5 (R5-002) | **HIGH H004** |
| E-011 unsupported sui-cli | R5 (R5-003, R5-006) | partial: probe semantics OK; M003 wording divergence |
| E-012 malformed path.json | R1 (R1-002), R6 (R6-001, R6-003) | pass; L002 wording |
| E-013 empty paths dir | R6 (R6-002, R6-004, R6-005) | pass; L002 wording |
| E-014 personalization substitution at p3 | R1 (R1-003) | **HIGH H001** |
| E-015 resume at p2-retry | R1 (R1-004) | **HIGH H001** (same root cause) |
| E-016 schema-version mismatch | R3 (R3-003) | pass (info) |

All 16 scenarios E-001..E-016 are accounted for. No scenario is uncovered.

## Recommendation

**Remediation cycle: YES (cycle 6, remediation #1 of 3-cycle cap).**

**Scope** (tight; targeted fixes only):

1. **`paths/01-orderbook-viewer/phases.json`** — rename phase `p2-polling` → `p2-retry`, set `target_range: "103-114"`, add `prompt`, `rungs`, `doc_links`, `verification` per spec L255-272. Rename `p3-display` → `p3-poll`, set `target_range: "116-145"`, embed `{{ poll_interval_ms }}` placeholder per spec L283. (Fixes H001 / E-014, E-015, E-004 tail.)
2. **Author content packs**: `paths/01-orderbook-viewer/rungs/p2-spot-1/{hint,reference,auto}.md`, `rungs/p3-spot-1/{hint,reference,auto}.md`, `phases/p2.md`, `phases/p3.md`. (Required for E-004 ladder runs at p2/p3 to load assets.)
3. **`mcp/server/src/outputStyle.ts:46-64`** — replace bare `return { ok: false };` at L53 and L63 with the same shape used at L24-31 and L37-44, attaching a `warning` of kind `output-style-plugin-not-enabled` whose message names the plugin and the activation step. (Fixes H002 / E-002 + collapses M001.)
4. **`mcp/server/src/state.ts` + `mcp/server/src/tools/selectPath.ts`** — Either (a) treat `corrupt + archivedTo defined` as `absent` in `selectPath` so a fresh state is minted (5-line change at `selectPath.ts:81-88`), or (b) add a `resetState` MCP tool. Prefer (a). Also de-duplicate archive emission in `start.ts:54-67` so repeated `/start` does not generate N archives. (Fixes H003 / E-006.)
5. **`mcp/server/src/tools/runPreflightProbe.ts:54-57`** — accept a `probeOpts` parameter (or read `args.probeOpts`) and forward per-probe `ProbeOptions` to the precondition checker so harness `withDockerStub` reaches `runDeployRemediation`. (Fixes H004 / E-010.)
6. **`.forge/e2e/scenarios.json:194-198`** — add `Sui CLI in 1.63.2-1.64.1` to E-008 preconditions; have `cycle-e2e-pass.sh` skip-with-reason E-008 when the host sui-cli is out of range. (Fixes H005 / E-008.) Optional: widen the supported range in `mcp/server/src/probes/suiCli.ts:4-5`.

**Out of scope for this remediation** (defer or accept):

- Medium and low items M002, M003, M004, L001-L004 should be addressed in a follow-up cycle but do not gate the deliverable. M003 wording divergence and L002 wording divergence are 1-line fixes that could opportunistically be folded in.
- C015 (dispatch prompt vs scenarios.json version literal mismatch) is a doc-quality issue with no runtime impact.

After cycle 6 ships the above 6 changes, re-run all 16 e2e scenarios. The expected end state is 0 critical, 0 high, ≤ 4 medium, ≤ 4 low — at which point `cycle-e2e-pass.sh` should pass.
