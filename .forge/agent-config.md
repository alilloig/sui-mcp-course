---
project_domains:
  # No Move source in this project — it is a Claude Code plugin (TypeScript) that
  # *coaches* Sui/DeepBook work but never compiles Move itself. Therefore we do NOT
  # tag sui-dapp/walrus/seal here; that would force sui-pilot for source-touching
  # roles, but the source is plain TypeScript MCP code, not Move. The plugin
  # consumes external Sui/DeepBook artifacts (the deepbook-sandbox under
  # ~/workspace/) but does not author them.

required_subagents:
  # Reserved for correctness-grade specialists. None applicable here:
  # the plugin authors no Move and no Sui Move.toml. Plugin-internal TypeScript
  # is best handled by general-purpose with sui-pilot consulted for advice on
  # the DeepBook SDK behavior the curriculum teaches (see recommended_agents).
  []

recommended_agents:
  # Soft roster, ordered by suitability for this project. User-favoritism applied:
  # sui-pilot first because it is the canonical Sui/DeepBook knowledge source
  # for this curriculum's content (even though it does not author the plugin
  # itself). Then superpowers (user-favored, broadly useful for plugin/agent
  # design). Then general-purpose for routine TS work.
  - subagent_type: "sui-pilot:sui-pilot-agent"
    rationale: "Owns the DeepBook v3 SDK, sandbox, and Move/Sui doc index. The plugin's curriculum content (phases, hints, references, doc_links) is authored against these docs; cycles that touch paths/01-orderbook-viewer/ should consult sui-pilot for accuracy."
    suitable_for: [planner, test-author, implementer-worker, reviewer]
    domain_relevance: high
  - subagent_type: "superpowers:general"
    rationale: "User-favored generalist roster useful for Claude Code plugin scaffolding, TypeScript MCP server skeletons, and plugin convention guidance."
    suitable_for: [planner, implementer-worker, reviewer]
    domain_relevance: medium
  - subagent_type: "general-purpose"
    rationale: "Default fallback for routine TypeScript MCP server work that does not touch DeepBook content."
    suitable_for: [implementer-worker, test-author, reviewer]
    domain_relevance: medium

provisional: true
provisional_reason: "Inspected plugins (sui-pilot, code-forge-v2, learning-output-style) demonstrate plugin-layout conventions but do not establish a binding between forge subagent role and Claude Code plugin agent identifier beyond sui-pilot's own agent (`sui-pilot:sui-pilot-agent`). The `superpowers:general` and `general-purpose` entries above are the recommended logical roles; cycle 1 may need to confirm the exact subagent_type strings the orchestrator can dispatch in this environment and tighten if those strings are incorrect."
---

# Routing decisions

## Why no `project_domains` tag

The project is a Claude Code plugin (TypeScript) that *teaches* Sui/DeepBook through a DeepBook localnet sandbox the student already has. The plugin's source code is not Move and does not include `Move.toml` — only the curriculum content under `paths/01-orderbook-viewer/reference/` references `@mysten/deepbook-v3` and `@mysten/sui` as the dapp-under-instruction's runtime dependencies, not as the plugin's own.

Per forge-guard rule 6, tagging `sui-dapp` here would force `sui-pilot:sui-pilot-agent` for every source-touching role dispatch — including cycles that author the MCP server's `registry.ts`, `state.ts`, etc., which are pure TypeScript with no Sui-specific surface. That would be a misroute. We instead surface sui-pilot at the top of `recommended_agents` so cycles touching curriculum content (`paths/`, `description.md`, `phases.json`, `rungs/*.md`, `reference/App.tsx`) explicitly opt into it.

If a future cycle adds a plugin-internal Move package (none planned), we revisit and add `sui-dapp` here.

## Why no `required_subagents` glob bindings

The same logic. A `Move.toml` glob binding to `sui-pilot` would do nothing because no Move.toml will exist in this repo. A `**/*.move` binding likewise would be dead weight. Avoid noise; keep `required_subagents` empty.

## `recommended_agents` ordering rationale

1. **`sui-pilot:sui-pilot-agent`** — established at `/Users/alilloig/.claude/plugins/cache/alilloig/sui-pilot/0.1.0/agents/sui-pilot-agent.md`. User-favored. Even for non-Move work, sui-pilot's bundled doc index (`.sui-docs/`, `.move-book-docs/`, `.ts-sdk-docs/`, `.walrus-docs/`, `.seal-docs/`) is the source of truth for the DeepBook SDK behavior the orderbook-viewer reference exercises (gRPC retry quirk, manifest object disambiguation, `simulateTransaction` semantics). Any cycle authoring `paths/01-orderbook-viewer/*` content should consult sui-pilot.
2. **`superpowers:general`** — user-favored per the planner manual; useful for plugin scaffolding decisions (skill/agent/command split) and TypeScript MCP server layout.
3. **`general-purpose`** — explicit fallback for routine TS work that does not touch the curriculum content.

