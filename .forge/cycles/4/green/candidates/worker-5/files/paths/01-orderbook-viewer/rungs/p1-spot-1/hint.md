# Hint: Wire the SDK Config

You need to implement three pure functions that translate the sandbox deployment
manifest into the three configuration objects the DeepBook SDK expects.

**For `packageIds`**: The manifest's `packages` block maps package names to their
on-chain IDs. Use `pickObject(objs, typeName, exclude?)` to locate the right
object by its Move type suffix.

**For `coinMap`**: Each coin needs an `address`, a `type` string (full Move type
path), and a `scalar` (the smallest on-chain unit per display unit). The SUI coin
address comes from `SUI_FRAMEWORK_ADDRESS` imported at the top of the file.

**For `poolMap`**: Each pool key maps to `{ address, baseCoin, quoteCoin }`.

> You are configuring {{ pool_subset }} as your pool scope. Check that
> `poolMap` returns entries for every pool you intend to query.

Once all three functions compile, `pnpm build` will exit 0 and verification passes.
