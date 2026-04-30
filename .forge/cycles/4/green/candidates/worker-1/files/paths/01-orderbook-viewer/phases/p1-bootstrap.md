# Phase 1 — Connect the DeepBook SDK

In this phase you will wire up the three helper functions that translate the
sandbox deployment manifest into the data structures the DeepBook TypeScript SDK
expects:

- **`packageIds`** — pulls the DeepBook package address, the on-chain Registry
  object ID, and the ProtectedTreasury ID out of the manifest.
- **`coinMap`** — builds a `CoinMap` describing DEEP, SUI, and USDC with their
  package addresses, full coin types, and decimal scalars.
- **`poolMap`** — builds a `PoolMap` associating each pool name (DEEP_SUI and
  SUI_USDC) with its on-chain pool object ID and base/quote coin symbols.

Together these three functions form the glue between the localnet deployment
manifest (served at `http://localhost:9009/manifest` by the running sandbox) and
the `deepbook(...)` SDK plugin call that powers all the read-only queries in
this app.

Once they are correct, the app calls `new SuiGrpcClient(...).$extend(deepbook({ ... }))`
and every subsequent `client.deepbook.midPrice(pool)` and
`client.deepbook.getLevel2TicksFromMid(pool, depth)` call will work against
your localnet.

**Target**: `src/App.tsx`, lines 39–58.

**Verification**: `pnpm build` must exit 0 (TypeScript + Vite compilation).
