import { describe, expect, it } from "bun:test";

import { test, expect as strybkExpect, switchStory } from "../src/playwright/index.js";

describe("playwright public surface", () => {
  it("exports test and expect directly", () => {
    expect(typeof strybkExpect).toBe("function");
    expect(typeof test).toBe("function");
  });

  it("re-exports switchStory", () => {
    expect(typeof switchStory).toBe("function");
  });
});
