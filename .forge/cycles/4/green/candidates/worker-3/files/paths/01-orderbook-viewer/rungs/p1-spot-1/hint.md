# Hint: Wiring the SDK Config

You need to wire {{ pool_subset }} as the pool set for this spot.

## Key insight

The `packageIds`, `coinMap`, and `poolMap` helper functions each read from the `Manifest` object that was fetched in the first `useEffect`. The `pickObject` helper (defined just above line 39) handles the regex-based object lookup — use it for Registry and ProtectedTreasury objects.

## Structure to follow

```typescript
function packageIds(m: Manifest): DeepbookPackageIds {
  return {
    DEEPBOOK_PACKAGE_ID: m.packages.deepbook.packageId,
    REGISTRY_ID: pickObject(m.packages.deepbook.objects, "Registry", "Margin"),
    DEEP_TREASURY_ID: pickObject(m.packages.token.objects, "ProtectedTreasury"),
  };
}
```

For `coinMap`, each entry needs `{ address, type, scalar }`. Use `SUI_FRAMEWORK_ADDRESS` (already imported) for the SUI coin address, and `m.packages.<pkg>.packageId` for DEEP and USDC.

For the `useMemo` client, the `deepbook(...)` plugin takes `{ address, packageIds, coins, pools }` — pass `ZERO_ADDR` for address and call your three helpers to populate the rest.
