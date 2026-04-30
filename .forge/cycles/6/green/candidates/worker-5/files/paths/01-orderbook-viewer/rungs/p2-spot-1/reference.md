# Reference — withRetry helper (lines 103-114 of src/App.tsx)

```tsx
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 200,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}
```

This implements a simple exponential back-off retry helper. The `fn` parameter is a zero-argument async factory so callers can pass `() => deepbook.someCall(args)` without worrying about argument binding.
