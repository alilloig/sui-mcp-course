# Phase 1: SDK Configuration

In this phase you will wire the DeepBook TypeScript SDK to the local sandbox
deployment. The sandbox has already deployed the DeepBook contracts and published
a manifest at `http://localhost:9009/manifest` — a JSON file that records every
on-chain address your client needs.

## What you will build

Lines 39–58 of `src/App.tsx` contain three helper functions:

- **`packageIds(manifest)`** — extracts the `DEEPBOOK_PACKAGE_ID`, `REGISTRY_ID`,
  and `DEEP_TREASURY_ID` from the manifest's `packages` block.
- **`coinMap(manifest)`** — builds the `CoinMap` object mapping `DEEP`, `SUI`, and
  `USDC` to their on-chain types and decimal scalars.
- **`poolMap(manifest)`** — builds the `PoolMap` object pointing each pool key to
  its on-chain pool ID.

These three objects are the inputs to `deepbook.DeepBookClient` and every
subsequent SDK call in the app.

## Why it matters

Without a correctly-wired SDK client the app cannot fetch orderbook data.
The `pnpm build` verification gate runs the TypeScript compiler over the whole
project, so any shape mismatch between the manifest and the SDK's type definitions
is caught immediately.

## Tips

- `pickObject(objs, typeName, exclude?)` is a helper already in scope that
  locates an object by its Move type name suffix.
- The `DeepbookPackageIds`, `CoinMap`, and `PoolMap` types are imported from
  `@mysten/deepbook-v3` at the top of the file.
- Use `SUI_FRAMEWORK_ADDRESS` from `@mysten/sui/utils` for the SUI coin address.
