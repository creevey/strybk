import { describe, expect, it } from "bun:test";

import {
  describe as strybkDescribe,
  expect as strybkExpect,
  switchStory,
  test,
} from "../src/playwright/index.js";

describe("playwright public surface", () => {
  it("exports test and expect directly", () => {
    expect(typeof strybkExpect).toBe("function");
    expect(typeof test).toBe("function");
  });

  it("re-exports switchStory", () => {
    expect(typeof switchStory).toBe("function");
  });

  it("exports describe bound to test.describe", () => {
    expect(typeof strybkDescribe).toBe("function");
    expect(strybkDescribe).toBe(test.describe);
  });
});
