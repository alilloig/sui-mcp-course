# Reference — Phase 3, Spot 1: Polling tick (lines 116–145)

The following snippet implements the polling tick at lines 116–145 of `src/App.tsx`. Replace `{{ poll_interval_ms }}` with the configured interval value before writing.

```typescript
  useEffect(() => {
    if (!deepbookClient) return;

    let consecutiveFailures = 0;
    const MAX_FAILURES = 3;

    const tick = async (): Promise<void> => {
      try {
        const [mid, ticks] = await withRetry(() =>
          Promise.all([
            deepbookClient.midPrice({ poolKey: poolKey }),
            deepbookClient.getLevel2TicksFromMid({ poolKey: poolKey, depth: 10 }),
          ]),
        );
        consecutiveFailures = 0;
        setMidPrice(mid);
        setOrderBookTicks(ticks);
        setError(null);
      } catch (err) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_FAILURES) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void tick();
    const intervalId = setInterval(() => void tick(), {{ poll_interval_ms }});
    return () => clearInterval(intervalId);
  }, [deepbookClient, poolKey]);
```
