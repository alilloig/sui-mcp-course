# sui-deepbook-course — Specification

A Claude Code plugin that interactively coaches advanced Sui developers through building a DeepBook dapp. The student writes the few interesting lines per phase; Claude guides via an explicit hint → reference → auto-finish ladder.

## Validated findings

These are concrete facts established from disk, cited to the artifact that proves them.

- **Local repo is greenfield.** `/Users/alilloig/workspace/sui-mcp-course/` contains only `CLAUDE.md`, `create-mastra-architecture-report.md`, plus the `.forge/` and `.remember/` scaffolds the orchestrator already created. There are no plugin source files yet.
- **Claude Code plugin shape.** Inspected plugins agree on a layout rooted at `.claude-plugin/plugin.json` with optional siblings `commands/`, `agents/`, `skills/`, `hooks/`, `scripts/`, and (for MCP) a `mcpServers` block in `plugin.json`.
  - `code-forge-v2` at `/Users/alilloig/.claude/plugins/cache/local/code-forge-v2/0.2.0/` — has `.claude-plugin/plugin.json`, `commands/*.md`, `agents/*.md`, `hooks/{forge-guard.mjs,hooks.json}`, `skills/code-forge/`, `scripts/`.
  - `sui-pilot` at `/Users/alilloig/.claude/plugins/cache/alilloig/sui-pilot/0.1.0/` — same layout plus `mcp/move-lsp-mcp/` for the MCP server. Its `.claude-plugin/plugin.json` declares `"mcpServers": { "move-lsp": { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/move-lsp-mcp/dist/index.js"], "env": {} } }` — confirming `${CLAUDE_PLUGIN_ROOT}` substitution and node-launched MCP servers.
  - `learning-output-style` at `/Users/alilloig/.claude/plugins/cache/claude-plugins-official/learning-output-style/1.0.0/` — has `.claude-plugin/plugin.json`, `hooks/hooks.json`, and `hooks-handlers/session-start.sh` (note: the handlers directory is a top-level sibling named `hooks-handlers`, not `hooks/handlers`). The hook fires `SessionStart` and prints a JSON object whose `hookSpecificOutput.additionalContext` field is injected as system context.
- **No runtime "output style" API.** `learning-output-style`'s entire mechanism is a `SessionStart` hook that prints `additionalContext`. There is no observable "Claude Code is in output style X" signal a plugin's MCP server can read at request time. This is the strongest evidence on disk that "hard refusal when not in learning output style" is unverifiable through documented surfaces.
- **Plugin enablement signal.** `~/.claude/settings.json` carries `enabledPlugins: { "<name>@<source>": <bool>, ... }`. This is a deterministic on-disk signal a plugin can read for advisory checks (e.g. confirming `learning-output-style@claude-plugins-official` is enabled), though it is not Claude Code's source of truth at runtime.
- **DeepBook sandbox boot path.** `/Users/alilloig/workspace/deepbook-sandbox/sandbox/package.json` defines `"deploy-all": "tsx scripts/deploy-all.ts"` and `"down": "tsx scripts/down.ts"`. `README.md` documents `pnpm deploy-all --quick` as the shortcut path that uses pre-built Docker Hub images. Hard prereqs are Docker Desktop (8 GB), Node 18+, pnpm, Sui CLI 1.63.2–1.64.1, and `git clone --recurse-submodules`. Health endpoints surface on `localhost:9009` (DeepBook faucet, exposes `/manifest`), `:9000` (Sui RPC), `:9008` (REST), `:9010` (oracle), `:3001/health` (market maker).
- **Orderbook-viewer reference shape.** `/Users/alilloig/workspace/deepbook-sandbox-evaluation-apps/01-orderbook-viewer/` is a Vite + React 18 + TypeScript app. It depends on `@mysten/deepbook-v3 ^1.3.0` and `@mysten/sui ^2.5.1`. Three load-bearing spots in `src/App.tsx`:
  - **Lines 39–58**: `packageIds`, `coinMap`, `poolMap` — translate the sandbox manifest into the DeepBook SDK's wiring config.
  - **Lines 103–114**: `withRetry` helper — works around occasional empty `commandResults` from `simulateTransaction` over gRPC.
  - **Lines 116–145**: `tick` polling loop — fetches `midPrice` and `getLevel2TicksFromMid` every 3 s with a 3-failure-tolerance gate.
- **Forge spec validator constraints.** `cycle-validate.sh` requires `spec.md` to contain H1 plus `## Vision`, `## Core Features`, `## Architecture Overview`, and `## E2E Tests`. `agent-config.md` must have YAML frontmatter declaring `project_domains`, `required_subagents`, `recommended_agents`. Script: `/Users/alilloig/.claude/plugins/cache/local/code-forge-v2/0.2.0/scripts/cycle-validate.sh` lines 183 and 236.

## Assumptions

These are working assumptions where disk evidence is silent or weak. Each is testable; promote to validated finding or fold into Open Questions if a cycle hits a snag.

- **Slash-command → skill load is a documented Claude Code mechanic, not a plugin-internal call.** No inspected plugin demonstrates the exact wiring; we treat the slash command body as the canonical place to instruct Claude (in plain markdown) to load the skill, and the skill body as the canonical place to instruct Claude to invoke MCP tools. Cycle 1 confirms by smoke test before red.
- **Skill → agent handoff is a Claude judgement, not a runtime call.** The plugin cannot programmatically dispatch sub-agents from MCP. The skill's body instructs Claude to invoke the `course-conductor` agent for the phase loop; that is a content concern, not a runtime API. We do not depend on any "skill calls agent" API.
- The Claude Code plugin runtime exposes no documented per-request hook that lets an MCP server read the active output style. We treat output-style enforcement as **soft** and rely on a `SessionStart` hook + an MCP-side advisory check.
- Plugin commands (`.md` files in `commands/`) are surfaced to the user as `/<plugin-name>:<command>` slash commands, mirroring `code-forge-v2`'s `forge.md` → `/forge`. We will name our entry command `commands/start.md` and expect Claude Code to expose it as `/sui-deepbook-course:start`.
- Per-project state under `.sui-deepbook-course/` (sibling of `.forge/`) will survive across Claude Code sessions because it is a plain directory the plugin's MCP server writes to. No plugin we inspected persists per-project state, so we own the convention; we keep it transparent and hand-editable.
- The bundled DeepBook SDK's `simulateTransaction` quirk (empty `commandResults` under load) reproduces against the sandbox often enough that the retry helper from the reference is meaningful curriculum content for the polling phase.

## Open questions

Items that, left unresolved, would alter MVP scope or e2e behavior. The plan input ("E2E policy is locked") and explicit MVP gate close most major branches; the residual items below are tagged for cycle 1 to resolve from disk before the first red.

