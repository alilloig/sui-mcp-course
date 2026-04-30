# Hint — Wrapping SDK Calls with withRetry

You need to implement a `withRetry` helper function that takes an async operation and retries it up to a configurable number of times when it throws.

Think of the signature: `async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T>`.

On each iteration:
- Call `fn()` inside a try/catch.
- If it succeeds, return the result immediately.
- If it throws and you have attempts remaining, catch the error and loop again.
- If it throws on the last attempt, re-throw the error so the caller sees it.

Place this helper in lines 103–114 of `src/App.tsx`. The polling loop (lines 116–145) will call it to wrap both `midPrice` and `getLevel2TicksFromMid`.
