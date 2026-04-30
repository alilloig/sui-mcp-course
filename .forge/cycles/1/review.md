# Cycle 1 Review — `scaffold-registry-and-output-style`

## Executive summary

Cycle 1 lands the engine skeleton in good shape: the contract's parametricity invariant (A6/A10), the AC-1.3 zero-write invariant (A4), and the security guards (A13/A14) all verify against source. **One high-severity finding blocks a clean pass: `mcp/server/src/registry.ts` imports `validatePath` but never invokes `validatePhases`, leaving `phases.json` schema-invalidity undetected at the engine boundary that the contract makes load-bearing for cycle 4.** A second contract-conformance smell — `scripts/e2e/harness.ts` bypasses the MCP transport instead of booting it as A12 requires — is held at medium because cycle 1 ships zero scenarios, but it is the most likely cycle-2 footgun. Top 1-3 risks: (1) the validatePhases gap silently widens cycle 4's blast radius; (2) the harness "integration" surface is a direct function call masquerading as MCP; (3) a small set of error-code-conflation bugs (C002, C010) make user diagnosis loops harder when the filesystem misbehaves.

41/41 unit tests pass; `tsc --noEmit` is green. No critical findings.

## Severity counts

| Severity | Count |
|---|---|
| critical | 0 |
| high     | 1 |
| medium   | 3 |
| low      | 14 |
| info     | 9 |

(One additional low-tier cluster — slug-vs-dirname mismatch — was split out of C001 during verification, raising low from 13 to 14. C001b was folded into C004/C007 to avoid double-counting; C001a becomes a standalone low.)

## Findings (by severity)

### Critical
(none)

### High

- **C001 — Registry never invokes `validatePhases`; phases-schema invariant is unenforced at the engine boundary.** **File:** `mcp/server/src/registry.ts:1-119`. **Impact:** A path with valid `path.json` but missing/malformed/zero-spot `phases.json` is reported as a healthy `PathInfo` with zero warnings. `schemas/phases.ts` becomes dead code at the registry boundary — only the unit tests T-037..T-039 keep it alive. Cycle 4, the only consumer of phase semantics, will receive `PathInfo`s that the engine vouched for and crash when it tries to load phases. The contract's "lists every well-formed path it discovers" promise (cycle behavior, A5) is weakened: well-formedness is enforced for `path.json` only. **Recommendation:** Inside the per-entry loop, after `validatePath` succeeds, read `paths.join(slugDir, 'phases.json')`, parse, run `validatePhases`. On read/parse/schema failure emit a structured warning (`missing-phases-json` | `malformed-phases-json` | `invalid-phases-json`) and skip the entry, mirroring the `path.json` logic. Add a registry test wiring a path with valid `path.json` but a zero-spot `phases.json` and assert the path is omitted with a phases warning. Source IDs: R1-001, R2-001, R5-001. **Reviewers:** R1, R2, R5 (agreement=3, *disputed_severity=true* — R5 rated medium, R1+R2 high; resolved upward against the contract's own well-formedness vocabulary). *Verification note:* Confirmed by reading `registry.ts` line 3 (`import { validatePath } from './schemas/path.js'`) — no `validatePhases` symbol is imported anywhere in the engine; `grep -rn validatePhases mcp/ scripts/ tests/` returns matches only in the schema definition and the test file. See `_verification_notes.md` § C001.

### Medium

- **C002 — `scanRegistry` collapses every `readdirSync` error into `no-paths-dir`.** **File:** `mcp/server/src/registry.ts:27-39`. **Impact:** EACCES (permissions), ENOTDIR (paths is a file), EMFILE (descriptor exhaustion) all surface as "no paths installed." Diagnostic loop is broken — the user looks for a missing directory rather than fixing permissions. Contract A8/A9 introduced the empty-vs-absent distinction precisely to make this discoverable. **Recommendation:** Bind `err`, branch on `err.code` — ENOENT → `no-paths-dir`; ENOTDIR → `paths-not-a-directory`; EACCES → `paths-dir-unreadable`; default → `paths-dir-error` carrying `err.message`. T-025 only exercises ENOENT today; add fixtures for the others. **Reviewers:** R1, R3 (agreement=2). *Verification note:* Bare `catch {}` confirmed at line 29.

- **C010 — `probeOutputStyle` collapses ENOENT and read-error into `settings-file-missing`.** **File:** `mcp/server/src/outputStyle.ts:21-31`. **Impact:** Parallel of C002 on the settings-file probe. EACCES on a present `~/.claude/settings.json` reports as missing; the user is told to enable a plugin that may already be enabled. Contract line 17 calls for a "structured note" — that obligation is partially defeated. **Recommendation:** Bind `err`, branch on `err.code`, emit distinct kinds (`settings-file-missing` only on ENOENT, `settings-file-unreadable` otherwise with the OS-level message). **Reviewers:** R1, R3 (agreement=2). *Verification note:* Confirmed against `outputStyle.ts:23` — bare `catch`, unconditional `settings-file-missing`.

