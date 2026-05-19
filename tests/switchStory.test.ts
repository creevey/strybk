import type { Page } from '@playwright/test';

import { describe, expect, it } from 'vitest';

import { switchStory } from '../src/playwright/switchStory.js';

type ChannelEventName = 'setCurrentStory' | 'storyRendered' | 'storyUnchanged' | 'storyErrored' | 'updateGlobals';
type ChannelListener = (payload: unknown) => void;

interface TestChannel {
  on(eventName: ChannelEventName, listener: ChannelListener): void;
  off(eventName: ChannelEventName, listener: ChannelListener): void;
  emit(eventName: ChannelEventName, payload: unknown): void;
  emissions: Array<{ eventName: ChannelEventName; payload: unknown }>;
}

const createTestChannel = (successEventName: 'storyRendered' | 'storyUnchanged'): TestChannel => {
  const listeners = new Map<ChannelEventName, Set<ChannelListener>>();
  const emissions: Array<{ eventName: ChannelEventName; payload: unknown }> = [];

  const notify = (eventName: ChannelEventName, payload: unknown): void => {
    listeners.get(eventName)?.forEach((listener) => listener(payload));
  };

  return {
    emissions,
    on(eventName, listener) {
      const eventListeners = listeners.get(eventName) ?? new Set<ChannelListener>();
      eventListeners.add(listener);
      listeners.set(eventName, eventListeners);
    },
    off(eventName, listener) {
      listeners.get(eventName)?.delete(listener);
    },
    emit(eventName, payload) {
      emissions.push({ eventName, payload });
      notify(eventName, payload);

      if (eventName === 'setCurrentStory') {
        notify(successEventName, payload);
      }
    },
  };
};

const createPage = (channel: TestChannel): Page => {
  const documentShim = {
    fonts: {
      ready: Promise.resolve(),
    },
  };
  const windowShim = {
    __STORYBOOK_ADDONS_CHANNEL__: channel,
  };

  return {
    evaluate: async <Arg, Result>(pageFunction: (arg: Arg) => Result | Promise<Result>, arg: Arg) => {
      Object.assign(globalThis, {
        document: documentShim,
        window: windowShim,
      });

      return await pageFunction(arg);
    },
  } as Page;
};

describe('switchStory', () => {
  it.each(['storyRendered', 'storyUnchanged'] as const)('resolves when Storybook emits %s', async (eventName) => {
    const channel = createTestChannel(eventName);
    const page = createPage(channel);

    await expect(switchStory(page, 'button--default')).resolves.toBeUndefined();
    expect(channel.emissions).toContainEqual({
      eventName: 'setCurrentStory',
      payload: { storyId: 'button--default' },
    });
  });
});