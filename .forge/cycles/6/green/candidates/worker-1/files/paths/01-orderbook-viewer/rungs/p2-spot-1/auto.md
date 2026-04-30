# Auto-write — Phase 2, Spot 1

**File:** `src/App.tsx`
**Target range:** lines 103–114 (replace existing lines with the snippet below)

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
