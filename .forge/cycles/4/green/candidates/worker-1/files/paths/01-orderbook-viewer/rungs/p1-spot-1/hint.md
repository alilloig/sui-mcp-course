# Hint — Phase 1, Spot 1

You need to implement `packageIds`, `coinMap`, and `poolMap` so the DeepBook SDK can
talk to your localnet deployment.

**You are working with the {{ pool_subset }} pool(s).**

Here are the key shapes to keep in mind:

- `DeepbookPackageIds` expects `DEEPBOOK_PACKAGE_ID`, `REGISTRY_ID`, and `DEEP_TREASURY_ID`.
  The registry is found by matching `::Registry` (excluding `Margin`) in the deepbook package objects.
  The treasury is found by matching `::ProtectedTreasury` in the token package.

- `CoinMap` maps coin symbols to `{ address, type, scalar }`. The scalar for DEEP and USDC is
  `1_000_000` (6 decimals); for SUI it is `1_000_000_000` (9 decimals). Use `SUI_FRAMEWORK_ADDRESS`
  for SUI's address.

- `PoolMap` maps pool names to `{ address, baseCoin, quoteCoin }` where `address` is the pool
  object ID from the manifest.

The `pickObject` helper at line 33 takes an array of objects, a type name suffix (e.g. `"Registry"`),
and an optional exclusion string. Use it to extract the correct object IDs.
