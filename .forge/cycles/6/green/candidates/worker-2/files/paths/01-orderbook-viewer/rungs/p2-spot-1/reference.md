# Reference — withRetry Implementation (lines 103-114)

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
```

This helper retries the provided async function up to `maxAttempts` times. On each failure it stores the error; after all attempts are exhausted it re-throws the last error. A successful call exits immediately via `return`.
