import { describe, expect, it } from "vitest";

import { toStoriesRaw } from "../src/storybook/extract.js";

describe("toStoriesRaw", () => {
  it("returns the value when it is a non-null object", () => {
    const stories = { "button--default": { title: "Button", name: "Default", parameters: {} } };

    expect(toStoriesRaw(stories)).toBe(stories);
  });

  it("throws when the preview returned nothing", () => {
    expect(() => toStoriesRaw(undefined)).toThrow(/Storybook preview/u);
    expect(() => toStoriesRaw(null)).toThrow(/Storybook preview/u);
  });
});
