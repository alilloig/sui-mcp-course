# Auto-write payload — Polling tick (target_range: 116-145)

Replace lines 116-145 of `src/App.tsx` with:

```tsx
useEffect(() => {
  let cancelled = false;

  async function tick(): Promise<void> {
    try {
      const ticks = await withRetry(() =>
        deepbook.getLevel2TicksFromMid({
          poolId: pool.poolId,
          depth: 10,
        }),
      );
      if (!cancelled) {
        setLevel2Ticks(ticks);
        setError(null);
      }
    } catch (err) {
      if (!cancelled) {
        console.error('Polling tick failed after retries:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  // Fire immediately on mount, then on each interval tick.
  void tick();
  const handle = setInterval(() => void tick(), {{ poll_interval_ms }});

  return () => {
    cancelled = true;
    clearInterval(handle);
  };
}, [deepbook, pool.poolId]);
```
