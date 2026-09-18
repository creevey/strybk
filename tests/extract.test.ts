import type { Page } from "@playwright/test";

import { afterEach, describe, expect, it } from "bun:test";

import type { StorybookPreviewWindow } from "../src/storybook/inPage.js";
import { extractPreviewState } from "../src/storybook/inPage.js";
import { extractStories, toStoriesRaw } from "../src/storybook/extract.js";

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

describe("extractPreviewState", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("returns the preview extract() result from the provided window", () => {
    const stories = { "button--default": { title: "Button", name: "Default" } };
    const win: StorybookPreviewWindow = {
      __STORYBOOK_PREVIEW__: {
        extract: (): unknown => stories,
      },
    };

    expect(extractPreviewState(win)).toBe(stories);
  });

  it("returns undefined when the provided window has no preview", () => {
    expect(extractPreviewState({})).toBeUndefined();
  });

  it("falls back to the ambient window when no window is provided", () => {
    (globalThis as { window?: unknown }).window = {
      __STORYBOOK_PREVIEW__: {
        extract: (): unknown => ({ ambient: { title: "Ambient", name: "Story" } }),
      },
    };

    expect(extractPreviewState()).toEqual({
      ambient: { title: "Ambient", name: "Story" },
    });
  });
});

describe("extractStories", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("extracts through page.evaluate against the ambient window", async () => {
    const stories = { "button--default": { title: "Button", name: "Default" } };

    (globalThis as { window?: unknown }).window = {
      __STORYBOOK_PREVIEW__: {
        extract: (): unknown => stories,
      },
    };

    const page = {
      evaluate: (pageFunction: () => unknown): Promise<unknown> => Promise.resolve(pageFunction()),
    } as unknown as Page;

    expect(await extractStories(page)).toBe(stories);
  });

  it("throws the preview-unavailable error when evaluate returns nothing", async () => {
    (globalThis as { window?: unknown }).window = {};

    const page = {
      evaluate: (pageFunction: () => unknown): Promise<unknown> => Promise.resolve(pageFunction()),
    } as unknown as Page;

    let rejection: unknown;

    try {
      await extractStories(page);
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);

    if (rejection instanceof Error) {
      expect(rejection.message).toMatch(/Storybook preview/u);
    }
  });
});
