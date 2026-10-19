import type { Page } from "@playwright/test";

import type { StoriesRaw } from "./creeveyParams.js";
import { extractPreviewState, waitForPreviewReady } from "./inPage.js";

const isStoriesRaw = (value: unknown): value is StoriesRaw =>
  typeof value === "object" && value !== null;

const previewReadyTimeoutMs = 10_000;

export const toStoriesRaw = (value: unknown): StoriesRaw => {
  if (!isStoriesRaw(value)) {
    throw new Error("Storybook preview not available; is Storybook fully loaded?");
  }

  return value;
};

export const extractStories = async (page: Page): Promise<StoriesRaw> => {
  // `#storybook-root` exists in the static iframe markup before the preview
  // store is initialized, so the fixture's selector wait does not guarantee
  // that `extract()` is callable yet. `ready()` is Storybook's own signal.
  await page.waitForFunction(waitForPreviewReady, undefined, {
    timeout: previewReadyTimeoutMs,
    polling: 100,
  });

  return toStoriesRaw(await page.evaluate(extractPreviewState, undefined));
};
