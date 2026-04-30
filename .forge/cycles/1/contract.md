# Cycle 1 Contract — `scaffold-registry-and-output-style`

## Behavior

After this cycle, a freshly-cloned `sui-mcp-course` repo can be installed as a Claude Code plugin and run via `/sui-deepbook-course:start`. The plugin's MCP server boots, the `start` MCP tool reports whether the `learning-output-style@claude-plugins-official` plugin is enabled (advisory, not enforced), and lists every well-formed path it discovers under `paths/<slug>/`. Malformed paths are skipped with a structured warning; an empty or absent `paths/` directory produces an explicit "no paths installed" message instead of a stack trace. State, preflight, lesson flow, help ladder, and personalization are deliberately out of scope — `start` returns a `state` field as `null` and a `preflight` field as `{ skipped: true, reason: "cycle-1" }`. Dropping a fake `paths/04-fake-path/` with valid `path.json` and `phases.json` files surfaces it in the `paths` array without code changes — that's the canonical proof the engine has zero hardcoded path knowledge.

## Files

- `.claude-plugin/plugin.json` — plugin manifest declaring `name`, `version`, `description`, the MCP server entry, and the `commands/`, `agents/`, `skills/`, `hooks/` component directories.
- `commands/start.md` — slash command body that loads `skills/course-engine/SKILL.md`. Body is markdown only; the skill carries the protocol Claude follows.
- `skills/course-engine/SKILL.md` — minimal skill body: instructs Claude to call the `start` MCP tool and render `outputStyleOk`, the `paths` array, and any structured warnings. No path-selection or preflight orchestration in cycle 1.
- `mcp/server/package.json` — declares `@modelcontextprotocol/sdk` (latest stable), `"type": "module"`, Node ≥ 18 engine, build/start scripts.
- `mcp/server/tsconfig.json` — strict mode, ESM, `moduleResolution: "NodeNext"`, target ES2022.
- `mcp/server/src/index.ts` — MCP server entrypoint; registers tools from `tools/`. Stdio transport.
- `mcp/server/src/tools/start.ts` — implements the `start` tool: returns `{ outputStyleOk, preflight: { skipped }, paths: PathInfo[], state: null, warnings: RegistryWarning[] }`.
- `mcp/server/src/registry.ts` — directory scan over `paths/<slug>/{path.json,phases.json}`. Returns `{ paths: PathInfo[], warnings: RegistryWarning[] }`. Skips non-directories, malformed JSON, schema-invalid files, and dirs missing `path.json` — each with a structured warning. Empty/absent `paths/` returns `{ paths: [], warnings: [{ kind: "no-paths-dir" | "empty-paths-dir", message }] }`.
- `mcp/server/src/outputStyle.ts` — reads `~/.claude/settings.json`, returns `enabledPlugins["learning-output-style@claude-plugins-official"] === true`. If the file is missing or malformed, returns `false` with a structured note (do not throw).
- `mcp/server/src/schemas/path.ts` — type + runtime validator for `path.json` (slug, title, summary, personalization options enum, build_command). Hand-rolled or `zod` (implementer's choice; package.json must declare any chosen dep).
- `mcp/server/src/schemas/phases.ts` — type + runtime validator for `phases.json` schema-only (phase array with at least one spot per phase). Cycle 1 only validates schema shape; spot-content semantics are cycle 4's concern.
- `paths/01-orderbook-viewer/path.json` — real MVP path entry (slug `01-orderbook-viewer`, title, personalization options matching spec.md `## Personalization Options`).
- `paths/01-orderbook-viewer/phases.json` — placeholder content: schema-valid (3 phases × ≥1 spot each), but spot prompts are stubbed `"TBD in cycle 4"` strings. Cycle 4 fills phase 1; phases 2-3 stay stubbed.
- `paths/01-orderbook-viewer/description.md` — short student-facing intro (≤ 200 words).
- `tests/registry.test.ts` — unit tests for the registry: well-formed scan, malformed JSON skipped with warning, missing `path.json` skipped, empty `paths/` returns explicit warning, fake-fourth-path discovery (E-005 unit-level proof; the harness E2E in cycle 4 will exercise the same surface).
- `tests/outputStyle.test.ts` — unit tests for the settings-file probe: present + true → `true`; present + false → `false`; missing file → `false` + warning; malformed JSON → `false` + warning.
- `tests/start.tool.test.ts` — unit tests for the `start` tool: shape conforms, paths list is registry output, `outputStyleOk` is the probe output, no state mutation when `outputStyleOk === false` (E-002 / AC-1.3 unit-level proof).
- `scripts/e2e/harness.ts` — minimal harness skeleton that can: (a) launch the MCP server in-process, (b) call a tool, (c) assert on the response. No scenarios run yet; cycle 1 ships the surface, cycles 2-5 add scenarios.
- `tests/fixtures/paths/04-fake-path/{path.json,phases.json}` — fixture for E-005's drop-in proof. Used by `registry.test.ts`.
- `tests/fixtures/paths-malformed/{path.json}` — fixture with broken JSON for E-012.
- `tests/fixtures/paths-empty/.gitkeep` — fixture for E-013.
- `README.md` — minimal install + run instructions (one-screen).

## Acceptance

- A1. The repo installs as a Claude Code plugin without manifest errors. `plugin.json` declares the MCP server, slash command, skill, and (empty for now) agents/hooks.
- A2. `mcp/server/` builds with `pnpm build` (or `tsc`); zero TypeScript errors with `strict: true`.
- A3. The `start` MCP tool returns the documented shape: `{ outputStyleOk: boolean, preflight: { skipped: true, reason: "cycle-1" }, paths: PathInfo[], state: null, warnings: RegistryWarning[] }`.
- A4. With `~/.claude/settings.json` containing `enabledPlugins["learning-output-style@claude-plugins-official"]: true`, `start` returns `outputStyleOk: true`. With `false` or absent: `outputStyleOk: false`. **The `start` call performs zero filesystem writes when `outputStyleOk === false` — this is the AC-1.3 invariant.**
- A5. With `paths/01-orderbook-viewer/` present and well-formed, `start.paths` includes a `PathInfo` for it.
- A6. Adding `tests/fixtures/paths/04-fake-path/` (used as a swappable `paths/` root in tests) produces a `PathInfo` for it without any registry/engine code changes.
- A7. A malformed `path.json` in any path dir produces a `RegistryWarning` with `kind: "malformed-path-json"`, the file path, and the parse error; that path is skipped; other paths still surface.
- A8. An empty `paths/` directory produces a single `RegistryWarning` with `kind: "empty-paths-dir"` and an empty `paths` array (no crash).
- A9. An absent `paths/` directory produces a single `RegistryWarning` with `kind: "no-paths-dir"` and an empty `paths` array (no crash).
- A10. Engine code (everything outside `paths/`) contains zero string literals matching `"01-orderbook-viewer"` (grep proof). The slug appears only in `paths/01-orderbook-viewer/` and test fixtures.
- A11. The unit test suite under `tests/` passes (`pnpm test`); coverage of `registry.ts` and `outputStyle.ts` is reported (no minimum threshold this cycle).
- A12. `scripts/e2e/harness.ts` boots the MCP server and successfully invokes `start` against a fixture project root, returning the documented shape. (Harness has no assertions yet — that's cycle 2-5's add.)
- A13. `outputStyle.ts` MUST NOT attempt to read the active runtime output style from anywhere other than `~/.claude/settings.json`. Reviewer "security" dimension grep target: any reference to environment variables matching `CLAUDE_OUTPUT_STYLE`, parent process inspection, or system prompt scraping is a critical finding.
- A14. `start` and `runPreflightProbe` (the latter not implemented this cycle) are the **only** tools that may emit `action.kind == "shell"`. Cycle 1 implements neither shell action surface; reviewer must confirm `start.ts` returns no such field.
