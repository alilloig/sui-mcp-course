# Forge Resume Notes

**Last updated**: 2026-04-28 (end of pre-cycle work, start of cycle 1).

## State

| Phase | State |
|---|---|
| Phase 0 (plan) | ✓ done — `plan.md` validated, claudex-converged |
| Phase 1 (spec & e2e + agent-config) | ✓ done — `spec.md`, `agent-config.md` validated |
| Phase 2 (cycle-plan) | ✓ done — `cycle-plan.md` validated, Codex G2.5 CONVERGED |
| Cycle 1 (`scaffold-registry-and-output-style`) | **⏸ contract complete; next phase is `test-list`** |

`state.json` is at `phase: cycle, current_cycle: 1, total_cycles: 5`.

## How to resume in a fresh session

1. Run `/forge` from the repo root. The forge skill reads `.forge/state.json` and the orchestrator should pick up at cycle 1 / test-list per the orchestrator manual ("Phase 0a — Resume check").
2. The forge subagents (`code-forge:planner`, `code-forge:test-author`, `code-forge:implementer`, `code-forge:implementer-worker`, `code-forge:reviewer`, `code-forge:consolidator`) **will be dispatchable in a fresh session** because the agent registry is rebuilt at session startup. They were not dispatchable mid-session here because the plugin was renamed (`code-forge-v2` local → `code-forge` on contract-hero marketplace) after this session started.
3. Confirm `CLAUDE_PLUGIN_ROOT` resolves to `/Users/alilloig/.claude/plugins/cache/contract-hero/code-forge/0.1.0/` (the `state.json` records this).

## Locked decisions (from plan-mode AskUserQuestion answers)

- **MVP scope**: `01-orderbook-viewer` end-to-end + registry abstraction. `02-fee-rebate-swap` and `03-dca-vault` are explicit Future Work (see `spec.md` `## Future Work`).
- **E2E sandbox policy**: e2e tests **hit a real `~/workspace/deepbook-sandbox/`** via `pnpm deploy-all --quick`. E-008 is Docker-gated; cycle 4 + Phase F own it.

## Cycle 1 contract summary

`.forge/cycles/1/contract.md` is filled in with:
- 22 files in scope (plugin manifest, MCP server skeleton, registry, output-style probe, MVP path stub, unit tests, harness skeleton)
- 14 testable acceptance criteria (A1–A14), the most load-bearing being:
  - A4: zero filesystem writes when `outputStyleOk === false` (AC-1.3 invariant)
  - A6: drop-in fake fourth path discovered without engine code changes (AC-3.1 unit-level proof)
  - A10: zero `01-orderbook-viewer` literals outside `paths/01-orderbook-viewer/` (engine parametricity grep)
  - A13: `outputStyle.ts` reads ONLY `~/.claude/settings.json` — no env vars, no parent-process inspection, no system prompt scraping
  - A14: only `start` (this cycle) and `runPreflightProbe` (cycle 3) may emit `action.kind == "shell"`; cycle 1 implements neither

Cycle 1 brings online E-002, E-005, E-012, E-013 (covers AC-1.1, 1.2, 1.3, 3.1, 3.2, 3.3).

## Open questions to resolve in cycle 1 (carried from spec.md preface)

1. Whether `enabledPlugins` in `~/.claude/settings.json` is the runtime source of truth or there's a separate override. Resolve by inspecting a real `~/.claude/settings.json` during cycle 1 implementation.
2. Whether `superpowers:general` is the correct dispatchable subagent identifier. The provisional `agent-config.md` flagged this. Cycle 1 can smoke-test by attempting a dispatch.

## Mid-session migration record

This run was started under `code-forge-v2` (local plugin at `~/.claude/plugins/local/code-forge-v2/`) and migrated mid-flight to `code-forge` (contract-hero marketplace at `~/.claude/plugins/cache/contract-hero/code-forge/0.1.0/`). All artifacts re-validated cleanly under the new plugin's `cycle-validate.sh`. The orchestrator manual diff was minor (rename + the new "Phase 0a — Resume check" section + state.json optional `paused`/`pause_history` fields). Subagent identifiers changed from `code-forge-v2:forge-*` to `code-forge:*` (no `-v2` suffix; `forge-` prefix removed from names like `planner`, `test-author`).
