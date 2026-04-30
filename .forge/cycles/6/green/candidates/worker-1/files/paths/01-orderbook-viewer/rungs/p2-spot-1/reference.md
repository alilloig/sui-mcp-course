# Reference — Phase 2, Spot 1: withRetry helper (lines 103–114)

The following snippet implements the `withRetry` helper that should go at lines 103–114 of `src/App.tsx`. It wraps any generic async function and retries up to `retries` times with exponential backoff starting at `baseDelayMs` milliseconds.

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 200,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)),
        );
      }
    }
  }
  throw lastError;
}
```
