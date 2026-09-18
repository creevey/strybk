import type { Page } from "@playwright/test";

import type { StorybookDriver } from "./driver.js";
import { selectStoryInPage, updateGlobalsInPage } from "./inPage.js";

export function createChannelDriver(): StorybookDriver {
  return {
    async selectStory(page: Page, storyId: string): Promise<void> {
      await page.evaluate(selectStoryInPage, { storyId });
    },
    async updateGlobals(page: Page, globals: Record<string, unknown>): Promise<void> {
      await page.evaluate(updateGlobalsInPage, { globals });
    },
  };
}