- Does `enabledPlugins` reflect the *actual* runtime enablement set, or is there a separate runtime override Claude Code consults? The plugin will treat `enabledPlugins` as the canonical signal and degrade gracefully if its assertion is wrong.
- Should the "Claude finishes + advances" rung commit changes to a working tree the student owns, or stage them separately for student review? The MVP picks "writes directly into student's repo and surfaces a recap." Cycle 3 (help-ladder cycle) confirms before red.

---

# Specification body

## Vision

`sui-deepbook-course` is a Claude Code plugin that turns "go learn DeepBook" into an actionable, per-session interactive course. The student opens Claude Code in a clean workspace, runs `/sui-deepbook-course:start`, and is walked through preflight, path selection, bounded personalization, and a phased rebuild of a small DeepBook dapp. The plugin owns the structure (preflight, phase progression, hint ladder, validation gates); the student owns the load-bearing 5–10 lines per phase. Claude is the patient TA, not the implementer.

The first prototype ships a single end-to-end path (`01-orderbook-viewer` — read-only DeepBook order book viewer in React) plus a registry abstraction so two more paths (`02-fee-rebate-swap`, `03-dca-vault`) drop in later as content, not code. The registry's correctness on the empty case is part of MVP; its content for the other two paths is explicitly future work.

### Goal

Ship a Claude Code plugin where running one slash command in a clean workspace produces a phase-by-phase, hint-ladder-mediated rebuild of `01-orderbook-viewer`, validated against a real DeepBook sandbox, with a registry abstraction that admits future paths as drop-in content.

### Non-Goals

- Beginner Move/Sui pedagogy.
- Wallet integration on the student side beyond what the read-only viewer needs (none).
- Hard runtime enforcement of Claude Code's output style (no documented API exists).
- Multi-student progress sync, marketplace publishing, or cloud state.

## MVP Scope Decision

We ship `01-orderbook-viewer` end-to-end through preflight, registry, phase manifest, help ladder, and verification. We ship the registry abstraction in full so a future content drop adds `02-fee-rebate-swap` and `03-dca-vault` as `paths/<slug>/` directories without engine changes. The other two paths' phase manifests and reference snapshots are explicitly excluded from MVP and listed in `## Future Work`.

## Out of Scope (MVP)

- Backend implementation paths beyond `01-orderbook-viewer`.
- Wallet integration on the student side.
- Auto-publishing the plugin to a marketplace (install path is `directory` source against the local repo).
- Network egress beyond `localhost:9009` and `localhost:9000`.
- Multi-student or cloud progress sync.

## Core Features

### F1. Slash-command entry that gates on output style

- **What it does**: `/sui-deepbook-course:start` checks that Claude Code is in `learning` output style. If yes, it proceeds to preflight; if no, it refuses with explicit guidance to enable the `learning-output-style` plugin.
- **Why**: The whole pedagogy depends on Claude not auto-implementing — that posture lives in the learning output style's prompt injection. Without it, the plugin's hint-ladder discipline is unenforceable from inside the plugin.
- **Constraints**: No documented runtime API exposes the active output style to MCP servers. Enforcement is **soft** (advisory + SessionStart hook + read of `~/.claude/settings.json`'s `enabledPlugins`).
- **Acceptance**: AC-1.1 If `learning-output-style@claude-plugins-official` is disabled in `~/.claude/settings.json`, `/start` returns a refusal message naming the plugin and the activation step. AC-1.2 If enabled, `/start` proceeds. AC-1.3 The refusal path leaves no on-disk state mutations.

### F2. Preflight that walks the student through each missing prerequisite

- **What it does**: Sequentially verifies Docker Desktop, Node 18+, pnpm, Sui CLI in the supported version range, `sui-pilot` plugin enablement, presence of `~/workspace/deepbook-sandbox/`, and a deployed sandbox (`localhost:9009/manifest` reachable). For each failed check, it surfaces a one-paragraph remediation with the exact command. Critically: if the sandbox repo is present but not deployed, preflight offers to run `pnpm deploy-all --quick` from `~/workspace/deepbook-sandbox/sandbox/`.
- **Why**: Without preflight, the first error a student hits is a 30-second Docker timeout buried inside the SDK polling loop. Preflight surfaces failures up front, classified as auto-recoverable, guided, or stop.
- **Constraints**: All probes must be filesystem reads, port checks, or deterministic CLI invocations. No network egress beyond the sandbox manifest probe.
- **Acceptance**: AC-2.1 Each preflight check reports pass/fail with a remediation pointer. AC-2.2 A missing `~/workspace/deepbook-sandbox/` produces a "guided" stop with the clone command. AC-2.3 If the sandbox is cloned but `:9009/manifest` returns nothing, preflight offers to invoke `pnpm deploy-all --quick` and reports back the result. AC-2.4 If Docker is not running, preflight emits an explicit stop and does not attempt deploy. AC-2.5 An unsupported Sui CLI version is a guided stop, not a hard stop.

### F3. Path registry with one wired path and a documented drop-in extension surface

- **What it does**: At `/start` time, the plugin enumerates `paths/<slug>/` directories under its plugin root, reads each `path.json`, and presents the discovered paths to the student. For MVP, only `01-orderbook-viewer` ships content; `02-fee-rebate-swap` and `03-dca-vault` are explicitly future work and are not in the registry until their content drops.
- **Why**: The user's vision item 8 — "adding a fourth path is drop-in content, not plugin-internal surgery" — only holds if the registry is filesystem-driven and tolerates absent paths. The MVP must implement that abstraction completely.
- **Constraints**: Registry is a directory scan; no compiled index. A path's metadata must self-describe: title, summary, prerequisites, phase manifest pointer, reference impl pointer.
- **Acceptance**: AC-3.1 Dropping a new `paths/04-fake-path/` with a valid `path.json` and `phases.json` surfaces it in the selection prompt without any code changes. AC-3.2 A malformed `path.json` is reported with file path and parse error and skipped. AC-3.3 An empty `paths/` directory produces an explicit "no paths installed" message rather than a stack trace.

### F4. Phased lesson flow with an interesting-code-spots manifest

- **What it does**: Each path declares its phases in `phases.json`. Each phase carries: an explainer prompt, a list of "interesting code spots" (file + line range + prompt for the student), per-rung hint/reference content, doc links, and a verification mode (`compile` | `test` | `simulate` | `custom`). The plugin walks phases in order, and within a phase, walks spots in order.
- **Why**: This is the load-bearing curriculum primitive. Without a structured spot manifest, "the student writes the most interesting 5–10 lines" devolves into a Claude judgement call.
- **Constraints**: Phases and spots are content; the engine must not need code changes to add a new spot.
- **Acceptance**: AC-4.1 Each phase has at least one spot. AC-4.2 The plugin renders the spot prompt in-Claude with the doc links resolved, then waits for the student to write into the indicated file/range. AC-4.3 Verification runs after every spot completion; failure routes to the help ladder.

### F5. Three-rung help ladder, explicitly opt-in

- **What it does**: When the student is stuck, the plugin offers three rungs in order: (1) **hint** — a one-paragraph nudge specific to the spot; (2) **reference block** — the exact reference snippet for the spot, presented for the student to type or paste deliberately; (3) **Claude finishes + advances** — Claude writes the spot's reference into the student's file and the phase advances. Each rung is a separate prompt; the student must opt in.
- **Why**: Mixing rungs collapses the pedagogy. Auto-advancing without consent is the failure mode this design rules out.
- **Constraints**: Each rung mutates state (`hint_used`, `reference_shown`, `auto_completed`). After auto-complete (rung 3) succeeds (verification passes), the spot is sealed and the phase advances. If the rung-3 auto-write *fails* verification, the engine surfaces the failure and the student may attempt the spot again — but the `auto_completed` flag remains set in state, so ladder usage is permanent.
- **Acceptance**: AC-5.1 Rungs are gated: rung N+1 is only offered after rung N. AC-5.2 Each rung records its use in state. AC-5.3 Auto-complete advances the phase only if verification passes after the auto-write. AC-5.4 `auto_completed` is set on rung-3 invocation and never cleared.

### F6. Bounded personalization within the chosen path

- **What it does**: For `01-orderbook-viewer`, the plugin asks at most two personalization questions in MVP (poll interval, pool subset). Answers are stored as parameters and threaded into spot prompts as substitution variables. No personalization changes the schema, the registry shape, or the phase order. Additional parameters (e.g. render style) are reserved for future phases (see `## Future Work`).
- **Why**: The user's plan-mode locked decision: personalization is parameter-only, no template branching.
- **Constraints**: All personalization options must be enumerable as `{name, type, range/enum, default}`.
- **Acceptance**: AC-6.1 The selection prompt only shows enumerable options. AC-6.2 Default values let the student skip the prompt entirely with a single "Use defaults" answer. AC-6.3 Personalization values surface in subsequent phase prompts as `{{ poll_interval_ms }}` style substitution and never alter the spot file/line manifest.

### F7. Per-project progress and help-ladder state, recoverable

- **What it does**: The plugin's MCP server persists state to `<student-project>/.sui-deepbook-course/state.json`. The state file records: selected path, personalization values, current phase index, current spot index, per-spot rung usage. On `/start`, an existing state file resumes the session.
- **Why**: Lessons span minutes-to-hours; sessions die. State that survives session death is not optional.
- **Constraints**: State is a single JSON file with a `schema_version`. Corrupted state must not crash the plugin: it is reported, archived to `.sui-deepbook-course/state.corrupt-<timestamp>.json`, and the student is offered "resume from phase 0" or "abort."
- **Acceptance**: AC-7.1 A clean re-run with valid state resumes at the recorded phase/spot. AC-7.2 An invalid JSON file produces the recovery prompt described above. AC-7.3 A schema version mismatch produces a guided stop, not a corruption recovery. AC-7.4 An absent state file (first run) is treated as a clean start, not an error.

## Architecture Overview

### Tech stack

- **Plugin runtime**: Claude Code plugin layout, mirroring `code-forge-v2` and `sui-pilot`.
- **Engine language**: TypeScript on Node 18+, executed via the plugin's MCP server (binary launched per `mcpServers` block in `plugin.json`, like sui-pilot's move-lsp-mcp at `${CLAUDE_PLUGIN_ROOT}/mcp/move-lsp-mcp/dist/index.js`).
- **Reference dapp**: React 18 + Vite + TypeScript, depending on `@mysten/deepbook-v3 ^1.3.0` and `@mysten/sui ^2.5.1`. The student's working tree mirrors `deepbook-sandbox-evaluation-apps/01-orderbook-viewer/`.
- **External integrations**: `~/workspace/deepbook-sandbox/` (read-only consumer of `pnpm deploy-all --quick`); `~/.claude/settings.json` (advisory read).

