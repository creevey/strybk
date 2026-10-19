/**
 * Runner-agnostic in-page Storybook functions.
 *
 * Each function must stay self-contained: it is serialized as-is by
 * `page.evaluate` in the Playwright branch, so it may only reference its
 * parameters and globals available inside a browser page. The Vitest branch
 * calls the same functions directly, passing the embedded preview's window.
 */

export interface StorybookChannel {
  on(eventName: string, listener: (payload: unknown) => void): void;
  off(eventName: string, listener: (payload: unknown) => void): void;
  emit(eventName: string, payload: unknown): void;
}

export interface InPageDocument {
  fonts?: { ready: Promise<unknown> };
}

export interface StorybookChannelWindow {
  __STORYBOOK_ADDONS_CHANNEL__?: StorybookChannel;
  document?: InPageDocument;
}

export interface StorybookPreviewWindow {
  __STORYBOOK_PREVIEW__?: {
    /** Resolves once Storybook has loaded the story index (Storybook 8+). */
    ready?: () => Promise<unknown>;
    /** Pre-`ready()` name for the same promise (older Storybook previews). */
    initializationPromise?: Promise<unknown>;
    extract?: () => unknown;
  };
}

declare global {
  interface Window {
    __STORYBOOK_ADDONS_CHANNEL__?: StorybookChannel;
    __STORYBOOK_PREVIEW__?: StorybookPreviewWindow["__STORYBOOK_PREVIEW__"];
  }
}

export interface SelectStoryArgs {
  win?: StorybookChannelWindow;
  storyId: string;
}

export interface UpdateGlobalsArgs {
  win?: StorybookChannelWindow;
  globals: Record<string, unknown>;
}

export const selectStoryInPage = async ({ win, storyId }: SelectStoryArgs): Promise<void> => {
  const storySwitchTimeoutMs = 10_000;
  const targetWindow: StorybookChannelWindow = win ?? window;
  const channel = targetWindow.__STORYBOOK_ADDONS_CHANNEL__;

  if (!channel) {
    throw new Error("Storybook addons channel is unavailable");
  }

  const targetDocument = targetWindow.document ?? globalThis.document;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      channel.off("storyRendered", handleSuccess);
      channel.off("storyUnchanged", handleSuccess);
      channel.off("storyErrored", handleError);
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
      void (targetDocument?.fonts?.ready ?? Promise.resolve())
        .then(() => {
          settle(() => {
            resolve();
          });
        })
        .catch((error: unknown) => {
          settle(() => {
            reject(error instanceof Error ? error : new Error(String(error)));
          });
        });
    };

    const handleError = (payload: unknown): void => {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "description" in payload &&
        typeof payload.description === "string"
          ? payload.description
          : `Storybook failed to render story ${storyId}`;

      settle(() => {
        reject(new Error(message));
      });
    };

    const timeout = setTimeout(() => {
      settle(() => {
        reject(new Error(`Failed to select story '${storyId}': Story switch timeout`));
      });
    }, storySwitchTimeoutMs);

    channel.on("storyRendered", handleSuccess);
    channel.on("storyUnchanged", handleSuccess);
    channel.on("storyErrored", handleError);
    channel.emit("setCurrentStory", { storyId });
  });
};

export const updateGlobalsInPage = ({ win, globals }: UpdateGlobalsArgs): void => {
  const channel = (win ?? window).__STORYBOOK_ADDONS_CHANNEL__;

  if (!channel) {
    throw new Error("Storybook addons channel is unavailable");
  }

  channel.emit("updateGlobals", { globals });
};

export const extractPreviewState = (win?: StorybookPreviewWindow): Promise<unknown> =>
  Promise.resolve((win ?? window).__STORYBOOK_PREVIEW__?.extract?.());

/**
 * In-page predicate for `page.waitForFunction`: resolves `true` once the
 * Storybook preview finished initializing. `extract()` throws
 * "Called `Preview.extract()` before initialization" until then, even though
 * `#storybook-root` is already in the static iframe markup.
 */
export const waitForPreviewReady = async (): Promise<boolean> => {
  const preview = window.__STORYBOOK_PREVIEW__;

  if (preview === undefined) {
    return false;
  }

  const ready = preview.ready?.() ?? preview.initializationPromise;

  if (ready !== undefined) {
    await ready;
  }

  return true;
};
