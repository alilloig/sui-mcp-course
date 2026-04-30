# Reference: Lines 39–58 of src/App.tsx

The following is the reference implementation for the manifest→SDK config spot (lines 39–58):

```typescript
function packageIds(m: Manifest): DeepbookPackageIds {
    return {
        DEEPBOOK_PACKAGE_ID: m.packages.deepbook.packageId,
        REGISTRY_ID: pickObject(m.packages.deepbook.objects, "Registry", "Margin"),
        DEEP_TREASURY_ID: pickObject(m.packages.token.objects, "ProtectedTreasury"),
    };
}
function coinMap(m: Manifest): CoinMap {
    return {
        DEEP: { address: m.packages.token.packageId, type: m.pools.DEEP_SUI.baseCoinType, scalar: 1_000_000 },
        SUI: { address: SUI_FRAMEWORK_ADDRESS, type: `${SUI_FRAMEWORK_ADDRESS}::sui::SUI`, scalar: 1_000_000_000 },
        USDC: { address: m.packages.usdc.packageId, type: m.pools.SUI_USDC.quoteCoinType, scalar: 1_000_000 },
    };
}
function poolMap(m: Manifest): PoolMap {
    return {
        DEEP_SUI: { address: m.pools.DEEP_SUI.poolId, baseCoin: "DEEP", quoteCoin: "SUI" },
        SUI_USDC: { address: m.pools.SUI_USDC.poolId, baseCoin: "SUI", quoteCoin: "USDC" },
    };
}
```

The `useMemo` hook that constructs the client (also in this range):

```typescript
    const client = useMemo(() => {
        if (!manifest) return null;
        return new SuiGrpcClient({ network: "custom", baseUrl: "http://localhost:9000" }).$extend(
            deepbook({ address: ZERO_ADDR, packageIds: packageIds(manifest), coins: coinMap(manifest), pools: poolMap(manifest) }),
        );
    }, [manifest]);
```

Note how `packageIds`, `coinMap`, and `poolMap` are called with the manifest inside `useMemo` so the client is only rebuilt when the manifest changes.
