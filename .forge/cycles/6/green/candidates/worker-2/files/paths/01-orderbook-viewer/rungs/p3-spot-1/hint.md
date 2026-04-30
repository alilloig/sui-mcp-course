# Hint — Polling Loop with Consecutive-Failure Tolerance

You need to implement a polling tick that fires every `{{ poll_interval_ms }}` milliseconds, fetches both `midPrice` and `getLevel2TicksFromMid`, and only surfaces an error to the UI after 3 consecutive failures.

Key points:
- Use `setInterval` with `{{ poll_interval_ms }}` as the delay.
- Keep a `consecutiveFailures` counter initialized to 0 outside the interval callback.
- On success: reset `consecutiveFailures = 0` and update the UI state with the new data.
- On failure: increment `consecutiveFailures`. Only call `setError(...)` when `consecutiveFailures >= 3`.
- Wrap each SDK call with `withRetry` so transient gRPC errors are absorbed before the counter increments.

Lines 116–145 of `src/App.tsx` are the target.