### Plugin Layout (concrete file tree)

This layout follows the inspected plugin conventions from `code-forge-v2/` and `sui-pilot/`. The hooks-handlers directory mirrors `learning-output-style/hooks-handlers/` (sibling of `hooks/`, not nested).

```
sui-deepbook-course/
├── .claude-plugin/
│   └── plugin.json                       # name, version, mcpServers, components
├── commands/
│   ├── start.md                          # /sui-deepbook-course:start
│   └── status.md                         # /sui-deepbook-course:status (read-only)
├── agents/
│   └── course-conductor.md               # Conducts a phase: explainer, spot, ladder
├── skills/
│   └── course-engine/
│       └── SKILL.md                      # Loaded by the /start command body
├── hooks/
│   └── hooks.json                        # SessionStart: warn if learning style off
├── hooks-handlers/
│   └── session-start.sh                  # Mirrors learning-output-style's layout
├── mcp/
│   └── server/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                  # MCP server entrypoint
│           ├── tools/                    # one file per MCP tool
│           ├── registry.ts               # path discovery (scans paths/)
│           ├── state.ts                  # per-project state I/O
│           ├── preflight.ts              # ordered probes
│           ├── verify.ts                 # compile/test/simulate/custom adapters
│           └── outputStyle.ts            # advisory check
├── paths/
│   └── 01-orderbook-viewer/
│       ├── path.json                     # registry entry
│       ├── description.md                # student-facing intro
│       ├── phases.json                   # phase + spot manifest
│       ├── phases/                       # per-phase explainer markdown
│       └── reference/
│           ├── App.tsx                   # full reference impl
│           ├── vite.config.ts
│           └── package.json
├── scripts/
│   └── e2e/
│       ├── harness.ts                    # boots sandbox, drives MCP, asserts
│       └── fixtures/
└── README.md
```

Per-path content lives entirely under `paths/<slug>/`. The engine knows nothing path-specific; everything load-bearing is in `phases.json`.

### Communication patterns

