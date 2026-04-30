# Phase 1 — Bootstrap: Manifest → SDK Config

In this phase you wire the DeepBook Sandbox deployment manifest into the
TypeScript SDK so that the orderbook viewer can fetch live data from your
local devnet.

## What you'll do

The sandbox's `pnpm deploy-all` command writes a `localnet.json` manifest
listing every deployed package ID, pool address, and coin type. Your
`App.tsx` fetches this manifest at runtime via the `/api/faucet/manifest`
proxy and builds three SDK configuration objects from it:

- **`packageIds`** — points the SDK at the deployed `DEEPBOOK_PACKAGE_ID`,
  `REGISTRY_ID`, and `DEEP_TREASURY_ID`.
- **`coinMap`** — maps each coin ticker (`DEEP`, `SUI`, `USDC`) to its on-chain
  type, package address, and decimal scalar.
- **`poolMap`** — maps each pool name (`DEEP_SUI`, `SUI_USDC`) to its pool
  object ID and constituent coin keys.

These three objects feed directly into the `deepbook()` SDK extension:

```ts
client.$extend(
  deepbook({ address: ZERO_ADDR, packageIds, coins, pools })
)
```

## Lines in scope

`src/App.tsx` lines 39–58 contain three pure helper functions — `packageIds`,
`coinMap`, and `poolMap` — that extract the right fields from the raw
manifest JSON. Your task is to implement them correctly so that
`pnpm build` exits 0.

## Why this matters

Getting the manifest wiring right is the load-bearing first step: all
subsequent phases (polling, display) depend on having a correctly
constructed SDK client. A type error or missing field here causes the
SDK to silently use zero addresses, producing empty or misleading
orderbook data.

After completing this spot the engine will run `pnpm build` to confirm
the TypeScript compiles cleanly before advancing to phase 2.
