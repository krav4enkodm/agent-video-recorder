/**
 * Retries `assertion` until it stops throwing, then returns its result.
 * Integration specs use it instead of fixed sleeps, so a slow CI runner
 * waits longer instead of failing. Rethrows the last error on timeout.
 */
export async function eventually<T>(
  assertion: () => T | Promise<T>,
  { timeoutMs = 5000, intervalMs = 25 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await assertion()
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
}
