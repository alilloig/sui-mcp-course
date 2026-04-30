# Phase 1: Wire the SDK Configuration

In this phase you will implement the three helper functions that convert the
DeepBook sandbox deployment manifest into the typed configuration objects the
`@mysten/deepbook-v3` SDK client expects.

## What the sandbox faucet gives you

The faucet (`/api/faucet/manifest`) returns a `Manifest` object describing the
live localnet deployment:

- `packages.deepbook` — the DeepBook core package address + on-chain objects
- `packages.token` — the DEEP token package + ProtectedTreasury object
- `packages.usdc` — the USDC mock package
- `pools.DEEP_SUI` / `pools.SUI_USDC` — pool IDs and coin types

## What you need to implement

Three pure functions that read the manifest and return SDK-typed values:

1. **`packageIds(m)`** → `DeepbookPackageIds`
   - `DEEPBOOK_PACKAGE_ID` from `m.packages.deepbook.packageId`
   - `REGISTRY_ID` — the Registry object (exclude Margin variants)
   - `DEEP_TREASURY_ID` — the ProtectedTreasury object from the token package

2. **`coinMap(m)`** → `CoinMap`
   - `DEEP`, `SUI`, `USDC` entries with `address`, `type`, and `scalar`
   - SUI uses the constant `SUI_FRAMEWORK_ADDRESS` from `@mysten/sui/utils`

3. **`poolMap(m)`** → `PoolMap`
   - `DEEP_SUI` and `SUI_USDC` entries with `address`, `baseCoin`, `quoteCoin`

## Helper already provided

`pickObject(objs, typeName, exclude?)` matches an on-chain object by its Move
type name using a safe regex (`::TypeName` followed by `<` or end-of-string).

## Verification

Run `pnpm build` from the project root. A TypeScript compile with zero errors
means your implementations satisfy the SDK's type contracts.
