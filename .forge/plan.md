# Forge Plan: sui-deepbook-course (first prototype)

This is the refined planning prompt produced by claudex (Codex↔Claude convergence) plus the user's plan-mode answers. It is the input to the forge planner subagent in Phase 1.

## User decisions (locked)

- **MVP scope**: Ship **only `01-orderbook-viewer` end-to-end**, but ship the registry abstraction with it so the remaining two paths (`02-fee-rebate-swap`, `03-dca-vault`) are drop-in content for a later cycle. Future work: add the other paths' `phases.json` and reference snapshots without touching plugin internals.
- **E2E sandbox policy**: E2E tests **hit a real sandbox** — they invoke `pnpm deploy-all --quick` against `~/workspace/deepbook-sandbox/` and probe `http://localhost:9009/manifest`. This makes the suite slow (~3–5 min cold, ~1–2 min warm) and requires Docker Desktop running, but ensures the deploy-all integration is actually validated. Forge cycles must respect this — no mocking sandbox calls in green/red paths that the e2e suite later exercises.

---

## Planning prompt (refined, converged via claudex)

You are the forge planner subagent. Your outputs in this turn are planning artifacts only: `spec.md`, `agent-config.md`, an `## E2E Tests` section appended to `spec.md`, and a `cycle-plan.md`. You are not implementing code in this turn.

`agent-config.md` here means the **forge orchestration config** (recommended_agents block, project_domains, required_subagents) — it is **not** the per-lesson AGENTS.md fragments the plugin itself will ship to students. Keep those concepts separate.

## Task

Build a first prototype of `sui-deepbook-course` in `/Users/alilloig/workspace/sui-mcp-course/` — a Claude Code plugin that interactively guides students through building a small DeepBook dapp inside their own Claude Code session.

The local repository is effectively greenfield: only `CLAUDE.md` and `create-mastra-architecture-report.md` are expected to exist. Confirm that first; do not invent local files or conventions.

All material implementation examples live in external paths cited below. Treat them as read-only design inputs, not files to modify.

**MVP scope is locked**: ship `01-orderbook-viewer` end-to-end + the registry abstraction. The other two paths exist as future-work content drops; do not include their phase manifests or reference snapshots in the MVP.

**E2E sandbox policy is locked**: e2e tests hit a real sandbox via `pnpm deploy-all --quick`. Plan the e2e harness to manage that lifecycle (skip-if-already-deployed, teardown on suite end, clear failure messages if Docker is not running).

## Operating rules

- Investigate before planning. Do not jump straight to architecture.
- Resolve questions from disk first. Use `AskUserQuestion` only when:
  - the answer cannot be determined reliably from the local repo, cited external artifacts, or inspected installed plugins, AND
  - the ambiguity materially changes MVP scope, architecture, persistence, or validation behavior.
- One `AskUserQuestion` maximum per ambiguity.
- Distinguish validated fact from assumption. If unverified, label it.
- Do not assume Claude Code plugin APIs or runtime behaviors that you cannot verify from inspected plugins or visible documentation on disk. **Do not rely on undocumented Claude Code internals even if they appear plausible from filesystem artifacts alone.**

## Required investigation

### 1. Confirm local repo baseline

Confirm `/Users/alilloig/workspace/sui-mcp-course/` is greenfield. Read `CLAUDE.md` and `create-mastra-architecture-report.md`. After confirming, do **not** spend cycles searching for nonexistent local plugin internals.

### 2. Inspect real Claude Code plugin conventions

Inspect at least two installed plugins:
- `~/.claude/plugins/code-forge-v2/`
- `~/.claude/plugins/sui-pilot/`

(plus any others discoverable under `~/.claude/plugins/`)

Validate actual conventions for:
- `plugin.json` schema (name, version, description, components)
- slash command files under `commands/*.md` (frontmatter, body conventions)
- agent prompt files under `agents/*.md` (frontmatter, tool gating, model)
- skill layout under `skills/*/SKILL.md`
- hooks layout under `hooks/`
- MCP configuration via `.mcp.json` at plugin root or `mcp/` directory; how the MCP server is launched (`${CLAUDE_PLUGIN_ROOT}` substitution)
- how commands invoke agents/skills/MCP tools
- where existing plugins persist user or project state, if anywhere

When you later claim a convention, cite which inspected plugin path established it (file:line where useful).

### 3. Read external design inputs just enough to validate claims

