import type { Page } from "@playwright/test";

import type { StoriesRaw } from "./creeveyParams.js";

interface StorybookPreviewWindow extends Window {
  __STORYBOOK_PREVIEW__?: {
    extract?: () => unknown;
  };
}

const isStoriesRaw = (value: unknown): value is StoriesRaw =>
  typeof value === "object" && value !== null;

export const toStoriesRaw = (value: unknown): StoriesRaw => {
  if (!isStoriesRaw(value)) {
    throw new Error("Storybook preview not available; is Storybook fully loaded?");
  }

  return value;
};

export const extractStories = async (page: Page): Promise<StoriesRaw> =>
  toStoriesRaw(
    await page.evaluate(() => {
      const preview = (window as StorybookPreviewWindow).__STORYBOOK_PREVIEW__;

      return preview?.extract?.();
    }),
  );
