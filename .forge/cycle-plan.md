# Cycle Plan: sui-deepbook-course

Five cycles bring AC-1.* through AC-7.* online and route every E2E scenario except E-008 (real Docker deploy, executed in Phase F against the assembled implementation). Each cycle is sized around one cohesive concern; coarser cycles risk red→green flakiness, finer cycles waste forge-cycle overhead.

Validated invariants from `agent-config.md`:
- Cycles MUST NOT author content for `paths/02-*` or `paths/03-*` (Future Work).
- Cycles MUST NOT mock `pnpm deploy-all --quick` on E-008's path.
- Engine MUST stay parametric; no `slug === "01-orderbook-viewer"` branches anywhere.
- State writes are atomic; help-ladder rungs append-only.

Scenario distribution: 16 E2E scenarios mapped across 5 cycles + Phase F; every AC mapped to exactly one cycle's contract.

---

## Cycle 1 — `scaffold-registry-and-output-style`

**Scope.** Stand up the plugin skeleton, output-style advisory check, and filesystem-scanned path registry; ship a runnable e2e harness shell that downstream cycles extend.

**spec.md sections covered.**
- `### Plugin Layout (concrete file tree)`
- `## Registry Schema`
- `## Output-Style Enforcement`
- `### Top-level discovery (no index file)`
- `### path.json (one per path)`
- `### phases.json (one per path) — interesting-code-spots manifest` (schema only; content stubbed)
- Subset of `## MCP Tools`: `start` (returns `outputStyleOk` + `paths[]`), partial preflight stub.

**ACs covered.** AC-1.1, AC-1.2, AC-1.3, AC-3.1, AC-3.2, AC-3.3.

**E2E scenarios brought online.**
- E-002 — output-style refusal (no state mutations).
- E-005 — fake fourth path drop-in discovered via directory scan.
- E-012 — malformed `path.json` reported and skipped.
- E-013 — empty `paths/` produces explicit "no paths installed" message.

**Dependencies on prior cycles.** None (cycle 1 = bootstrap).

**Suggested tech surface.**
- `.claude-plugin/plugin.json` declaring the MCP server + components.
- `commands/start.md` body that loads `skills/course-engine/SKILL.md`.
- `mcp/server/` TypeScript: `index.ts`, `tools/start.ts`, `registry.ts`, `outputStyle.ts`. `package.json` + `tsconfig.json`.
- Schema validators for `path.json` and (loose, schema-only) `phases.json` — JSON-schema or hand-rolled, but cited in test-author's tests.json.
- `scripts/e2e/harness.ts` skeleton: harness boots, can drive MCP, can assert. Cycle 1 ships harness assertions for E-002/E-005/E-012/E-013.
- `paths/01-orderbook-viewer/path.json` (real), `paths/01-orderbook-viewer/phases.json` (placeholder/schema-valid but content empty).

**Risk hotspots.**
- Output-style check is **soft**: code MUST NOT claim to read the active runtime output style. Inspect only `~/.claude/settings.json#enabledPlugins` for `learning-output-style@claude-plugins-official`. Reviewers should flag any code that walks process env, parent-process inspection, or system prompt scraping.
- **AC-1.3 invariant**: `/start`'s refusal must occur **before any state-file write**. The output-style check happens at the very top of `tools/start.ts`, before reading or creating `<project>/.sui-deepbook-course/state.json`. Cycle 3's defensive probe #8 is only a re-check during an already-entered flow; it must NOT be relied on as the initial gate.
- Registry must handle: missing `paths/` dir, empty `paths/` dir, files-instead-of-dirs at `paths/<slug>`, malformed `path.json`. All four cases get spec-defined messages, no crashes.
- The fake-fourth-path test (E-005) is the canonical proof that the engine has zero hardcoded slug list. Cycle-pass review must confirm no `01-orderbook-viewer` literals exist outside `paths/01-*/` and tests.

---

## Cycle 2 — `state-persistence-and-recovery`

**Scope.** Per-project state file at `<project>/.sui-deepbook-course/state.json`: atomic writes, schema versioning, corruption recovery, absent-file=first-run semantics.

**spec.md sections covered.**
- `## State Schema`
- The state-file portions of `## Failure Modes` (corruption, schema mismatch, absent).
- The state-loading portion of the `start` tool (extends cycle 1).

