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
