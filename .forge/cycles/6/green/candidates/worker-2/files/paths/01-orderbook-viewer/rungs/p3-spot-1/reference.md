# Reference — Polling Loop (lines 116-145)

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

This polling loop fires an initial tick immediately, then repeats every `{{ poll_interval_ms }}` ms. The `consecutiveFailures` counter resets on success and only surfaces an error after 3 in a row. The cleanup function cancels the interval on unmount.
