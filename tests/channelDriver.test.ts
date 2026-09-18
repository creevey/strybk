import { afterEach, describe, expect, it, vi } from "bun:test";

import {
  selectStoryInPage,
  updateGlobalsInPage,
  type StorybookChannel,
  type StorybookChannelWindow,
} from "../src/storybook/inPage.js";

type ChannelListener = (payload: unknown) => void;

interface TestChannel extends StorybookChannel {
  emissions: Array<{ eventName: string; payload: unknown }>;
}

const createTestChannel = (
  nextEventName: "storyRendered" | "storyUnchanged" | "storyErrored" | null,
  nextPayload?: unknown,
): TestChannel => {
  const listeners = new Map<string, Set<ChannelListener>>();
  const emissions: Array<{ eventName: string; payload: unknown }> = [];

  const notify = (eventName: string, payload: unknown): void => {
    listeners.get(eventName)?.forEach((listener) => listener(payload));
  };

  const channel: TestChannel = {
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

      if (eventName === "setCurrentStory" && nextEventName) {
        notify(nextEventName, nextPayload);
      }
    },
  };

  return channel;
};

const createWindow = (
  channel: TestChannel,
  fontsReady: Promise<void> | null = null,
): StorybookChannelWindow => ({
  __STORYBOOK_ADDONS_CHANNEL__: channel,
  document:
    fontsReady === null
      ? undefined
      : {
          fonts: { ready: fontsReady },
        },
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { window?: unknown }).window;
});

describe("selectStoryInPage", () => {
  it.each(["storyRendered", "storyUnchanged"] as const)(
    "resolves when the channel emits %s",
    async (eventName) => {
      const channel = createTestChannel(eventName);
      const win = createWindow(channel);

      await selectStoryInPage({ win, storyId: "button--default" });

      expect(channel.emissions).toContainEqual({
        eventName: "setCurrentStory",
        payload: { storyId: "button--default" },
      });
    },
  );

  it("rejects with a timeout when the channel never emits a story event", async () => {
    vi.useFakeTimers();

    const channel = createTestChannel(null);
    const win = createWindow(channel);
    let rejection: unknown;

    void selectStoryInPage({ win, storyId: "button--default" }).catch((error: unknown) => {
      rejection = error;
    });

    vi.advanceTimersByTime(10_000);
    await Promise.resolve();

    expect(rejection).toEqual(
      new Error("Failed to select story 'button--default': Story switch timeout"),
    );
  });

  it("rejects with the propagated description when storyErrored fires", async () => {
    const channel = createTestChannel("storyErrored", {
      description: "Missing required loader data",
    });
    const win = createWindow(channel);
    let rejection: unknown;

    try {
      await selectStoryInPage({ win, storyId: "button--default" });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toEqual(new Error("Missing required loader data"));
  });

  it("rejects with a story-specific fallback when the error payload has no description", async () => {
    const channel = createTestChannel("storyErrored", { unexpected: true });
    const win = createWindow(channel);
    let rejection: unknown;

    try {
      await selectStoryInPage({ win, storyId: "button--primary" });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toEqual(new Error("Storybook failed to render story button--primary"));
  });

  it("waits for document font readiness from the provided window before resolving", async () => {
    vi.useFakeTimers();

    const channel = createTestChannel("storyRendered");
    let releaseFonts: (() => void) | undefined;
    const fontsReady = new Promise<void>((resolve) => {
      releaseFonts = resolve;
    });
    const win = createWindow(channel, fontsReady);
    let settled = false;

    void selectStoryInPage({ win, storyId: "button--default" }).then(() => {
      settled = true;
    });

    vi.advanceTimersByTime(1_000);
    await Promise.resolve();

    expect(settled).toBe(false);

    releaseFonts?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(1_000);

    expect(settled).toBe(true);
  });

  it("throws when the channel is unavailable on the provided window", async () => {
    let rejection: unknown;

    try {
      await selectStoryInPage({ win: {}, storyId: "button--default" });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toEqual(new Error("Storybook addons channel is unavailable"));
  });

  it("falls back to the ambient window when no window is provided", async () => {
    const channel = createTestChannel("storyRendered");

    (globalThis as { window?: unknown }).window = {
      __STORYBOOK_ADDONS_CHANNEL__: channel,
      document: { fonts: { ready: Promise.resolve() } },
    };

    await selectStoryInPage({ storyId: "button--default" });

    expect(channel.emissions).toContainEqual({
      eventName: "setCurrentStory",
      payload: { storyId: "button--default" },
    });
  });
});

describe("updateGlobalsInPage", () => {
  it("emits updateGlobals with the provided globals on the provided window", () => {
    const channel = createTestChannel(null);
    const win = createWindow(channel);

    updateGlobalsInPage({ win, globals: { theme: "dark" } });

    expect(channel.emissions).toContainEqual({
      eventName: "updateGlobals",
      payload: { globals: { theme: "dark" } },
    });
  });

  it("throws when the channel is unavailable", () => {
    let rejection: unknown;

    try {
      updateGlobalsInPage({ win: {}, globals: { theme: "dark" } });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toEqual(new Error("Storybook addons channel is unavailable"));
  });

  it("falls back to the ambient window when no window is provided", () => {
    const channel = createTestChannel(null);

    (globalThis as { window?: unknown }).window = {
      __STORYBOOK_ADDONS_CHANNEL__: channel,
    };

    updateGlobalsInPage({ globals: { locale: "en" } });

    expect(channel.emissions).toContainEqual({
      eventName: "updateGlobals",
      payload: { globals: { locale: "en" } },
    });
  });
});
