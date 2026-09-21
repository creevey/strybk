import { describe, expect, it } from "bun:test";

import { waitForTimeout } from "../src/vitest/wait.js";

const elapsedMs = async (ms: number): Promise<number> => {
  const start = performance.now();

  await waitForTimeout(ms);

  return performance.now() - start;
};

describe("waitForTimeout", () => {
  it("resolves only after the requested time has elapsed", async () => {
    const waited = await elapsedMs(20);

    expect(waited).toBeGreaterThanOrEqual(10);
    expect(waited).toBeLessThan(1000);
  });

  it("resolves promptly for zero and negative timeouts", async () => {
    expect(await elapsedMs(0)).toBeLessThan(500);
    expect(await elapsedMs(-5)).toBeLessThan(500);
  });
});