- **User → plugin**: slash command (`/sui-deepbook-course:start`). The command body (markdown) directs Claude to load the `course-engine` skill, which contains the protocol Claude follows. (We do not assume any "command runtime calls skill API"; the slash command file content is the contract.)
- **Skill → MCP tools**: the skill body is plain markdown that instructs Claude to call the listed MCP tools in order. MCP tools are real (declared via `plugin.json`'s `mcpServers`); skill-to-tool wiring is via Claude's tool-use, not a hidden Claude Code API.
- **Plugin → student's filesystem**: writes only inside `<student-project>/` (the cwd at command invocation), and only into the personalization-derived working directory plus `.sui-deepbook-course/`.
- **Plugin → sandbox**: HTTP probes against `localhost:9009/manifest` and `localhost:9000` (RPC); shell invocation of `pnpm deploy-all --quick` against `~/workspace/deepbook-sandbox/sandbox/` only when preflight asks.

### Data model concepts

- **Path** — a unit of curriculum, identified by slug. Owns description, phase manifest, reference snapshot.
- **Phase** — an ordered chunk of a Path. Owns explainer text, ordered spots, verification mode.
- **Spot** — one student-write moment. Owns target file/range, prompt, three-rung content (hint, reference, auto-write payload), doc links, verification mode.
- **State** — per-student-project rendezvous of "selected path × personalization × phase/spot cursor × ladder usage."

## Registry Schema

### Top-level discovery (no index file)

The registry is a directory scan: `paths/*/path.json`. There is no top-level `paths.json` index. Operational meaning: dropping a new directory under `paths/` is enough; the plugin discovers it on the next `/start`. The empty case (`paths/` exists but is empty) returns a "no paths installed" message; an absent `paths/` directory is a packaging error and the plugin halts with an explicit message.

### `path.json` (one per path)

```json
{
  "schema_version": 1,
  "slug": "01-orderbook-viewer",
  "title": "DeepBook Order Book Viewer",
  "summary": "Read-only viewer that polls midPrice and Level 2 ticks against a localnet sandbox.",
  "prerequisites": ["docker", "node>=18", "pnpm", "sui-cli>=1.63.2,<=1.64.1", "deepbook-sandbox"],
  "phases_path": "phases.json",
  "reference_dir": "reference/",
  "personalization": [
    { "name": "poll_interval_ms", "type": "integer", "min": 1000, "max": 30000, "default": 3000 },
    { "name": "pool_subset",      "type": "enum",    "values": ["both", "DEEP_SUI", "SUI_USDC"], "default": "both" }
  ]
}
```

### `phases.json` (one per path) — interesting-code-spots manifest

The schema explicitly models the three-rung hint ladder per spot. `hint_md`, `reference_md`, and `auto_write_md` are paths relative to the path root; each holds the rung-specific content.

```json
{
  "schema_version": 1,
  "phases": [
    {
      "id": "p1-bootstrap",
      "title": "Manifest fetch and SDK wiring",
      "explainer_md": "phases/p1.md",
      "spots": [
        {
          "id": "p1-spot-1",
          "target_file": "src/App.tsx",
          "target_range": "39-58",
          "prompt": "Implement packageIds, coinMap, poolMap that translate the manifest into DeepBook SDK config. Watch out for ::Registry vs ::RegistryInner.",
          "rungs": {
            "hint_md":       "rungs/p1-spot-1/hint.md",
            "reference_md":  "rungs/p1-spot-1/reference.md",
            "auto_write_md": "rungs/p1-spot-1/auto.md"
          },
          "doc_links": [
            ".sui-docs/develop/transactions/ptbs/inputs-and-results.mdx",
            ".ts-sdk-docs/sui/clients/grpc.mdx"
          ],
          "verification": { "mode": "compile", "command": "pnpm build" }
        }
      ]
    },
    {
      "id": "p2-retry",
      "title": "Resilient gRPC simulation calls",
      "explainer_md": "phases/p2.md",
      "spots": [
        {
          "id": "p2-spot-1",
          "target_file": "src/App.tsx",
          "target_range": "103-114",
          "prompt": "Implement withRetry around simulateTransaction-backed SDK calls.",
          "rungs": {
            "hint_md":       "rungs/p2-spot-1/hint.md",
            "reference_md":  "rungs/p2-spot-1/reference.md",
            "auto_write_md": "rungs/p2-spot-1/auto.md"
          },
          "doc_links": [".ts-sdk-docs/sui/clients/grpc.mdx"],
          "verification": { "mode": "compile", "command": "pnpm build" }
        }
      ]
    },
    {
      "id": "p3-poll",
      "title": "Polling loop with failure tolerance",
      "explainer_md": "phases/p3.md",
      "spots": [
        {
          "id": "p3-spot-1",
          "target_file": "src/App.tsx",
          "target_range": "116-145",
          "prompt": "Implement the polling tick: midPrice + getLevel2TicksFromMid every {{ poll_interval_ms }} ms; surface error only after 3 consecutive failures.",
          "rungs": {
            "hint_md":       "rungs/p3-spot-1/hint.md",
            "reference_md":  "rungs/p3-spot-1/reference.md",
            "auto_write_md": "rungs/p3-spot-1/auto.md"
          },
          "doc_links": [".sui-docs/develop/accessing-data/grpc/using-grpc.mdx"],
          "verification": { "mode": "simulate", "endpoint": "http://localhost:9009/manifest", "expected_status": 200 }
        }
      ]
    }
  ]
}
```

The MVP path ships exactly these three phases (one spot each), one phase per load-bearing region of `App.tsx` validated in the findings.

### `verification` sub-schema

| `mode`     | required fields                          | semantics                                                          |
|------------|------------------------------------------|--------------------------------------------------------------------|
| `compile`  | `command`                                | non-zero exit ⇒ fail                                               |
| `test`     | `command`, optional `expected_pass`      | unit tests; failure parsed from process exit                       |
| `simulate` | `endpoint`, `expected_status`            | HTTP probe (e.g. `:9009/manifest` returns 200)                     |
| `custom`   | `command`, `expected_stdout_regex`       | escape hatch; stdout must match                                    |

## State Schema

File: `<student-project>/.sui-deepbook-course/state.json`. Atomic writes via tmp-and-rename. Absent file is treated as first-run.

```json
{
  "schema_version": 1,
  "selected_path": "01-orderbook-viewer",
  "personalization": {
    "poll_interval_ms": 3000,
    "pool_subset": "both"
  },
  "cursor": {
    "phase_id": "p1-bootstrap",
    "spot_id": "p1-spot-1"
  },
  "ladder": {
    "p1-spot-1": { "hint_used": false, "reference_shown": false, "auto_completed": false }
  },
  "history": [
    { "ts": "2026-04-28T12:00:00Z", "event": "start" },
    { "ts": "2026-04-28T12:01:00Z", "event": "preflight_pass" }
  ]
}
```

Corrupted-state recovery archives to `.sui-deepbook-course/state.corrupt-<timestamp>.json`.

## MCP Tools

Each tool is exposed by the plugin's MCP server. The slash command's skill instructs Claude to call these in the documented order; we do not depend on any hidden command-to-tool runtime API.

| Tool                  | Caller (instructed by) | Params                                                                 | Returns                                                                                  |
|-----------------------|------------------------|------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| `start`               | `course-engine` skill  | `{ projectRoot: string }`                                              | `{ outputStyleOk: boolean, preflight: PreflightReport, paths: PathInfo[], state?: State }` |
| `selectPath`          | `course-engine` skill  | `{ projectRoot, slug }`                                                | `{ ok: boolean, personalizationPrompts: Prompt[] }`                                      |
| `setPersonalization`  | `course-engine` skill  | `{ projectRoot, values: Record<string, unknown> }`                     | `{ ok: boolean, errors?: string[] }`                                                     |
| `nextSpot`            | `course-conductor` agent | `{ projectRoot }`                                                    | `{ phase: Phase, spot: Spot, ladder: LadderState, done: boolean }`                       |
| `requestHint`         | `course-conductor` agent | `{ projectRoot, rung: 1 \| 2 \| 3 }`                                 | `{ payload: string, newLadder: LadderState }`                                            |
| `verifySpot`          | `course-conductor` agent | `{ projectRoot }`                                                    | `{ pass: boolean, output?: string, advanced?: boolean }`                                 |
| `runPreflightProbe`   | `course-engine` skill  | `{ probeId: string, remediate?: boolean }`                             | `{ pass: boolean, message: string, action?: { kind: 'shell', command: string } }`        |
| `status`              | `/status` skill        | `{ projectRoot }`                                                      | `{ state: State, integrity: 'ok' \| 'corrupt' \| 'absent' }`                             |

`runPreflightProbe` is the only tool that can request shell execution; the skill must surface the suggested command to the student for explicit approval before invoking it.

## Output-Style Enforcement

**Classification**: **soft enforcement, with explicit UX fallback.**

**Mechanism**:

1. A `SessionStart` hook (mirroring `learning-output-style/hooks/hooks.json` and `learning-output-style/hooks-handlers/session-start.sh`) emits a banner if the active output style is not `learning`. The hook reads `~/.claude/settings.json` and checks `enabledPlugins["learning-output-style@claude-plugins-official"] === true`. If not enabled, the banner instructs the student to enable it and re-run.
2. The `start` MCP tool repeats this check at command invocation. If `learning-output-style` is disabled, `start` returns `{ outputStyleOk: false, message: "..." }` and the slash command's skill instructs Claude to refuse politely.

**Failure behavior**: refusal is verbal — Claude replies with the canned message and does not call further MCP tools. No state mutation. No fallback "soft mode" — the plugin's whole pedagogy assumes the learning posture.

**Why soft, not hard**: The disk evidence (`learning-output-style/hooks-handlers/session-start.sh`) shows the entire output-style mechanism is itself a `SessionStart` `additionalContext` injection. There is no per-request signal of "the user is currently in style X" that an MCP server can read. Claiming hard enforcement would be inventing a runtime API.

## Preflight Checks (ordered)

| # | Check                          | Probe                                                                                          | Failure message                                                                                       | Class       |
|---|--------------------------------|------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|-------------|
| 1 | Docker running                 | `docker info >/dev/null 2>&1`                                                                  | "Docker Desktop is not running. Open Docker Desktop and re-run /start."                               | stop        |
| 2 | Node ≥ 18                      | `node --version` parsed                                                                        | "Node 18+ is required. Detected: ${found}. Install via nvm or nodejs.org."                            | guided stop |
| 3 | pnpm available                 | `pnpm --version`                                                                               | "pnpm not found. Install: `npm install -g pnpm`."                                                     | guided stop |
| 4 | Sui CLI in 1.63.2–1.64.1       | `sui --version`                                                                                | "Sui CLI ${found} is outside the supported range. Install: `brew install sui`."                       | guided stop |
| 5 | sui-pilot enabled              | `~/.claude/settings.json` → `enabledPlugins["sui-pilot@..."] === true`                         | "sui-pilot plugin is required. Enable via `claude plugins enable sui-pilot`."                         | guided stop |
| 6 | Sandbox repo present           | `test -d ~/workspace/deepbook-sandbox`                                                         | "Clone deepbook-sandbox: `git clone --recurse-submodules https://github.com/MystenLabs/deepbook-sandbox.git ~/workspace/deepbook-sandbox`." | guided stop |
| 7 | Sandbox manifest reachable     | `curl -fsS http://localhost:9009/manifest`                                                     | "Sandbox is not deployed. Run `pnpm deploy-all --quick` from `~/workspace/deepbook-sandbox/sandbox/`." | guided / auto-recover |
| 8 | learning-output-style enabled  | `~/.claude/settings.json` → `enabledPlugins["learning-output-style@claude-plugins-official"]`  | (see Output-Style Enforcement)                                                                        | stop        |

## Lesson Flow (end-to-end)

1. **Entry** — Student runs `/sui-deepbook-course:start` in a project directory. The slash command's body instructs Claude to load `skills/course-engine/SKILL.md`, which directs Claude to call the `start` MCP tool first.
2. **Output-style gate** — `start` returns `outputStyleOk`. If `false`, Claude refuses; flow ends.
3. **Preflight** — Skill iterates the preflight list, instructing Claude to call `runPreflightProbe` per probe. On guided-stop failures, it surfaces the remediation and waits. On the manifest-unreachable case, it offers the deploy-all command, gets explicit student approval, and re-probes.
4. **Path selection** — Skill renders the discovered paths. For MVP, `01-orderbook-viewer` is the only choice; the prompt still happens (so a future fourth path drops in cleanly).
5. **Personalization** — Skill instructs Claude to call `selectPath`, render the personalization prompts, then call `setPersonalization`.
6. **Phase loop** — Skill instructs Claude to switch context to the `course-conductor` agent. The agent calls `nextSpot`, presents the spot, waits for the student to write, calls `verifySpot`. On failure, it walks the help ladder via `requestHint`. On success, the loop continues until `nextSpot` returns `done: true`.
7. **Completion** — Final `nextSpot` call returns `done: true`. Skill renders a recap, offers `/sui-deepbook-course:status` for review.

## Help-Ladder Protocol

Three rungs. Each rung is opt-in; the student must explicitly request it.

| Rung | Trigger                          | Side effect on state                          | Side effect on filesystem            |
|------|----------------------------------|-----------------------------------------------|--------------------------------------|
| 1    | Student asks for a hint          | `ladder[spot].hint_used = true`               | none                                 |
| 2    | Student asks for the reference   | `ladder[spot].reference_shown = true`         | none (reference is shown in chat)    |
| 3    | Student asks Claude to finish it | `ladder[spot].auto_completed = true`          | reference is written to `target_file`; verification re-runs; on pass, phase advances |

**Invariants**:
- Rung 2 is offered only after rung 1 has been recorded.
- Rung 3 is offered only after rung 2.
- `ladder[spot].auto_completed` is set when rung 3 is *requested*, regardless of whether the resulting verification passes — so ladder usage is permanent and observable in state.
- If rung 3's auto-write passes verification, the phase advances. If it fails, the engine surfaces the failure; the student may attempt the spot again (with their own edits), but `auto_completed` remains set.

## Personalization Options (orderbook-viewer)

| Param              | Type    | Range / Enum                          | Default | Threaded into                                              |
|--------------------|---------|---------------------------------------|---------|------------------------------------------------------------|
| `poll_interval_ms` | integer | 1000–30000                            | 3000    | Phase 3 (`p3-spot-1`) prompt: `setInterval(tick, {{ poll_interval_ms }})` |
| `pool_subset`      | enum    | `both` \| `DEEP_SUI` \| `SUI_USDC`    | `both`  | Phase 1 (`p1-spot-1`) prompt: which `poolMap` entries the student wires |

No personalization affects file paths, line ranges, or phase order.

## Failure Modes

| Condition                                  | Detection                                              | Class           | User-facing message (excerpt)                                                                  | Recovery                                                              |
|--------------------------------------------|--------------------------------------------------------|-----------------|------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| Unsupported Sui CLI version                | preflight #4                                           | guided stop     | "Sui CLI X is outside the supported range. Install brew install sui."                          | student installs supported version, re-runs                           |
| Docker not running                         | preflight #1                                           | stop            | "Docker Desktop is not running."                                                                | student opens Docker Desktop, re-runs                                 |
| Missing `sui-pilot` plugin                 | preflight #5                                           | guided stop     | "sui-pilot is required. Enable: `claude plugins enable sui-pilot`."                            | student enables plugin, re-runs                                       |
| Sandbox repo absent                        | preflight #6                                           | guided stop     | (clone command)                                                                                 | student clones, re-runs                                               |
| Sandbox port collision (9009 in use)       | preflight #7 + `lsof -i :9009`                         | guided stop     | "Port 9009 is held by `<process>`. Stop it or run an alternative."                             | student frees port                                                    |
| Manifest unreachable after deploy attempt  | post-deploy-all probe fails 3×                         | stop            | (logs + `pnpm down` suggestion)                                                                | student inspects logs, may run `pnpm down`                            |
| Learning style not active                  | `start` MCP tool                                       | stop (refusal)  | (Output-Style Enforcement message)                                                              | student enables `learning-output-style`, re-runs                      |
| State file absent                          | `state.json` does not exist                            | auto-recover    | "Starting fresh."                                                                              | treated as first run; new state initialized                           |
| State file corrupt                         | JSON parse fail                                        | guided          | "State file is corrupt. Resume from phase 0 or abort?"                                          | archive corrupt file; student picks                                   |
| Schema version mismatch                    | JSON parse OK but version unknown                      | guided stop     | "State file was created by an incompatible version. Manual migration required."                | manual                                                                |
| Path metadata out of sync with reference   | `path.json` references missing reference files         | auto-recover    | "Path skipped due to missing reference file: <path>."                                           | path is omitted from the registry; others continue                    |
| `paths/` directory absent                  | scan fails                                             | stop            | "Plugin packaging error: paths/ directory missing."                                            | reinstall plugin                                                      |
| Verification fails repeatedly              | 3 consecutive `verifySpot` failures                    | guided          | "Want a hint?"                                                                                  | help ladder                                                           |

## Acceptance Criteria

- [AC-1.1] If `learning-output-style@claude-plugins-official` is not enabled in `~/.claude/settings.json`, `/sui-deepbook-course:start` returns a refusal naming the plugin and the activation step.
- [AC-1.2] If learning style is enabled, `/start` proceeds to preflight.
- [AC-1.3] The refusal path produces no state file mutations.
- [AC-2.1] Each preflight check produces a pass/fail with a one-line remediation pointer.
- [AC-2.2] A missing `~/workspace/deepbook-sandbox/` produces a guided stop with the clone command.
- [AC-2.3] If `:9009/manifest` is unreachable, preflight offers `pnpm deploy-all --quick`, executes only on explicit approval, and re-probes after.
- [AC-2.4] If Docker is not running, preflight emits an explicit stop and does not attempt deploy.
- [AC-2.5] An unsupported Sui CLI version is a guided stop, not a hard stop.
- [AC-3.1] Adding `paths/04-fake-path/` with a valid `path.json` and `phases.json` makes the new path appear in the selection prompt without code changes.
- [AC-3.2] A malformed `path.json` is reported and the path is skipped.
- [AC-3.3] An empty `paths/` directory produces an explicit "no paths installed" message rather than a stack trace.
- [AC-4.1] Each phase has at least one spot.
- [AC-4.2] The plugin renders each spot prompt with doc links resolved and waits for the student to write into the indicated file/range.
- [AC-4.3] Verification runs after every spot completion; failure routes to the help ladder.
- [AC-5.1] Each ladder rung is gated on the prior rung being recorded.
- [AC-5.2] Ladder rungs mutate `state.ladder[spot]` flags on use.
- [AC-5.3] Auto-complete advances the phase only if `verifySpot` passes after auto-write.
- [AC-5.4] `auto_completed` is set on rung-3 invocation and never cleared.
- [AC-6.1] The personalization prompt only renders enumerable options.
- [AC-6.2] A "Use defaults" answer skips all personalization sub-prompts.
- [AC-6.3] Personalization values surface in subsequent phase prompts as `{{ poll_interval_ms }}`-style substitution and never alter the spot file/line manifest.
- [AC-7.1] Re-running `/start` with valid state resumes at the recorded phase/spot cursor.
- [AC-7.2] An invalid-JSON state file produces the corruption recovery prompt and archives the original.
- [AC-7.3] A schema-version mismatch is a guided stop, not a corruption recovery.
- [AC-7.4] An absent state file is treated as first run.

## Future Work

- `paths/02-fee-rebate-swap/` content drop (Move + scripts; phase manifest covering `fee_rebate_swap.move` lines 74–96 and 99–106 and `scripts/deploy.sh` lines 40–68).
- `paths/03-dca-vault/` content drop (phase manifest covering `dca_vault.move` lines 88–133 and the keeper at lines 63–92, 94–111, 150–164).
- Phase 4 render spot for `01-orderbook-viewer` and the corresponding `render_style` personalization option (currently parked; will be added when that phase ships).
- Hard output-style enforcement once Claude Code exposes a documented runtime signal.
- Multi-student / cloud progress sync.
- Auto-publish to a marketplace.
- Rich verification beyond compile/test/simulate/custom (e.g. PTB dry-runs against the sandbox).
- A `/sui-deepbook-course:reset` slash command that archives state and starts over.

## E2E Tests

Note on coverage scope: AC-4.1 ("each phase has at least one spot") is a manifest/schema invariant enforced by static schema validation of `phases.json` (and by contract tests in cycle 2), not by end-to-end runs. It is intentionally out of scope for the e2e suite below.

```yaml
- id: E-001
  name: cold-start happy path with sandbox already deployed reaches phase 1
  kind: cli
  preconditions:
    - Docker Desktop running with deepbook-sandbox already deployed (manifest reachable on :9009)
    - learning-output-style@claude-plugins-official enabled in ~/.claude/settings.json
    - sui-pilot@<source> enabled
    - ~/workspace/deepbook-sandbox checkout present
    - student project workspace is empty (no .sui-deepbook-course/state.json)
  steps:
    - assert <project>/.sui-deepbook-course/state.json does NOT exist at start (first run)
    - run "/sui-deepbook-course:start" via the e2e harness MCP driver
    - assert outputStyleOk == true in the start-tool response
    - assert all 8 preflight probes report pass
    - assert the path-selection prompt is rendered and only "01-orderbook-viewer" is listed
    - select "01-orderbook-viewer"
    - assert the personalization prompt offers exactly the enumerable options declared in path.json (poll_interval_ms range 1000-30000, pool_subset enum) and offers a single "Use defaults" option
    - choose "Use defaults" with one answer; assert no further personalization sub-prompts are rendered
    - assert nextSpot returns phase_id "p1-bootstrap" / spot_id "p1-spot-1"
    - assert the rendered spot prompt includes the resolved doc-link contents (or links rendered as fetchable references) and names target_file=src/App.tsx target_range=39-58
    - assert the engine is in a wait state for the student to write into the indicated file/range (no auto-write occurred)
    - assert state.json now exists at <project>/.sui-deepbook-course/state.json with cursor at p1-bootstrap/p1-spot-1
  expected: Student reaches phase 1 spot 1 with state persisted, doc links resolved, personalization defaulted in one click; no shell commands invoked because sandbox was already up.
  covers_contract: [AC-1.2, AC-2.1, AC-4.2, AC-6.1, AC-6.2, AC-7.4]
  tooling: null

- id: E-002
  name: output-style refusal when learning-output-style is disabled
  kind: cli
  preconditions:
    - learning-output-style@claude-plugins-official set to false in ~/.claude/settings.json (harness toggles it)
    - student project workspace is empty
  steps:
    - run "/sui-deepbook-course:start"
    - assert start-tool returns outputStyleOk == false with a message naming "learning-output-style" and the activation step
    - assert no further MCP tools are invoked after start
    - assert <project>/.sui-deepbook-course/state.json does NOT exist
  expected: Plugin refuses with a precise activation instruction; no state mutations.
  covers_contract: [AC-1.1, AC-1.3]
  tooling: null

- id: E-003
  name: preflight failure with guided remediation (sui-pilot disabled)
  kind: cli
  preconditions:
    - learning-output-style enabled
    - sui-pilot@<source> set to false in ~/.claude/settings.json
    - sandbox manifest reachable on :9009
  steps:
    - run "/sui-deepbook-course:start"
    - assert preflight probe #5 (sui-pilot enabled) fails
    - assert the failure message includes the exact remediation 'claude plugins enable sui-pilot'
    - assert the harness halts before path selection
    - re-enable sui-pilot in settings, re-run /start
    - assert preflight now passes and path selection is offered
  expected: Plugin reports the exact missing prerequisite and resumes cleanly after remediation.
  covers_contract: [AC-2.1]
  tooling: null

- id: E-004
  name: help ladder full traversal hint to reference to auto-finish
  kind: cli
  preconditions:
    - cold-start preconditions from E-001 met
    - student is parked at p1-bootstrap/p1-spot-1
    - student has not written any code into src/App.tsx
  steps:
    - call verifySpot
    - assert pass == false (spot is empty)
    - call requestHint with rung=1
    - assert response payload is non-empty and state.ladder["p1-spot-1"].hint_used == true
    - call verifySpot, assert still false
    - call requestHint with rung=2
    - assert state.ladder["p1-spot-1"].reference_shown == true
    - call verifySpot, assert still false
    - call requestHint with rung=3
    - assert state.ladder["p1-spot-1"].auto_completed == true
    - assert reference content was written into src/App.tsx lines 39-58
    - assert verifySpot was triggered automatically by the rung-3 auto-write (no separate manual call needed) and now passes
    - assert cursor advanced to p2-retry/p2-spot-1
    - simulate a session restart by re-running /start
    - assert state.ladder["p1-spot-1"].auto_completed is still true after the restart (permanence)
    - at p2-retry/p2-spot-1, harness writes a syntactically broken edit into src/App.tsx lines 103-114 and signals "spot complete"
    - assert verifySpot is invoked automatically (without the harness explicitly calling it) and reports failure
    - assert the help-ladder offer (rung 1 hint) is surfaced as a result of the failure
  expected: All three rungs traverse in order with state and filesystem side-effects matching the protocol; auto_completed survives a restart; verification auto-runs after each spot completion and routes failure into the help ladder.
  covers_contract: [AC-4.3, AC-5.1, AC-5.2, AC-5.3, AC-5.4]
  tooling: null

- id: E-005
  name: registry extensibility a fake fourth path is discovered without code changes
  kind: cli
  preconditions:
    - plugin's paths/ contains 01-orderbook-viewer
    - cold-start preconditions met
  steps:
    - harness writes a synthetic paths/04-fake-path/path.json (valid schema, slug=04-fake-path) and paths/04-fake-path/phases.json (one phase, one spot)
    - run "/sui-deepbook-course:start"
    - assert path-selection prompt now lists both "01-orderbook-viewer" and "04-fake-path"
    - select "04-fake-path"
    - assert selectPath returns ok == true
    - harness deletes paths/04-fake-path/ to clean up
  expected: Registry surfaces the new path without any plugin code change.
  covers_contract: [AC-3.1]
  tooling: null

- id: E-006
  name: state recovery from a corrupt state file
  kind: cli
  preconditions:
    - cold-start preconditions met
    - <project>/.sui-deepbook-course/state.json exists but contains invalid JSON (e.g. truncated)
  steps:
    - run "/sui-deepbook-course:start"
    - assert the corruption recovery prompt is shown ("State file is corrupt. Resume from phase 0 or abort?")
    - assert <project>/.sui-deepbook-course/state.corrupt-<timestamp>.json now exists with the original bytes
    - choose "resume from phase 0"
    - assert a fresh state.json is created and cursor is at p1-bootstrap/p1-spot-1
  expected: Corrupt state is archived, the student is offered recovery, and a clean state is rebuilt.
  covers_contract: [AC-7.2]
  tooling: null

- id: E-007
  name: sandbox manifest unreachable after deploy attempt
  kind: cli
  preconditions:
    - Docker Desktop running
    - learning-output-style enabled, sui-pilot enabled
    - ~/workspace/deepbook-sandbox checkout present
    - sandbox NOT currently deployed (no containers, :9009 unreachable)
    - harness pre-stubs `pnpm deploy-all --quick` to a script that exits 0 but does NOT bring up the manifest endpoint
  steps:
    - run "/sui-deepbook-course:start"
    - assert preflight probe #7 fails first time
    - approve the deploy-all remediation
    - assert the harness invokes `pnpm deploy-all --quick` from ~/workspace/deepbook-sandbox/sandbox/
    - assert the post-deploy manifest probe fails 3 times in a row
    - assert the engine emits an explicit stop with logs and the `pnpm down` suggestion
    - assert no path selection prompt is rendered
  expected: After a failed deploy attempt the engine stops cleanly with diagnostics; flow does not advance.
  covers_contract: [AC-2.3]
  tooling: null

- id: E-008
  name: real sandbox deploy via pnpm deploy-all --quick (Docker-gated slow integration)
  kind: cli
  preconditions:
    - Docker Desktop running with at least 8 GB allocated (harness fails fast and skips this scenario if `docker info` fails)
    - learning-output-style enabled, sui-pilot enabled
    - ~/workspace/deepbook-sandbox checkout present with submodules
    - sandbox NOT currently deployed at suite start
  steps:
    - harness records baseline (no containers, :9009 unreachable)
    - run "/sui-deepbook-course:start"
    - assert preflight probe #7 fails initially
    - approve the deploy-all remediation
    - assert the harness invokes `pnpm deploy-all --quick` against ~/workspace/deepbook-sandbox/sandbox/ (real, not stubbed)
    - wait up to 7 minutes for the manifest endpoint to come up (poll http://localhost:9009/manifest every 5 s)
    - assert the manifest probe eventually returns 200 with a valid JSON manifest
    - assert the path-selection prompt is rendered
    - on suite teardown, harness runs `pnpm down` from ~/workspace/deepbook-sandbox/sandbox/ to clean up containers
  expected: A real deploy-all --quick brings the sandbox up and the plugin proceeds; teardown cleans up. If Docker is unavailable the harness skips this scenario with a clear message rather than failing.
  covers_contract: [AC-2.3]
  tooling: null

- id: E-009
  name: sandbox repo absent guided stop with clone command
  kind: cli
  preconditions:
    - learning-output-style enabled, sui-pilot enabled, Docker running, Node/pnpm/Sui CLI in range
    - ~/workspace/deepbook-sandbox checkout NOT present (harness moves it aside if it exists)
  steps:
    - run "/sui-deepbook-course:start"
    - assert preflight probe #6 (sandbox repo present) fails
    - assert the failure message contains the exact command "git clone --recurse-submodules https://github.com/MystenLabs/deepbook-sandbox.git ~/workspace/deepbook-sandbox"
    - assert the engine halts before attempting any deploy
    - harness restores the checkout
  expected: Plugin emits the clone command and stops; no deploy attempt is made.
  covers_contract: [AC-2.2]
  tooling: null

- id: E-010
  name: Docker not running explicit stop with no deploy attempt
  kind: cli
  preconditions:
    - Docker Desktop NOT running (harness shells out `docker` to a stub that exits non-zero)
    - other prerequisites satisfied (so the test isolates the Docker failure)
  steps:
    - run "/sui-deepbook-course:start"
    - assert preflight probe #1 (Docker running) fails
    - assert the failure class is "stop" and the message instructs the student to open Docker Desktop
    - assert no `pnpm deploy-all --quick` invocation is recorded by the harness
    - assert the engine halts before path selection
  expected: Docker-not-running is a hard stop; no deploy is attempted under any circumstance.
  covers_contract: [AC-2.4]
  tooling: null

- id: E-011
  name: unsupported Sui CLI version is a guided stop
  kind: cli
  preconditions:
    - harness shadows `sui` with a stub that prints "sui 1.62.0" (out of supported range)
    - other prerequisites satisfied
  steps:
    - run "/sui-deepbook-course:start"
    - assert preflight probe #4 fails with "Sui CLI 1.62.0 is outside the supported range"
    - assert the message includes the install command (`brew install sui`)
    - assert the engine halts as a guided stop and does not advance to path selection
  expected: Out-of-range Sui CLI is reported precisely and stops the flow with remediation.
  covers_contract: [AC-2.5]
  tooling: null

- id: E-012
  name: malformed path.json is reported and skipped
  kind: cli
  preconditions:
    - cold-start preconditions met
    - plugin's paths/ contains 01-orderbook-viewer
  steps:
    - harness writes paths/99-broken/path.json with invalid JSON (e.g. trailing comma)
    - run "/sui-deepbook-course:start"
    - assert the registry reports "skipped paths/99-broken/path.json: parse error" with the file path
    - assert path-selection prompt still lists 01-orderbook-viewer (only)
    - harness deletes paths/99-broken/ to clean up
  expected: A malformed path.json is logged and skipped without crashing the registry.
  covers_contract: [AC-3.2]
  tooling: null

- id: E-013
  name: empty paths directory produces explicit "no paths installed" message
  kind: cli
  preconditions:
    - cold-start preconditions met
    - harness temporarily moves paths/01-orderbook-viewer aside, leaving paths/ empty
  steps:
    - run "/sui-deepbook-course:start"
    - assert the start-tool response indicates "no paths installed" with no stack trace
    - assert no path-selection prompt is rendered
    - harness restores paths/01-orderbook-viewer
  expected: An empty paths/ directory is handled gracefully with an explicit message.
  covers_contract: [AC-3.3]
  tooling: null

- id: E-014
  name: personalization values appear as substitutions in subsequent prompts and do not alter spot file/range
  kind: cli
  preconditions:
    - cold-start preconditions met
    - harness sets personalization to non-default values (poll_interval_ms=5000, pool_subset=DEEP_SUI)
  steps:
    - run "/sui-deepbook-course:start"
    - select 01-orderbook-viewer
    - submit personalization values poll_interval_ms=5000, pool_subset=DEEP_SUI
    - walk to phase p1-bootstrap and request the spot
    - assert the rendered prompt for p1-spot-1 reflects the pool_subset choice (e.g. "wire only DEEP_SUI in poolMap")
    - walk to phase p3-poll and request the spot
    - assert the rendered prompt for p3-spot-1 contains "5000" (substituted into the polling-interval clause) NOT the literal "{{ poll_interval_ms }}"
    - assert target_file ("src/App.tsx") and target_range ("116-145") are unchanged from the manifest defaults
  expected: Personalization values substitute into prompts and never alter the spot's file or line range.
  covers_contract: [AC-6.3]
  tooling: null

- id: E-015
  name: resume from valid state on a re-run
  kind: cli
  preconditions:
    - cold-start preconditions met
    - <project>/.sui-deepbook-course/state.json exists with cursor at p2-retry/p2-spot-1 and ladder.p1-spot-1.hint_used=true
  steps:
    - run "/sui-deepbook-course:start"
    - assert no first-run wizard renders (no path-selection prompt, no personalization prompt)
    - assert nextSpot returns phase_id "p2-retry" / spot_id "p2-spot-1"
    - assert ladder state is preserved exactly (ladder.p1-spot-1.hint_used == true)
  expected: A subsequent /start with valid state resumes at the recorded cursor without re-prompting.
  covers_contract: [AC-7.1]
  tooling: null

- id: E-016
  name: schema-version mismatch is a guided stop
  kind: cli
  preconditions:
    - cold-start preconditions met
    - <project>/.sui-deepbook-course/state.json exists, JSON-valid, but with schema_version=999 (unknown)
  steps:
    - run "/sui-deepbook-course:start"
    - assert the start-tool response includes "incompatible version" guidance and references manual migration
    - assert no corruption-archive file is created (this is not a corruption case)
    - assert no fresh state is silently created
    - assert the engine halts as a guided stop
  expected: An unknown schema version is a guided stop, distinct from the corruption recovery path.
  covers_contract: [AC-7.3]
  tooling: null

```
