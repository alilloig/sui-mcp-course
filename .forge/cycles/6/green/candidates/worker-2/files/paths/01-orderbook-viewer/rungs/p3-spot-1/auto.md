# Auto-write — Polling Loop (target_range: 116-145, target_file: src/App.tsx)

Replace lines 116–145 of `src/App.tsx` with the following block:

```typescript
  useEffect(() => {
    let consecutiveFailures = 0;

    const tick = async () => {
      try {
        const [mid, ticks] = await Promise.all([
          withRetry(() => deepbookClient.midPrice(poolId), 3),
          withRetry(() => deepbookClient.getLevel2TicksFromMid(poolId, 10), 3),
        ]);
        consecutiveFailures = 0;
        setMidPrice(mid);
        setOrderBook(ticks);
        setError(null);
      } catch (err) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          setError(
            err instanceof Error ? err.message : 'Polling failed after 3 consecutive errors',
          );
        }
      }
    };

    tick();
    const intervalId = setInterval(tick, {{ poll_interval_ms }});

    return () => {
      clearInterval(intervalId);
    };
  }, [deepbookClient, poolId]);
```
