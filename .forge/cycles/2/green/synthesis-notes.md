# Green-phase synthesis — cycle 2

## Pick
worker-2 — score=385 (LOC=385, files=5)

## Candidate scores
| Worker | Pass | LOC | Files | Notes |
|---|---|---|---|---|
| 1 | yes | 452 | 8 | passes 95/95; split into `index.ts` (lib) + `bin.ts` (executable) + dedicated `mcp/server/src/harness.ts`; cleaner separation but more files |
| 2 | yes | 385 | 5 | **chosen** — passes 95/95; single `index.ts` with `process.argv[1]`-guarded stdio bin; SDK re-exported through index.ts so harness imports work across workspace boundary |
| 3 | no  | 368 | 5 | 1 test failed; smallest LOC but did not pass — likely missed a load-bearing detail |
| 4 | no  | 385 | 5 | 1 test failed; same shape as worker-2 but diverged on at least one assertion |
| 5 | no  | 341 | 6 | 1 test failed; smallest LOC overall but suite did not pass |
| 6 | no  | 423 | 6 | 1 test failed; `process.env.VITEST` guard for stdio bin may have been less reliable than the `process.argv[1]` approach |

## Diversity signal
N=6 effective (no forge-guard blocks this round). Two distinct architectural approaches survived: worker-1's three-file split (`index.ts` + `bin.ts` + `mcp/server/src/harness.ts`) and worker-2's single-`index.ts` with `process.argv[1]` guard. Workers 3–6 converged on the latter pattern but each missed a load-bearing detail (1 test fail each, different tests likely). Diversity is **medium-high**: a real architectural fork existed, the simpler branch won, and the passers cluster on a recognizable design without all collapsing into the same diff.

## Notable design decision (worker-2)
SDK classes (`McpServer`, `Client`, `InMemoryTransport`) are re-exported through `mcp/server/src/index.ts` so the harness in `scripts/e2e/` can pull them across the pnpm workspace boundary without needing the SDK installed at the root. This sidesteps the subtle issue that `@modelcontextprotocol/sdk` lives only in `mcp/server/node_modules/`. Worker-1's solution to the same problem was to keep the harness's SDK code *inside* `mcp/server/src/harness.ts` and have `scripts/e2e/harness.ts` delegate to it — equally valid but adds one file.

## Applied
worker-2's files copied into the repo via `rsync -a candidates/worker-2/files/ .`. `pnpm install` ran successfully. `cycle-tests-pass.sh green` exit 0. **Cycle 1's 44 tests + cycle 2's 51 tests = 95/95 pass.**
