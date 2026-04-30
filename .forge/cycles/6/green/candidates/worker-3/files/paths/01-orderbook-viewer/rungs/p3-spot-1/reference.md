# Reference — Lines 116–145 of App.tsx

The following is the reference implementation for the polling tick (lines 116–145 of `src/App.tsx`). The literal `{{ poll_interval_ms }}` placeholder is substituted with your configured poll interval at hint-display time.

```tsx
        async function tick() {
            try {
                const [mid, ticks] = await Promise.all([
                    withRetry(() => client!.deepbook.midPrice(pool)),
                    withRetry(() => client!.deepbook.getLevel2TicksFromMid(pool, 10)),
                ]);
                if (cancelled) return;
                failures = 0;
                setBook({
                    midPrice: Number(mid),
                    asks: ticks.ask_prices.map((p, i) => ({ price: Number(p), qty: Number(ticks.ask_quantities[i]) })),
                    bids: ticks.bid_prices.map((p, i) => ({ price: Number(p), qty: Number(ticks.bid_quantities[i]) })),
                });
                setErr(null);
            } catch (e: unknown) {
                if (cancelled) return;
                failures++;
                // Only surface error after 3 consecutive failures
                if (failures >= 3) {
                    setErr((e as Error).message);
                }
            }
        }
        tick();
        const id = setInterval(tick, {{ poll_interval_ms }});
        return () => {
            cancelled = true;
            clearInterval(id);
        };
```

The polling interval is `{{ poll_interval_ms }}` milliseconds — set via your personalization choice. This interval controls how frequently the DeepBook SDK queries mid price and level 2 ticks.
