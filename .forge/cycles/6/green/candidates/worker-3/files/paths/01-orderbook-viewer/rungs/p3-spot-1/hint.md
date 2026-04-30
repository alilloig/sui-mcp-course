# Hint — Implementing the Polling Tick

The `tick` function fires once immediately and then repeats via `setInterval`. Inside `tick`, use `Promise.all` to call both `withRetry(() => client!.deepbook.midPrice(pool))` and `withRetry(() => client!.deepbook.getLevel2TicksFromMid(pool, 10))` concurrently.

Key details:

- Track a `failures` counter in the outer `useEffect` closure. Reset it to 0 on success.
- On catch, increment `failures` but only call `setErr(...)` when `failures >= 3`. This prevents transient blips from showing error UI.
- Check `cancelled` before every state update — the cleanup function sets it to `true` when the effect tears down.
- Start the polling interval with `setInterval(tick, <your poll interval ms>)` after the first `tick()` call.
- Return a cleanup that sets `cancelled = true` and calls `clearInterval(id)`.