- **C018 — `scripts/e2e/harness.ts` bypasses the MCP transport instead of booting it (A12 contract gap).** **File:** `scripts/e2e/harness.ts:1-37`. **Impact:** The harness imports `runStart` directly and synthesizes a fake `{ content: [{ type: 'text', text: JSON.stringify(...) }] }` envelope. No `McpServer` is constructed, no transport is connected, no zod argument validation is exercised. T-028 passes by asserting on the synthetic envelope, not on real MCP framing. Cycle 2 scenarios that depend on actual wire behavior will need a rewrite. The single-tool dispatch (`if (toolName === 'start')`) also means every new tool added in cycles 2-5 requires editing the harness — exactly the coupling the contract is trying to avoid. Contract A12 explicitly says the harness "boots the MCP server"; this implementation does not. **Recommendation:** Either (a) `index.ts` exports a `registerTools(server: McpServer)` factory that the harness mounts on an in-memory transport, or (b) the harness `spawn`s `node dist/index.js` over stdio and uses `Client` from `@modelcontextprotocol/sdk/client/...` to call tools. Either way, remove the per-tool `if`-branch. Held at medium because cycle 1 ships zero scenarios — the bug is contained today but will surface immediately when cycle 2 adds `runPreflightProbe`. **Reviewers:** R2, R4 (agreement=2). *Verification note:* Direct `runStart` import confirmed at line 1; no MCP server boot anywhere in the file.

### Low

- **C003 — `RegistryWarning.kind` is loosely typed `string` rather than a discriminated union.** `mcp/server/src/registry.ts:13-18`. The contract names a closed set of warning kinds; a tagged union would let consumers exhaustively switch and would catch typos at compile time. R2 only.
- **C004 — `existsSync` precheck on `path.json` invites EACCES misclassification + TOCTOU.** `mcp/server/src/registry.ts:64-84`. R3+R6 (agreement=2). Drop the precheck; branch on `err.code` in a single `try/catch` around `readFileSync`.
- **C006 — `RegistryWarning.dir?` is declared but never written.** `mcp/server/src/registry.ts:13-18`. R4 only. Dead field; drop or document.
- **C007 — Unbounded `readFileSync` on `path.json` and `settings.json` (theoretical OOM).** `mcp/server/src/registry.ts:76`, `outputStyle.ts:22`. R4+R6 (agreement=2). Trusted-developer threat model in cycle 1 makes this future-work; revisit if cycle 4+ adds untrusted-path import flows.
- **C008 — `PathInfo` and `PathData` are structurally identical, defined twice.** `mcp/server/src/registry.ts:5-11`. R4 only. Re-export `PathData` as `PathInfo` and replace the field-by-field copy with `paths.push(validation.value)`.
- **C009 — Field-by-field copy where `paths.push(validation.value)` would suffice.** `mcp/server/src/registry.ts:109-115`. Resolves with C008.
- **C011 — `outputStyle` silently accepts `enabledPlugins` as an array.** `mcp/server/src/outputStyle.ts:46-57`. R1 only. Tighten guard with `!Array.isArray(...)`; emit `settings-file-malformed` when the shape is wrong.
- **C012 — `OutputStyleWarning` and `RegistryWarning` are parallel shapes; `start.ts` discards `styleResult.warning`.** `mcp/server/src/outputStyle.ts:5-14`, `tools/start.ts:14-26`. R2 only. Either unify into a shared `EngineWarning` and merge into `start.warnings`, or expose a separate top-level slot.
- **C013 — `probeOutputStyle` returns `ok=false` with no warning when settings shape is wrong.** `mcp/server/src/outputStyle.ts:46-54`. R3 only. Distinguish absent-key (intentional silent-disable per A4) from wrong-shape (warning).
- **C016 — `validatePath` does not reject empty title/summary/build_command and allows duplicate `personalization_options`.** `mcp/server/src/schemas/path.ts:29-48`. R1 only. Apply the same non-empty check used for `slug`; assert `new Set(opts).size === opts.length`.
- **C019 — Harness `BootOptions.projectRoot` overlaps the per-call `projectRoot`.** `scripts/e2e/harness.ts:13-19`. Resolves with C018.
- **C020 — `index.ts` inlines tool registration with no `registerTools()` seam.** `mcp/server/src/index.ts:6-32`. Resolves with C018.
- **C021 — Top-level `await server.connect(transport)` crashes the process on transport failure.** `mcp/server/src/index.ts:30-31`. R3 only. Wrap `connect` in `try/catch`; wrap the `runStart` body for handler-level failure too.
- **C022 — `start.ts` owns the `paths` subdirectory naming convention.** `mcp/server/src/tools/start.ts:14-26`. R2 only. Move the `path.join(projectRoot, 'paths')` into `registry.ts` so the convention lives in one place.
- **C023 — `runStart` accepts non-absolute `projectRoot`.** `mcp/server/src/tools/start.ts:14-17`. R6 only. Add `z.string().refine(path.isAbsolute, ...)` to the schema. Cheap, future-proofs against cycle-2+ shell-action surfaces.
- **C025 — `zod` declared as dep but schemas are hand-rolled.** `mcp/server/package.json:16-19`. R4 only. Pick one path; the zod consumer is currently a single `z.string()` for the start tool input.
- **C001a (split out of C001) — Slug-vs-dirname mismatch is unverified.** `mcp/server/src/registry.ts:59-116`. R1-002 only. The contract does not require `slug === entry.name`, so this is a forward-looking warning rather than a violation; emit a `slug-dir-mismatch` warning or canonicalize on `entry.name`.

