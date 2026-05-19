import { describe, expect, it } from "bun:test";

import { createStrybkFixtures, switchStory } from "../src/playwright/index.js";

describe("playwright public surface", () => {
  it("exports createStrybkFixtures with test and expect handles", () => {
    const fixtures = createStrybkFixtures();

    expect(typeof fixtures.expect).toBe("function");
    expect(typeof fixtures.test).toBe("function");
  });

  it("re-exports switchStory", () => {
    expect(typeof switchStory).toBe("function");
  });
});