The roster is marked **provisional** because we did not directly inspect a forge dispatch resolving these subagent_type strings. Cycle 1 should confirm by smoke test (e.g. successfully dispatching `superpowers:general` once) and tighten this file if the exact identifier differs.

# Hard prototype boundaries (must match `## Future Work` in spec.md)

Cycles must NOT:

- Author content for `paths/02-fee-rebate-swap/` or `paths/03-dca-vault/`. Those are explicitly future-work content drops; they do not block any AC.
- Implement a `render_style` personalization beyond the schema-only mention in `## Future Work`.
- Implement any mechanism that pretends to read the active Claude Code output style at runtime (no documented API; spec classifies enforcement as soft).
- Add network egress beyond `localhost:9009/manifest` and `localhost:9000` (Sui RPC).
- Add a `paths/` index file. Discovery is a directory scan.
- Mock `pnpm deploy-all --quick` in cycles that touch the e2e harness's real-deploy scenario (E-008). Scenarios E-007 stubs deploy-all on purpose; E-008 must invoke the real one against `~/workspace/deepbook-sandbox/sandbox/`.

# Key invariants implementer cycles must preserve

1. **Registry is filesystem-driven.** A new `paths/<slug>/` directory with valid `path.json` + `phases.json` must surface in the selection prompt without code changes (AC-3.1). No hardcoded path lists in engine code; no compiled index.
2. **`paths/` absent = explicit message, not crash.** AC-3.3.
3. **Engine knows nothing path-specific.** All path-level logic must be parametric over the manifest. No `if (slug === "01-orderbook-viewer")` branches.
4. **Spot manifest has all three rungs.** Schema validation must reject a spot missing any of `rungs.{hint_md, reference_md, auto_write_md}` (this is the schema-only AC-4.1 obligation).
5. **State writes are atomic** (write-tmp-then-rename). State corruption must not be possible from a partial write.
6. **Output-style enforcement is soft.** No code may claim to read the active output style; only `enabledPlugins` checks are valid signals.
7. **No shell execution without explicit student approval.** `runPreflightProbe` is the only tool that may emit `action.kind == "shell"`, and the slash command must surface the command for approval before invocation.
8. **Help-ladder rungs are append-only.** Once a rung flag is set in `state.ladder[spot]`, it is never cleared (AC-5.4).
9. **MVP personalization is two parameters only** (`poll_interval_ms`, `pool_subset`). `render_style` is parked.

# Required environment assumptions

For local dev:

- **macOS (Apple Silicon)** — sandbox docs are written for `mysten/sui-tools:compat-arm64`. Other archs work but are not the primary target.
- **Node 18+** with **pnpm** (`npm install -g pnpm`).
- **TypeScript** for everything in `mcp/server/` and `scripts/e2e/`.
- **Claude Code** with plugins enabled and `learning-output-style@claude-plugins-official` enabled in `~/.claude/settings.json`.

For the e2e suite:

- **Docker Desktop** running with at least 8 GB allocated. Without Docker, scenario E-008 explicitly skips with a clear message; all other scenarios run.
- **`~/workspace/deepbook-sandbox/`** checked out with submodules. Scenarios E-009 (which moves it aside temporarily) and E-008 depend on this.
- **Sui CLI 1.63.2 through 1.64.1** on PATH for preflight to pass. Scenario E-011 stubs an out-of-range version on purpose.
- **e2e suite runtime budget**: warm path (sandbox already deployed) ~3–5 minutes; cold path (E-008 cold deploy) up to ~10 minutes. Suite is gated as a slow integration suite, not run on every cycle.
- **Cleanup**: E-008 runs `pnpm down` on teardown; the harness should not leak Docker containers between runs.

# Notes for the orchestrator

- The plan input is `.forge/plan.md`; the locked decisions there (MVP path = `01-orderbook-viewer`; e2e hits real sandbox) flow into both `## MVP Scope Decision` and `## E2E Tests` sections of `spec.md`.
- `cycle-plan.md` (Phase 2) should produce 4–5 cycles that bring up: (1) plugin scaffold + registry + state + preflight, (2) phase engine + verify adapters + first spot wired, (3) help ladder, (4) e2e harness. The exact decomposition is the planner's call in mode `cycle-plan`.
- Forge cycles authoring TypeScript should consult sui-pilot only when touching `paths/01-orderbook-viewer/` content. For `mcp/server/src/*.ts` work, default to general-purpose.
