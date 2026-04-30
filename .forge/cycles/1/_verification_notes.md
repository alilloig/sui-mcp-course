# Cycle 1 — Verification notes

Re-derivation log for every cluster matching the consolidator's verify-or-split criteria.

## C001 — Registry never invokes validatePhases (high, disputed)

**Status:** CONFIRMED, severity held at **high**.

Verified against `mcp/server/src/registry.ts` and `mcp/server/src/schemas/phases.ts`.

- `registry.ts` line 3: `import { validatePath } from './schemas/path.js';` — no import of `validatePhases`.
- `grep -rn validatePhases mcp/ scripts/ tests/` returns five hits, all in either `schemas/phases.ts` (the definition) or `tests/registry.test.ts` (T-037..T-039 unit-testing the validator directly). The registry loop never wires it.
- Real path `paths/01-orderbook-viewer/phases.json` exists; the registry would happily emit a `PathInfo` for any sibling slug whose `phases.json` is missing or zero-spot.

Why this is high (not medium): the contract defines `schemas/phases.ts` as a "runtime validator for `phases.json` schema-only" and the cycle behavior says the registry "lists every well-formed path" — by the contract's own vocabulary, "well-formed" subsumes both `path.json` and `phases.json`. The current code makes `phases.ts` dead code at the registry boundary, leaves the `phases.json` schema invariant unenforced anywhere observable in the engine, and ships a `PathInfo` surface that cycle 4 will read and crash on. This is a contract-conformance gap, not a stylistic preference.

The dispute (R5 rated this `medium`, R1+R2 `high`) is resolved upward because (a) three independent reviewers flagged it without coordination, (b) the contract explicitly names phases.json as part of the path well-formedness invariant, and (c) the surface that breaks (registry → PathInfo → downstream consumer) is exactly the layering the cycle is trying to establish.

This cluster also bundled R1-002 (slug-dir mismatch) and R1-007 (existsSync EACCES misclassification) which are distinct concerns at overlapping line ranges — see split below.

## C001 split — separate sub-findings

The aggregate cluster mixed three categories at three different line ranges. After re-reading raw findings:

- **C001 proper (high):** validatePhases never invoked. Source IDs: R2-001, R5-001 (and a third reviewer's mention via the cluster).
- **C001a (low):** dir-name vs `slug` field unverified — split out as **C001a** at the medium-tier section. Source ID: R1-002. Single reviewer, no contract violation (the contract does not require `slug === entry.name`), so this stays low.
- **C001b (low):** existsSync EACCES misclassification — already independently captured by C004 and C007. Folded into those.

I recorded one new low-tier cluster (slug-dir mismatch) and dropped the other two from C001's recommendations to avoid double-counting.

## C002 — readdirSync error code conflation (medium)

**Status:** CONFIRMED, severity held at **medium**.

Verified against `registry.ts` lines 27-39: the `catch {}` is bare (no `err` binding), and the warning kind is unconditionally `no-paths-dir`. R1+R3 agreement, both confidence >=medium. Contract A8/A9 distinguish `empty-paths-dir` from `no-paths-dir`; the EACCES/ENOTDIR/EMFILE class would look identical to ENOENT to a user. Medium fits — user diagnosis loop is broken but no crash and no security impact.

## C010 — outputStyle ENOENT/EACCES conflation (medium)

**Status:** CONFIRMED, severity held at **medium**.

Verified against `outputStyle.ts` lines 21-31. Same shape as C002 — bare `catch`, unconditional `settings-file-missing`. R1+R3 agreement. Medium for parity with C002 (same defect class on the parallel surface).

## C018 — harness bypasses MCP transport entirely (medium)

**Status:** CONFIRMED. Severity is genuinely on the **medium/high** boundary; held at **medium** because the consequence is contained to cycle 1's harness (no live scenarios yet) but flagged prominently because the contract uses the precise word "boots."

Verified against `scripts/e2e/harness.ts`:
- Line 1: `import { runStart } from '../../mcp/server/src/tools/start.js';`
- Lines 17-28: `if (toolName === 'start') { ... return runStart(...) }`
- No `McpServer` instantiation, no `StdioServerTransport`, no `Client` from `@modelcontextprotocol/sdk/client/...`.

Contract A12 says: "`scripts/e2e/harness.ts` boots the MCP server and successfully invokes `start`". The current implementation does not boot the server — it imports `runStart` and synthesizes a fake MCP envelope. T-028 still passes because it asserts on the synthesized envelope shape, not on actual MCP framing.

Why not high: cycle 1 ships zero scenarios. The harness is a skeleton. Any cycle-2 scenario that actually depends on MCP wire behavior will surface this bug loudly, and there is plenty of time to fix it. But it is a contract-conformance smell — call it out in the executive summary so the next cycle does not inherit an "integration test" that bypasses the integration.

## C026 / C027 / C030 — test-coverage holes around AC-1.3 / A10 / A13

**Status:** CONFIRMED at low. These are all R5 singletons. They identify real holes in the spy/grep coverage but the bugs they would catch require an *adversarial implementer*, not the natural drift of feature work. Held at **low** as the consolidator-rule for "process noise / testing gaps" applies — collapse to the dedicated test-plan section.

Note: R5-002 and R5-009 were specifically called out by the orchestrator as worth surfacing because the green-log patch added `vi.mock('node:fs', { spy: true })` and the spy coverage is the AC-1.3/A13 enforcement surface. Their substantive content is captured in the test & coverage plan section below.

## C004 / C007 — existsSync TOCTOU + symlink + unbounded read (low)

**Status:** CONFIRMED at **low**. Verified against `registry.ts` lines 64, 76, 109-115. None reaches a contract violation in cycle 1. The OOM angle (R6-002) is theoretical given the trusted-developer threat model the contract assumes for cycle 1; flagged for future-cycle revisit.

## All other clusters

C003, C005, C006, C008, C009, C011, C012, C013, C014, C015, C016, C017, C019, C020, C021, C022, C023, C024, C025, C028, C029 — singletons or 2-reviewer agreements at low/info. Spot-verified against the cited line ranges; no severity changes. These are the long tail of design-cleanup, ergonomics, and authoring-UX notes; they belong in the body of the report at low/info but are not blockers.

## Adversary path for the one almost-critical finding

There is no critical finding in this cycle. C001 is high because cycle 4 will trip on it, not because of an adversary. A13/A14 hold (R6-005's affirmative finding on outputStyle.ts and start.ts is the verification record).
