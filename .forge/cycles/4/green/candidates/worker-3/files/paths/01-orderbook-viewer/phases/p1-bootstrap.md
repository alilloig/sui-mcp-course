# Phase 1: Manifest → SDK Config

Welcome to Phase 1 of the Orderbook Viewer path.

## What you'll build

The DeepBook sandbox ships a deployment manifest (`sandbox/deployments/localnet.json`) that records every deployed package address, object ID, and pool configuration. Your React app needs to translate that manifest into the typed structures the DeepBook TypeScript SDK expects before it can query prices or order book depth.

## The three helper functions

Lines 39–58 of `src/App.tsx` define three pure functions and a `useMemo` hook:

1. **`packageIds(m)`** — extracts `DEEPBOOK_PACKAGE_ID`, `REGISTRY_ID`, and `DEEP_TREASURY_ID` from the manifest using the `pickObject` helper already defined above.

2. **`coinMap(m)`** — builds the `CoinMap` record mapping ticker symbols (`DEEP`, `SUI`, `USDC`) to their on-chain metadata (package address, coin type, decimal scalar).

3. **`poolMap(m)`** — builds the `PoolMap` record mapping pool names (`DEEP_SUI`, `SUI_USDC`) to their pool object IDs and base/quote coin references.

4. **`client` (useMemo)** — constructs a `SuiGrpcClient` pointed at `http://localhost:9000` (the sandbox localnet gRPC port), extended with the `deepbook(...)` plugin using the three helpers above.

## Why this design

The DeepBook SDK is built around a plugin pattern: a base `SuiGrpcClient` is extended with domain-specific methods via `.$extend(deepbook(...))`. This keeps the RPC transport and the domain logic cleanly separated. The manifest is the single source of truth for all on-chain addresses — hard-coding addresses would break across sandbox redeployments.

## What comes next

Phase 2 wires the polling `useEffect` that calls `client.deepbook.midPrice` and `client.deepbook.getLevel2TicksFromMid` every 3 seconds, and Phase 3 renders the resulting data as a visual order book table. For now, focus on getting `pnpm build` to pass with the three helpers and the `useMemo` in place.
