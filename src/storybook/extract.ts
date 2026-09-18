import type { Page } from "@playwright/test";

import type { StoriesRaw } from "./creeveyParams.js";
import { extractPreviewState } from "./inPage.js";

const isStoriesRaw = (value: unknown): value is StoriesRaw =>
  typeof value === "object" && value !== null;

export const toStoriesRaw = (value: unknown): StoriesRaw => {
  if (!isStoriesRaw(value)) {
    throw new Error("Storybook preview not available; is Storybook fully loaded?");
  }

  return value;
};

export const extractStories = async (page: Page): Promise<StoriesRaw> =>
  toStoriesRaw(await page.evaluate(extractPreviewState, undefined));
