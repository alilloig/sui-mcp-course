# Hint — `p1-spot-1`: Manifest → SDK Config

You need to implement three pure functions that extract fields from the
raw manifest JSON. Focus on the `{{ pool_subset }}` pools — each pool
entry in the manifest has `poolId`, `baseCoinType`, and `quoteCoinType`.

## Key shape

The manifest's `packages` map has entries like:
```
packages.deepbook.packageId  → DEEPBOOK_PACKAGE_ID
packages.token.packageId     → coin address for DEEP
packages.usdc.packageId      → coin address for USDC
```

And `pools` has:
```
pools.DEEP_SUI.poolId        → pool object ID
pools.DEEP_SUI.baseCoinType  → full type string for DEEP coin
pools.SUI_USDC.quoteCoinType → full type string for USDC coin
```

## Tip on `pickObject`

Use the helper `pickObject(objs, typeName, exclude?)` already defined
above line 39 to fish out registry and treasury object IDs. It matches
against `::TypeName` at the end of the object type string.

## Next step

Once you've filled in all three functions, run `pnpm build` to confirm
the TypeScript compiles cleanly. The verification step will do this for you.
