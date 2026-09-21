/**
 * Timeout waits for the Vitest-branch `sharedPage`. Kept free of
 * `vitest/browser` imports so the behavior can run and be tested under Bun.
 */

export const waitForTimeout = (ms: number): Promise<void> => {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
