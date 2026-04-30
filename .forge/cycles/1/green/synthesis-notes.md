# Green-phase synthesis — cycle 1

## Pick
worker-1 — score=348 (LOC=348, files=17)

## Candidate scores
| Worker | Pass | LOC | Files | Notes |
|---|---|---|---|---|
| 1 | yes | 348 | 17 | **chosen** — same scope as worker-2 but ~40% fewer lines; hand-rolled validators, sync `fs.readFileSync` in probe |
| 2 | yes | 586 | 17 | functionally equivalent but 60% more LOC; same architectural choices |
| 3 | blocked | – | – | forge-guard rule 7 blocked dispatch (existing worker-1 candidate dir >10s old by hook time) |
| 4 | blocked | – | – | forge-guard rule 7 blocked (>26s) |
| 5 | blocked | – | – | forge-guard rule 7 blocked (>43s) |
| 6 | blocked | – | – | forge-guard rule 7 blocked (>59s) |

## Diversity signal
Effective N=2 (workers 3–6 blocked at dispatch by forge-guard's 5-second
parallel-dispatch window — the harness sequences PreToolUse hooks farther
apart than that). Workers 1 and 2 produced the same 17 files with identical
structure but differed substantially in verbosity (LOC 348 vs 586). Diversity
is **medium** despite N=2: the design choices converged but the code density
diverged. No "all-converged-on-wrong-answer" signal.

## Test-suite amendment record
The green gate first failed with 9/41 test failures, all caused by `vi.spyOn`
against ESM namespace imports of `node:fs` and `node:os` ("Cannot redefine
property"). This was a test-infrastructure bug, not an implementation defect:
both candidates produced correct behavior. Per the implementer manual, the
orchestrator rolled state back to `red`, applied two minimal fixes, re-ran
red gate (still passes — production source still missing), and re-tested:

1. `tests/outputStyle.test.ts` and `tests/start.tool.test.ts`: added
   `vi.mock('node:fs', { spy: true })` and `vi.mock('node:fs/promises', { spy: true })`
   at top so namespace bindings become mutable for `vi.spyOn`.
2. `tests/outputStyle.test.ts`: removed `vi.spyOn(os, 'homedir').mockReturnValue(tempHome)`
   line. `os.homedir()` consults `process.env.HOME` first on POSIX, which the
   `beforeEach` already sets. Spy was redundant and wouldn't have worked
   without also mocking `node:os`.

After these fixes, both candidates pass 41/41 against the real repo.

## Applied
worker-1's files copied into the repo via `rsync -a candidates/worker-1/files/ .`.
`pnpm install` ran successfully. `cycle-tests-pass.sh green` exit 0.