Reference implementations (read only what's needed):
- `/Users/alilloig/workspace/deepbook-sandbox-evaluation-apps/01-orderbook-viewer` **(MVP path — read in depth)**
  - `src/App.tsx` lines 39–58 (manifest→SDK config), 103–114 (gRPC retry), 116–145 (polling tick)
- `/Users/alilloig/workspace/deepbook-sandbox-evaluation-apps/02-fee-rebate-swap` *(future work; light skim only)*
  - `sources/fee_rebate_swap.move` lines 74–96 and 99–106
  - `scripts/deploy.sh` lines 40–68
- `/Users/alilloig/workspace/deepbook-sandbox-evaluation-apps/03-dca-vault` *(future work; light skim only)*
  - `contracts/sources/dca_vault.move` lines 88–133
  - `keeper/src/keeper.ts` lines 63–92, 94–111, 150–164

Sandbox stack:
- `/Users/alilloig/workspace/deepbook-sandbox/`
- Validate (don't re-derive):
  - boot: `pnpm deploy-all --quick` from `sandbox/`
  - health: `GET http://localhost:9009/manifest`
  - hard prereqs: Docker Desktop with 8GB RAM, Node 18+, pnpm, Sui CLI 1.63.2 through 1.64.1, git submodules
  - no existing MCP server bundled

Architecture reference:
- `/Users/alilloig/workspace/sui-mcp-course/create-mastra-architecture-report.md`
- Reuse only what fits a Claude Code plugin: `DeepBookCourse → DeepBookModule → DeepBookLesson` schema, verification modes (`compile | test | simulate | custom`). Drop the npx-wrapper tier unless inspected plugin conventions require it.

## User vision to preserve

1. `/sui-deepbook-course:start` is the entry point.
2. Plugin's MCP refuses to run unless Claude Code's output style is `learning`.
3. Student selects one of three bundled paths; each ships a full reference impl. **For MVP, only `01-orderbook-viewer` is wired end-to-end; the other two appear as "coming soon" or are gated.**
4. Preflight: Docker, Node 18+, pnpm, Sui CLI in range, `sui-pilot` plugin, `~/workspace/deepbook-sandbox/` cloned + deployed (`pnpm deploy-all --quick` if not). Walk through anything missing.
5. Concise action plan + bounded `AskUserQuestion`-driven personalization within the chosen path's scope.
6. Per phase, student writes the most interesting 5–10 lines (mapped spots above). Plugin supplies relevant doc links.
7. Help ladder is explicit opt-in: hint → reference block → Claude finishes + advances.
8. Adding a fourth path is drop-in content, not plugin-internal surgery.

## Decisions you must make and justify

Push back where needed. Optimize for a slim-but-real first prototype.

1. **Output-style enforcement** — inspect candidate signals (settings files, env vars, runtime introspection) before deciding. Classify as exactly one of: **hard enforcement** | **soft enforcement** | **unverifiable, with explicit UX fallback**. Recommend exact refusal behavior and where it lives. Do not rely on undocumented Claude Code internals.
2. **Plugin component split** — `commands/`, `agents/`, `skills/`, `mcp/`. Ground in inspected plugin conventions.
3. **Progress + help-ladder state** — where to persist per-project state (phase progress, hint/reference/auto-complete rung usage). Tie to actual plugin capabilities and recovery behavior.
4. **Personalization within scope (MVP path = orderbook-viewer)** — bounded options that change *parameter values only*: no schema changes, no swappable templates, no path branching. Examples: poll interval, pool subset, render style.
5. **Registry shape** — minimal viable registry that makes a fourth path discoverable without code changes. Be explicit about discovery mechanism: filesystem scan, top-level index manifest, or a verified plugin-friendly mechanism. State the operational meaning. The MVP must implement this fully even though only one path is wired end-to-end — that's the whole point of the abstraction.
6. **Interesting-code-spots manifest** — minimal shape covering: file/range, prompt text, hint ladder, reference snippet mapping, doc links, verification mode.
7. **Failure modes + prototype boundary** — classify each as: **auto-recoverable** | **guided user action** | **explicit stop**. Cover at least: unsupported Sui CLI version, missing Docker, missing `sui-pilot`, sandbox repo absent, sandbox port collision, manifest unreachable after deploy, learning-style enforcement failure, corrupted/missing state file, path metadata out of sync with bundled reference files.

## Required output format

### A. Planning preface

Three short sections before the spec body:

#### Validated findings
- Concrete facts established from local repo, inspected plugins, and external artifacts.
- Each plugin convention claim must cite the inspected plugin path that demonstrated it.

#### Assumptions
- Bullet list of assumptions made because they could not be fully validated.

#### Open questions
- Only questions that materially affect the plan.
- If a blocker question must go to the user, ask it via `AskUserQuestion` (max 1 per ambiguity).
- If no blocking questions remain, state that explicitly.

### B. `spec.md` body

Markdown with these sections in this order:

- `## Goal` — one short paragraph
- `## Non-Goals` — one short paragraph
- `## MVP Scope Decision` — one short paragraph reaffirming the locked decision (orderbook-viewer + registry abstraction; future-work paths are content drops).
- `## Plugin Layout` — concrete file tree (e.g., `plugin.json`, `commands/start.md`, `agents/...`, `skills/...`, `mcp/server.ts` OR `mcp/server.js`, `paths/<slug>/{description.md, phases.json, reference/...}`, `package.json` if Node MCP). One-line explanation each.
- `## Registry Schema` — concrete JSON for top-level registry index (if used) and per-path phase manifest, including the interesting-code-spots sub-schema.
- `## State Schema` — concrete JSON shape and file location for per-project state.
- `## MCP Tools` — for each: name, params (typed), return shape, caller (slash command? agent? user?).
- `## Output-Style Enforcement` — chosen mechanism, evidence level (hard/soft/unverifiable), exact behavior on failure.
- `## Preflight Checks` — ordered list, each with exact probe (command, file path, or HTTP check) and the failure message.
- `## Lesson Flow` — end-to-end student flow: command entry, path selection, personalization, phase progression, validation, help ladder.
- `## Help-Ladder Protocol` — exact three-rung transitions and state side-effects.
- `## Personalization Options` — exhaustive list for orderbook-viewer. Each option: param name, type, range/enum, default.
- `## Failure Modes` — table: `condition | detection | classification (auto/guided/stop) | user-facing message | recovery`.
- `## Acceptance Criteria` — flat bullet list, each individually testable.
- `## Future Work` — explicit list of things deliberately excluded (the other two paths' phase manifests + reference snapshots, anything else excised from MVP). The planner should park excluded ideas here rather than silently dropping them.

### C. `## E2E Tests` (appended to `spec.md`)

Cover at minimum:
1. Cold-start happy path: output style set, prereqs OK, sandbox already deployed, student reaches phase 1.
2. Output-style refusal path.
3. Preflight failure path: one missing prerequisite, guided remediation.
4. Help ladder full traversal for one orderbook-viewer phase: hint → reference block → Claude finishes + advances.
5. Registry extensibility: drop a fake fourth path on disk; plugin discovers + offers it without code changes.
6. State recovery: corrupted/partial state file is handled per spec.
7. Sandbox deploy timeout or manifest-unreachable.
8. Real sandbox deploy flow: `pnpm deploy-all --quick` invocation succeeds against `~/workspace/deepbook-sandbox/` and the plugin proceeds (this is gated by Docker availability — document the gate).

Each scenario is a numbered list of `(actor action → expected observable)`. CLI/MCP scenarios runnable in the e2e harness; UI/browser scenarios specify the harness explicitly (e.g. `chrome-devtools-mcp:chrome-devtools` skill).

### D. `agent-config.md` (forge orchestration config)

Concise planner-facing config:
- `recommended_agents`: which subagent roles the implementer cycles should use (e.g., `sui-pilot:sui-pilot-agent` for any Move work, `general-purpose` for TS, etc.) — derived from inspected plugins and project tech stack. **If inspected plugins do not expose enough evidence to commit to specific agent bindings, mark this field as `provisional` rather than fabricate precision.**
- `project_domains`: which file-tree areas map to which agents.
- `required_subagents`: subagent types the orchestrator must use for specific cycles (test-author, implementer-worker, reviewer, consolidator come from forge itself).
- Hard prototype boundaries (what MVP excludes — should match `## Future Work` in spec.md).
- Key invariants implementer cycles must preserve (e.g., "no path-internals surgery for adding a 4th path", "registry MUST work for absent paths gracefully").
- Required environment assumptions for local dev and e2e (Docker Desktop, Sui CLI version, ~/workspace/deepbook-sandbox/ checkout).

### E. `cycle-plan.md`

Propose 3–6 ordered implementation cycles. For each:
- cycle name
- scope (1 sentence)
- `spec.md` sections covered
- E2E scenarios brought online

Do not over-decompose. Each cycle should bring at least one E2E scenario online (except possibly cycle 1, which may be pure scaffolding).

## Quality bar

- Concrete file paths, command strings, JSON shapes only.
- No invented Claude Code APIs.
- No invented local repo files beyond what the plan explicitly proposes to create.
- Distinguish validated fact from assumption.
- Keep the prototype intentionally narrow; list future work explicitly in the dedicated section instead of silently including it.
- Optimize for downstream `red`/`green` cycles with minimal ambiguity.

## Final instruction

The result must be specific enough that the forge orchestrator can immediately drive cycle 1's `contract → test-list → red → green → review` without further clarification. If you cannot validate a key convention or runtime capability from disk, say so clearly, downgrade the design accordingly, and plan around that limitation instead of hand-waving.