### Info

- **C005 — Symlinked path directories are silently dropped.** `mcp/server/src/registry.ts:42`. R3 only.
- **C014 — Triple cast to `Record<string, unknown>` for the same value.** `mcp/server/src/outputStyle.ts:46-56`. R4 only.
- **C015 — `outputStyle` warning leaks absolute homedir back to MCP caller** (and R6-005 affirmative: A13/A14 hold). `mcp/server/src/outputStyle.ts:23-44`. R6 only. Cycle 1 contract does not constrain warning verbosity.
- **C017 — Schema validators fail-fast; user fixes one error at a time.** `mcp/server/src/schemas/path.ts:20-48`. R3 only. Cycle-2+ enhancement.
- **C024 — `description.md` is unreferenced by the engine — content/engine boundary slightly underspecified.** `paths/01-orderbook-viewer/description.md`. R2 only.
- **C028 (info portion) — `expect(typeof parsed.commands).toBeDefined()` is a tautology.** `tests/registry.test.ts:88-93`. R5 only. The next line covers the intent.
- **C029 — T-038 phases-zero-spots matcher accepts mention of `p1` alone.** `tests/registry.test.ts:393-405`. R5 only.

## Test & coverage plan

- **Posture:** 41/41 unit tests pass on a freshly applied cycle. `tsc --noEmit` is green under `strict: true` + `moduleResolution: NodeNext`. Coverage is structurally good for `registry.ts` and `outputStyle.ts` (the two load-bearing modules) and the AC-1.3 zero-write invariant has explicit spy-based assertions in T-018. The mid-flight patches that wrapped `node:fs` and `node:fs/promises` with `vi.mock(..., { spy: true })` are correctly preserved (see `cycles/1/green/synthesis-notes.md`); they tightened the spy surface without changing what is asserted.

- **Concrete priority-ordered scenarios for follow-up (delivers the C001 fix and tightens the spy + grep coverage R5 flagged):**
  1. Add a registry test (call it T-040) that builds a fixture `paths/<slug>/` with valid `path.json` and a `phases.json` whose `phases` array is missing or contains a zero-spot phase. Assert: (a) the path is *omitted* from `result.paths` and (b) `result.warnings` contains a `malformed-phases-json` or `invalid-phases-json` entry naming the file. This is the test that turns C001 into a green-gate failure if a future cycle drops the validation back out.
  2. Add a registry test for the EACCES branch of C002. Use `chmod 000` on a fixture path subdir, assert the warning kind reflects permissions, not absence.
  3. Add a registry test that asserts `slug` field equals dirname (or amend the contract to declare the field advisory). Closes C001a.
  4. Strengthen T-018 spy list (C026): add `fs.createWriteStream`, `fs.open`/`fs.openSync` (with write-flag filter), `fs.copyFile`/`fs.copyFileSync`, `fsPromises.open`/`fsPromises.copyFile` — assert zero invocations under the AC-1.3 fixture.
  5. Strengthen T-027 grep scope (C027): expand `SCAN_ROOTS` to include `mcp/server/package.json`, `mcp/server/tsconfig.json`, `.claude-plugin/`, `agents/`, `hooks/`, and root-level `*.ts`/`*.md`/`*.json`. Replace the silent-return-on-missing-dir with an explicit fail.
  6. Strengthen T-031 spy list (C030): add `fs.createReadStream`, `fs.openSync`, `fs.open`, `fsPromises.open`. Keep the per-path resolution assertion.
  7. Strengthen T-029/T-030 grep scope (R5-004): walk every `.ts` file transitively imported by `outputStyle.ts`, not just the file itself, to defeat the "indirection helper module" bypass.
  8. Tighten T-002 (C028): require `entry.command` to be a non-empty string and `args[0]` (if present) to actually contain the built entry path, not just any substring of "mcp/server".