**ACs covered.** AC-7.1, AC-7.2, AC-7.3, AC-7.4.

**E2E scenarios brought online.**
- E-006 — corrupt state file → recovery prompt + archived original.
- E-015 — re-run with valid state resumes at recorded cursor.
- E-016 — schema-version mismatch is a guided stop (NOT auto-recovered).

**Dependencies on prior cycles.** Cycle 1 (the `start` tool needs to read state).

**Suggested tech surface.**
- `mcp/server/src/state.ts`: load, save (write-tmp-then-rename), corrupt-archive, schema-version gate.
- `mcp/server/src/tools/start.ts`: extend to surface `state` in return when present, drive corruption-recovery / schema-mismatch responses.
- `scripts/e2e/harness.ts`: extend with E-006/E-015/E-016 fixtures (corrupt JSON file, valid state, future-version file).

**Risk hotspots.**
- **Atomicity invariant**: state writes via `write-tmp + fsync + rename`. A killed-mid-write process must never produce a partial state file. Reviewer "correctness" dimension should grep for direct `writeFile` against `state.json`.
- **Recovery archives** must NOT silently overwrite existing archives on repeated corruption. Use timestamped suffix (e.g. `state.json.corrupt.<ts>`).
- **Schema version mismatch ≠ corruption**. Spec is explicit: AC-7.3 is a *guided stop*, not a recovery prompt. Test-author must produce a test that asserts the two paths diverge.

---

## Cycle 3 — `preflight-eight-probes`

