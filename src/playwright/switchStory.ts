import type { Page } from '@playwright/test';

import { createChannelDriver } from '../storybook/channelDriver.js';

const defaultDriver = createChannelDriver();

export async function switchStory(page: Page, storyId: string): Promise<void> {
  await defaultDriver.selectStory(page, storyId);
}