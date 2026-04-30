# Hint — Implementing withRetry

The `withRetry` helper wraps any `() => Promise<T>` in a retry loop. The key insight is that you iterate up to `retries` times, catching errors on each attempt. On the last iteration you re-throw so the caller sees the error. Between attempts (not before the first) add a brief pause to let the node finish processing.

**Shape to aim for:**

```ts
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error("unreachable");
}
```

The `throw new Error("unreachable")` after the loop is required to satisfy TypeScript's control-flow analysis — the loop always returns or throws first.
