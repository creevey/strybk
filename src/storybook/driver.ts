import type { Page } from "@playwright/test";

export interface StorybookDriver {
  selectStory(page: Page, storyId: string): Promise<void>;
  updateGlobals(page: Page, globals: Record<string, unknown>): Promise<void>;
}