**Scope.** All 8 ordered preflight probes per the spec table, with pass/fail/remediate semantics, including the real `pnpm deploy-all --quick` invocation path. (Probe #8 — learning-output-style — re-invokes cycle 1's `outputStyle.ts` as a defensive re-check; no logic duplicated.)

**spec.md sections covered.**
- `## Preflight Checks (ordered)`
- `## MCP Tools` row for `runPreflightProbe`.
- The preflight portions of `## Lesson Flow`.
- The Docker / Sui CLI / sandbox-repo / manifest portions of `## Failure Modes`.

**ACs covered.** AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-2.5.

**E2E scenarios brought online.**
- E-003 — `sui-pilot` disabled → guided remediation → re-pass on retry.
- E-007 — manifest unreachable after deploy attempt (deploy-all stubbed in this scenario via env injection).
- E-008 — **real `pnpm deploy-all --quick`** against `~/workspace/deepbook-sandbox/sandbox/`; Docker-gated, ~3-5 min cold. This scenario owns AC-2.3's approval-and-execute branch end-to-end. (Phase F just exercises it from the harness; cycle 3 is the implementation owner.)
- E-009 — sandbox repo absent → guided stop with clone command.
- E-010 — Docker not running → explicit stop, no deploy attempt.
- E-011 — unsupported Sui CLI version → guided stop.

**Dependencies on prior cycles.** Cycle 1 (start tool, registry, `outputStyle.ts`); cycle 2 (state file may exist mid-preflight on re-runs).

**Suggested tech surface.**
- `mcp/server/src/preflight.ts`: ordered probe registry. Each probe = `{ id, run() → { pass, message, action? } }`.
- Probes in spec table order: `docker-running` (#1), `node-18+` (#2), `pnpm` (#3), `sui-cli-version-in-range` (#4), `sui-pilot-enabled` (#5), `sandbox-repo-present` (#6), `sandbox-manifest-reachable` (#7) with optional deploy-all action, `learning-output-style` (#8 — defensive re-check that calls cycle 1's `outputStyle.ts`; no logic duplicated, just a re-invocation point in case the user disables the plugin between `/start` gate and preflight).
- `runPreflightProbe` tool: gate `action.kind === 'shell'` behind explicit `remediate: true` param; the slash command must surface the command to the student first.
- **Two-mode deploy probe** with strict harness contract:
  - `E2E_DEPLOY_STUB=1` is the ONLY entry to the stub path. No other env var, no flag, no JSON config switch.
  - Absence of `E2E_DEPLOY_STUB` + explicit student approval (the `remediate: true` slash-command flow) is required to enter the real-deploy branch.
  - Docker-running and sandbox-repo-present probes (#1 and #6) still gate the real-deploy branch per AC-2.4 / AC-2.2 — even if approval is granted, those preconditions must hold.
  - Real branch spawns `pnpm deploy-all --quick` against `~/workspace/deepbook-sandbox/sandbox/` with timeout + log streaming.

**Risk hotspots.**
- **`runPreflightProbe` is the only tool that may emit `action.kind == "shell"`** (per agent-config.md invariant 7). Any other tool emitting shell actions is a spec violation. Reviewer "security" dimension should enforce this.
- **Probe ordering follows the spec table verbatim**: Docker first (cheap, deterministic stop); learning-output-style last as a defensive re-check after all environmental probes pass. Don't re-order without amending spec.md.
- **Probe #8 is not a duplicate of `/start`'s output-style gate** — it's a single shared module (`outputStyle.ts`) called twice. Reviewer should confirm no second copy of the settings-file parsing exists.
- **Real Docker invocation IS exercised in cycle 3** (E-008's contract path). The cycle's red/green tests use the stub branch (`E2E_DEPLOY_STUB=1`); the real-invocation path is unit-tested via injection seams (timeout handling, log streaming) and end-to-end-tested in Phase F.

---

## Cycle 4 — `phase-engine-personalization-first-spot`

**Scope.** Phase progression engine, bounded personalization (poll_interval_ms + pool_subset), `nextSpot` / `verifySpot` adapters, and the actual `phases.json` content for orderbook-viewer phase 1 (manifest→SDK config spot, lines 39–58).

**spec.md sections covered.**
- `## Lesson Flow (end-to-end)`
- `## Personalization Options (orderbook-viewer)`
- `## MCP Tools` rows for `selectPath`, `setPersonalization`, `nextSpot`, `verifySpot`.
- The `verification` sub-schema portion of registry.
- `paths/01-orderbook-viewer/phases.json` content for phase 1 (the manifest→SDK config spot).
- `paths/01-orderbook-viewer/reference/App.tsx` reference snapshot.

**ACs covered.** AC-4.1, AC-4.2, AC-4.3, AC-6.1, AC-6.2, AC-6.3.

**E2E scenarios brought online.**
- E-001 — cold-start happy path reaches phase 1 spot 1 (largest scenario; depends on cycles 1–3).
- E-014 — personalization values appear as substitutions; do not alter spot file/range.

**Dependencies on prior cycles.** Cycles 1, 2, 3.

**Suggested tech surface.**
- `mcp/server/src/tools/{selectPath,setPersonalization,nextSpot,verifySpot}.ts`.
- `mcp/server/src/verify.ts`: `compile | test | simulate | custom` adapters. Phase 1's spot uses `compile` per spec.md's phases.json example and Verification sub-schema; cycle 4 must wire `compile` (e.g. `pnpm build` / `tsc --noEmit` against the student's working tree). Do not substitute `custom` to dodge the build dependency — surface the dependency instead.
- `paths/01-orderbook-viewer/phases.json` with phase 1 fully populated: spot id `p1-spot-1`, `target_file=src/App.tsx`, `target_range=39-58`, hint/reference/auto-write payloads, doc_links.
- `paths/01-orderbook-viewer/phases/p1-bootstrap.md` explainer.
- `paths/01-orderbook-viewer/reference/App.tsx` (full file copied from `~/workspace/deepbook-sandbox-evaluation-apps/01-orderbook-viewer/src/App.tsx`).
- Personalization template substitution: `{{poll_interval_ms}}` / `{{pool_subset}}` resolved in spot prompts only; never alter `target_file` / `target_range`.

**Risk hotspots.**
- **`AC-4.1` is a schema invariant**, not an e2e assertion: `phases.json` validation must reject any phase with zero spots. Test-author should produce a unit test for this *in addition to* E-001.
- **Personalization cannot alter file/range** (E-014's explicit assertion). Reviewer "correctness" should flag any path where personalization values reach the `target_file` / `target_range` fields of the spot record.
- **Doc-link rendering**: spec says "doc links resolved" — clarify with cycle-1 contract whether this means inline-fetched or rendered as fetchable hyperlinks. Default to fetchable hyperlinks (low-risk); if E-001 contract demands inline fetch, escalate.
- **First-spot verification mode** is `compile` per spec.md phases.json example (line ~250). Cycle 4 wires the `compile` adapter against the student's working tree (whatever `path.json` declares as the build command). The plugin orchestrates the build but does not own the dapp's build config.

---

## Cycle 5 — `help-ladder-three-rungs`

**Scope.** Three-rung ladder (hint → reference → auto-write) with append-only flag semantics and gating on prior-rung use; `requestHint` tool implementation.

**spec.md sections covered.**
- `## Help-Ladder Protocol`
- `## MCP Tools` row for `requestHint`.
- The ladder portions of `## Failure Modes`.

**ACs covered.** AC-5.1, AC-5.2, AC-5.3, AC-5.4.

**E2E scenarios brought online.**
- E-004 — full traversal: hint → reference → Claude finishes → phase advances on `verifySpot` pass.

**Dependencies on prior cycles.** Cycles 1, 2, 4 (needs phase engine).

**Suggested tech surface.**
- `mcp/server/src/tools/requestHint.ts`: enforces rung ordering (rung 2 requires rung 1 used; rung 3 requires rung 2 used).
- State mutations: append-only `state.ladder[spot] = { hint_used, reference_shown, auto_completed }` flags (matches spec.md State Schema and Help-Ladder Protocol).
- Auto-complete (rung 3) writes the reference block into `target_file` at `target_range`, calls `verifySpot`, and only advances if verify passes (AC-5.3).
- `agents/course-conductor.md`: subagent spec for the conductor that sequences spot → hint → reference → auto.

**Risk hotspots.**
- **Rung gating must reject out-of-order requests** with a structured error, not silently succeed. Test-author should produce tests for `requestHint(rung=2)` when `hint_used=false`.
- **`auto_completed` is set on rung-3 invocation and never cleared** (AC-5.4). Even if `verifySpot` fails post-auto-write, the flag stays set permanently — but per spec.md Help-Ladder Protocol the student MAY re-attempt the spot; only `auto_completed` is the irreversible signal that rung 3 was used. Reviewer should grep for any code that clears `auto_completed`, AND should confirm a failed rung-3 doesn't lock the student out of further attempts.
- **No silent overwrite on auto-write**: if the student already wrote into `target_range`, rung-3 must back up the existing content (e.g. to `<project>/.sui-deepbook-course/snapshots/<spot-id>.bak`). This is implicit from spec's append-only philosophy but worth flagging.

---

## Phase F — `e2e-review` (post-cycle)

After cycle 5's `consolidated-review` passes, the orchestrator runs Phase F:

- Extracts `.forge/spec.md`'s `## E2E Tests` into `.forge/e2e/scenarios.json` (all 16 scenarios).
- Dispatches `code-forge:reviewer` ×N with `MODE=e2e` for every scenario.
- **E-008** runs the real `pnpm deploy-all --quick` against `~/workspace/deepbook-sandbox/sandbox/`. The implementation lives in cycle 3; Phase F is just the execution gate. Docker-gated: if Docker is unavailable, the harness skips with explicit message and the e2e gate accounts for it.
- Failing scenarios spawn a remediation cycle (cap = 3) whose contract derives from the gap.

Phase F is not a cycle — it's the e2e gate. Listed here for completeness only.

---

## Coverage matrix

| AC | Cycle | E2E |
|----|-------|-----|
| 1.1 | 1 | E-002 |
| 1.2 | 1 | E-001 (via cycle 4) |
| 1.3 | 1 | E-002 |
| 2.1 | 3 | E-001 (via cycle 4), E-003 |
| 2.2 | 3 | E-009 |
| 2.3 | 3 | E-007, E-008 |
| 2.4 | 3 | E-010 |
| 2.5 | 3 | E-011 |
| 3.1 | 1 | E-005 |
| 3.2 | 1 | E-012 |
| 3.3 | 1 | E-013 |
| 4.1 | 4 | (schema invariant; unit test) |
| 4.2 | 4 | E-001 |
| 4.3 | 4 | E-004 (via cycle 5) |
| 5.1 | 5 | E-004 |
| 5.2 | 5 | E-004 |
| 5.3 | 5 | E-004 |
| 5.4 | 5 | E-004 |
| 6.1 | 4 | E-001 |
| 6.2 | 4 | E-001 |
| 6.3 | 4 | E-014 |
| 7.1 | 2 | E-015 |
| 7.2 | 2 | E-006 |
| 7.3 | 2 | E-016 |
| 7.4 | 2 | E-001 (via cycle 4) |

Every AC has a cycle owner. Every E2E scenario has a cycle owner (cycle 3 owns E-008's implementation; Phase F is the execution gate).