- **Suggested test utilities and assertion targets:**
  - A `mkPathFixture({ pathJson, phasesJson })` helper in `tests/_helpers/` that builds a one-shot fixture directory under `os.tmpdir()` and returns the root — would make T-040 trivial.
  - A `withSpiedFs(fn)` helper that installs the full write/read spy set in one call (resolves the C026/C030 duplication when the same module needs both negative and positive spies).
  - Replace the `errMessage.toMatch(/spot|empty|p1/)` assertion in T-038 (C029) with `errMessage.toMatch(/spot|empty/)`.

## Build reproducibility & ops

- No dep/build issues rise to merge-block severity. `pnpm install` resolves cleanly; `mcp/server/tsconfig.json` correctly declares `strict: true`, `moduleResolution: "NodeNext"`, ESM. `package.json` declares the `@modelcontextprotocol/sdk` and `zod` deps as expected by the contract.
- **Ops checklist for the next cycle:**
  - Pick a lane on `zod` vs hand-rolled schemas (C025). Either rewrite `schemas/path.ts`/`schemas/phases.ts` with `z.object` (the schemas are trivially expressible) or drop the dep and inline a 3-line type guard in `index.ts` for `projectRoot`.
  - Add a `registerTools(server: McpServer)` export in `mcp/server/src/index.ts` (resolves C018+C020 simultaneously); the bin script becomes the four lines that construct the server, call `registerTools`, and connect stdio.
  - Cycle 4 must verify `description.md` either has an engine-side contract (`missing-description-md` warning) or is documented as best-effort prose (C024). Pick before cycle 4 starts reading the file.
  - Carry-forward note for cycle 2: when `runPreflightProbe` lands, do *not* extend the harness's `if (toolName === 'start')` branch — that's the C018 hook. Boot the real server.

## Methodology

- 6 reviewers dispatched: R1 (correctness), R2 (design), R3 (error-handling), R4 (simplicity), R5 (tests-vs-impl), R6 (security). R0 backfill blocked by forge-guard's reviewer-fanout rule; proceeded without it because the high-behavior files (`registry.ts`, `outputStyle.ts`) had 28 combined reviewer touches.
- Coverage: `registry.ts` 20 touches, `outputStyle.ts` 8 touches, `tools/start.ts` 5 touches, `tests/*.test.ts` 6 touches (R5), `harness.ts` 2 touches, schemas 3 touches, `index.ts` 2 touches, plugin/manifest/data files ≤1 touch each (acceptable: those are mostly static fixtures). Flag rate: ~5.7 findings per reviewer (good — well above noise floor and below boilerplate inflation).
- Clusters before split: 30. After split: 31 (C001 split into C001 high + C001a low; C001b folded into existing C004/C007).
- Verification: 1 high cluster (C001), 0 critical, 0 disputed-after-split, 4 multi-reviewer mediums (C002, C010, C018; plus C004 and C007 which sit at low after re-derivation). All re-derived against source at the cited line ranges. Verification log in `cycles/1/_verification_notes.md`.
- Cycle-pass.sh result: see gate run below.

---

## Remediation log (post-review)

**C001 — Registry now invokes `validatePhases`.** After the gate fail on disputed C001, the orchestrator rolled state to `red`, added three regression tests (T-041 missing-phases-json, T-042 malformed-phases-json, T-043 invalid-phases-json) to `tests/registry.test.ts` and `tests.json`, confirmed the new tests fail meaningfully against the original implementation, then patched `mcp/server/src/registry.ts` to read+parse+validate `phases.json` after `path.json` and emit structured warnings (`missing-phases-json` | `malformed-phases-json` | `invalid-phases-json`) on each failure mode, mirroring the existing `path.json` flow. **Result:** 44/44 tests pass; `_consolidated.json` updated with `C001.disputed_severity = false` and `resolved = true`; `cycle-pass.sh` exits 0.

**Carry-forward (non-blocking, captured for cycle 2+):**
- C002 — `scanRegistry` collapses every `readdirSync` error into `no-paths-dir`. Branch on `err.code` (medium).
- C010 — `probeOutputStyle` collapses ENOENT and read-error into `settings-file-missing`. Branch on `err.code` (medium).
- C018 — `scripts/e2e/harness.ts` bypasses the MCP transport (direct `runStart` import) instead of booting it. Cycle 2's `runPreflightProbe` will be the forcing function (medium).

The 14 lows and 9 infos remain as documented; revisit during the corresponding feature cycles.
