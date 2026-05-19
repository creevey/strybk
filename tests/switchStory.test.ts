import type { Page } from "@playwright/test";

import { afterEach, describe, expect, it, vi } from "bun:test";

import { switchStory } from "../src/playwright/switchStory.js";

type ChannelEventName =
  | "setCurrentStory"
  | "storyRendered"
  | "storyUnchanged"
  | "storyErrored"
  | "updateGlobals";
type ChannelListener = (payload: unknown) => void;

interface TestChannel {
  on(eventName: ChannelEventName, listener: ChannelListener): void;
  off(eventName: ChannelEventName, listener: ChannelListener): void;
  emit(eventName: ChannelEventName, payload: unknown): void;
  emissions: Array<{ eventName: ChannelEventName; payload: unknown }>;
}

const createTestChannel = (
  nextEventName: "storyRendered" | "storyUnchanged" | "storyErrored" | null,
  nextPayload?: unknown,
): TestChannel => {
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

      if (eventName === "setCurrentStory" && nextEventName) {
        notify(nextEventName, nextPayload);
      }
    },
  };
};

const createPage = (channel: TestChannel, fontsReady: Promise<void> = Promise.resolve()): Page => {
  const documentShim = {
    fonts: {
      ready: fontsReady,
    },
  };
  const windowShim = {
    __STORYBOOK_ADDONS_CHANNEL__: channel,
  };

  return {
    evaluate: <Arg, Result>(pageFunction: (arg: Arg) => Result | Promise<Result>, arg: Arg) => {
      Object.assign(globalThis, {
        document: documentShim,
        window: windowShim,
      });

      return pageFunction(arg);
    },
  } as Page;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("switchStory", () => {
  it.each(["storyRendered", "storyUnchanged"] as const)(
    "resolves when Storybook emits %s",
    async (eventName) => {
      const channel = createTestChannel(eventName);
      const page = createPage(channel);

      await switchStory(page, "button--default");
      expect(channel.emissions).toContainEqual({
        eventName: "setCurrentStory",
        payload: { storyId: "button--default" },
      });
    },
  );

  it("rejects with a targeted timeout when Storybook does not emit a story event", async () => {
    vi.useFakeTimers();

    const channel = createTestChannel(null);
    const page = createPage(channel);
    let rejection: unknown;

    void switchStory(page, "button--default").catch((error: unknown) => {
      rejection = error;
    });

    vi.advanceTimersByTime(10_000);
    await Promise.resolve();

    expect(rejection).toEqual(
      new Error("Failed to select story 'button--default': Story switch timeout"),
    );
  });

  it("rejects with the same timeout when font readiness never settles after a story success event", async () => {
    vi.useFakeTimers();

    const channel = createTestChannel("storyRendered");
    const page = createPage(channel, new Promise<void>(() => {}));
    let rejection: unknown;

    void switchStory(page, "button--default").catch((error: unknown) => {
      rejection = error;
    });

    vi.advanceTimersByTime(10_000);
    await Promise.resolve();

    expect(rejection).toEqual(
      new Error("Failed to select story 'button--default': Story switch timeout"),
    );
  });

  it("rejects with the propagated Storybook error text when storyErrored fires", async () => {
    const channel = createTestChannel("storyErrored", {
      description: "Missing required loader data",
    });
    const page = createPage(channel);

    let rejection: unknown;

    try {
      await switchStory(page, "button--default");
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);

    if (rejection instanceof Error) {
      expect(rejection.message).toContain("Missing required loader data");
    }
  });
});
