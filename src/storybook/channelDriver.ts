import type { Page } from '@playwright/test';

import type { StorybookDriver } from './driver.js';

interface StorybookChannel {
  on(eventName: string, listener: (payload: unknown) => void): void;
  off(eventName: string, listener: (payload: unknown) => void): void;
  emit(eventName: string, payload: unknown): void;
}

interface StorybookWindow extends Window {
  __STORYBOOK_ADDONS_CHANNEL__?: StorybookChannel;
}

const storySwitchTimeoutMs = 10_000;

export function createChannelDriver(): StorybookDriver {
  return {
    async selectStory(page: Page, storyId: string): Promise<void> {
      await page.evaluate(async (currentStoryId) => {
        const channel = (window as StorybookWindow).__STORYBOOK_ADDONS_CHANNEL__;

        if (!channel) {
          throw new Error('Storybook addons channel is unavailable');
        }

        await new Promise<void>((resolve, reject) => {
          let settled = false;

          const cleanup = (): void => {
            channel.off('storyRendered', handleSuccess);
            channel.off('storyUnchanged', handleSuccess);
            channel.off('storyErrored', handleError);
          };

          const settle = (callback: () => void): void => {
            if (settled) {
              return;
            }

            settled = true;
            clearTimeout(timeout);
            cleanup();
            callback();
          };

          const handleSuccess = (): void => {
            cleanup();
            void (document.fonts?.ready ?? Promise.resolve())
              .then(() => {
                settle(() => {
                  resolve();
                });
              })
              .catch((error: unknown) => {
                settle(() => {
                  reject(error);
                });
              });
          };

          const handleError = (payload: unknown): void => {
            const message =
              typeof payload === 'object' && payload !== null && 'description' in payload && typeof payload.description === 'string'
                ? payload.description
                : `Storybook failed to render story ${currentStoryId}`;

            settle(() => {
              reject(new Error(message));
            });
          };

          const timeout = setTimeout(() => {
            settle(() => {
              reject(new Error(`Failed to select story '${currentStoryId}': Story switch timeout`));
            });
          }, storySwitchTimeoutMs);

          channel.on('storyRendered', handleSuccess);
          channel.on('storyUnchanged', handleSuccess);
          channel.on('storyErrored', handleError);
          channel.emit('setCurrentStory', { storyId: currentStoryId });
        });
      }, storyId);
    },
    async updateGlobals(page: Page, globals: Record<string, unknown>): Promise<void> {
      await page.evaluate((nextGlobals) => {
        const channel = (window as StorybookWindow).__STORYBOOK_ADDONS_CHANNEL__;

        if (!channel) {
          throw new Error('Storybook addons channel is unavailable');
        }

        channel.emit('updateGlobals', { globals: nextGlobals });
      }, globals);
    },
  };
}