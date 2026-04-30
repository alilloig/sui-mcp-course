# Hint — Wire the SDK Configuration

You are configuring the DeepBook SDK client for {{ pool_subset }} pools.

## Anatomy of the manifest

Each key in `m.packages` has a `packageId` (the Move package address) and an
`objects` array. Each object has `objectId` and `objectType`. The `pickObject`
helper extracts an objectId by matching the Move type name with a regex.

## Steps

1. For `packageIds`: call `pickObject` with `"Registry"` (exclude `"Margin"`)
   and with `"ProtectedTreasury"` from the token package's objects.

2. For `coinMap`: the `scalar` values are the token's decimal precision:
   - DEEP: `1_000_000` (6 decimals)
   - SUI: `1_000_000_000` (9 decimals)
   - USDC: `1_000_000` (6 decimals)

3. For `poolMap`: use the pool's `poolId` as `address` and the coin ticker
   strings (`"DEEP"`, `"SUI"`, `"USDC"`) for `baseCoin`/`quoteCoin`.

## TypeScript tip

Import `SUI_FRAMEWORK_ADDRESS` from `@mysten/sui/utils` for the SUI coin's
`address` field — don't hardcode the zero address.
