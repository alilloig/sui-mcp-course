# Auto-write — withRetry (target_range: 103-114, target_file: src/App.tsx)

Replace lines 103–114 of `src/App.tsx` with the following block:

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
