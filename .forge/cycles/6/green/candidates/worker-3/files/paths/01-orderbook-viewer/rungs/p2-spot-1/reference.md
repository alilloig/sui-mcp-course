# Reference — Lines 103–114 of App.tsx

The following is the reference implementation for the `withRetry` helper (lines 103–114 of `src/App.tsx`):

```tsx
        async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
            for (let i = 0; i < retries; i++) {
                try {
                    return await fn();
                } catch (e) {
                    if (i === retries - 1) throw e;
                    // Brief pause before retry — lets the node finish processing
                    await new Promise((r) => setTimeout(r, 300));
                }
            }
            throw new Error("unreachable");
        }
```

This helper iterates up to `retries` times (default 2), returning on the first success and re-throwing on the final attempt. The 300ms pause between retries gives the gRPC node time to finish processing before the next attempt.
