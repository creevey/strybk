import type { Page } from "@playwright/test";

import { afterEach, describe, expect, it, mock } from "bun:test";

import type { StorybookPreviewWindow } from "../src/storybook/inPage.js";
import { extractPreviewState, waitForPreviewReady } from "../src/storybook/inPage.js";
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

  it("returns the preview extract() result from the provided window", async () => {
    const stories = { "button--default": { title: "Button", name: "Default" } };
    const win: StorybookPreviewWindow = {
      __STORYBOOK_PREVIEW__: {
        extract: (): unknown => stories,
      },
    };

    expect(await extractPreviewState(win)).toBe(stories);
  });

  it("awaits a Storybook 9 style async extract()", async () => {
    const stories = { "button--default": { title: "Button", name: "Default" } };
    const win: StorybookPreviewWindow = {
      __STORYBOOK_PREVIEW__: {
        extract: (): unknown => Promise.resolve(stories),
      },
    };

    expect(await extractPreviewState(win)).toBe(stories);
  });

  it("returns undefined when the provided window has no preview", async () => {
    expect(await extractPreviewState({})).toBeUndefined();
  });

  it("falls back to the ambient window when no window is provided", async () => {
    (globalThis as { window?: unknown }).window = {
      __STORYBOOK_PREVIEW__: {
        extract: (): unknown => ({ ambient: { title: "Ambient", name: "Story" } }),
      },
    };

    expect(await extractPreviewState()).toEqual({
      ambient: { title: "Ambient", name: "Story" },
    });
  });
});

describe("waitForPreviewReady", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("returns false while the preview global is absent", async () => {
    (globalThis as { window?: unknown }).window = {};

    expect(await waitForPreviewReady()).toBe(false);
  });

  it("waits for ready() before reporting the preview as ready", async () => {
    let release = (): void => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });

    (globalThis as { window?: unknown }).window = {
      __STORYBOOK_PREVIEW__: {
        ready: (): Promise<void> => ready,
      },
    };

    let settled = false;
    const pending = waitForPreviewReady().then((value: boolean) => {
      settled = true;

      return value;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    expect(await pending).toBe(true);
  });

  it("falls back to initializationPromise when ready() is absent", async () => {
    let release = (): void => {};
    const initializationPromise = new Promise<void>((resolve) => {
      release = resolve;
    });

    (globalThis as { window?: unknown }).window = {
      __STORYBOOK_PREVIEW__: {
        initializationPromise,
      },
    };

    let settled = false;
    const pending = waitForPreviewReady().then((value: boolean) => {
      settled = true;

      return value;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    expect(await pending).toBe(true);
  });

  it("resolves when the preview exposes neither a ready signal nor extract", async () => {
    (globalThis as { window?: unknown }).window = {
      __STORYBOOK_PREVIEW__: {},
    };

    expect(await waitForPreviewReady()).toBe(true);
  });

  it("propagates a rejected readiness promise", async () => {
    (globalThis as { window?: unknown }).window = {
      __STORYBOOK_PREVIEW__: {
        ready: (): Promise<void> => Promise.reject(new Error("preview failed")),
      },
    };

    let rejection: unknown;

    try {
      await waitForPreviewReady();
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);

    if (rejection instanceof Error) {
      expect(rejection.message).toBe("preview failed");
    }
  });
});

describe("extractStories", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("waits for preview readiness, then extracts through page.evaluate", async () => {
    const stories = { "button--default": { title: "Button", name: "Default" } };

    (globalThis as { window?: unknown }).window = {
      __STORYBOOK_PREVIEW__: {
        ready: (): Promise<void> => Promise.resolve(),
        extract: (): unknown => stories,
      },
    };

    const waitForFunction = mock((): Promise<unknown> => Promise.resolve(true));
    const evaluate = mock(
      (pageFunction: () => unknown): Promise<unknown> => Promise.resolve(pageFunction()),
    );
    const page = { waitForFunction, evaluate } as unknown as Page;

    expect(await extractStories(page)).toBe(stories);
    expect(waitForFunction).toHaveBeenCalledWith(waitForPreviewReady, undefined, {
      timeout: 10_000,
      polling: 100,
    });
    expect(evaluate).toHaveBeenCalledWith(extractPreviewState, undefined);
    expect(waitForFunction.mock.invocationCallOrder[0]).toBeLessThan(
      evaluate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("throws the preview-unavailable error when evaluate returns nothing", async () => {
    (globalThis as { window?: unknown }).window = {};

    const waitForFunction = mock((): Promise<unknown> => Promise.resolve(true));
    const evaluate = mock(
      (pageFunction: () => unknown): Promise<unknown> => Promise.resolve(pageFunction()),
    );
    const page = { waitForFunction, evaluate } as unknown as Page;

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

  it("propagates a preview initialization failure without extracting", async () => {
    const failure = new Error("Error reading preview.js");
    const waitForFunction = mock((): Promise<unknown> => Promise.reject(failure));
    const evaluate = mock(
      (pageFunction: () => unknown): Promise<unknown> => Promise.resolve(pageFunction()),
    );
    const page = { waitForFunction, evaluate } as unknown as Page;

    let rejection: unknown;

    try {
      await extractStories(page);
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBe(failure);
    expect(evaluate).not.toHaveBeenCalled();
  });
});
