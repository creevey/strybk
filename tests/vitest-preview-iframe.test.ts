import { describe, expect, it } from "bun:test";

import type { StoriesRaw } from "../src/storybook/creeveyParams.js";
import type {
  CreateEmbeddedPreviewDeps,
  EmbeddedIframe,
  PreviewWindowLike,
} from "../src/vitest/preview.js";
import {
  buildPreviewUrl,
  createEmbeddedPreview,
  getSharedPreview,
  previewUnreachableError,
  serializeGlobals,
  waitForPreviewWindow,
} from "../src/vitest/preview.js";

type ChannelListener = (payload: unknown) => void;

const createPreviewWindow = (): {
  win: PreviewWindowLike;
  emissions: Array<{ eventName: string; payload: unknown }>;
} => {
  const listeners = new Map<string, Set<ChannelListener>>();
  const emissions: Array<{ eventName: string; payload: unknown }> = [];
  const stories: StoriesRaw = { "button--default": { title: "Button", name: "Default" } };

  const win = {
    __STORYBOOK_ADDONS_CHANNEL__: {
      on(eventName: string, listener: ChannelListener): void {
        const set = listeners.get(eventName) ?? new Set<ChannelListener>();
        set.add(listener);
        listeners.set(eventName, set);
      },
      off(eventName: string, listener: ChannelListener): void {
        listeners.get(eventName)?.delete(listener);
      },
      emit(eventName: string, payload: unknown): void {
        emissions.push({ eventName, payload });

        for (const listener of listeners.get(eventName) ?? []) {
          listener(payload);
        }

        if (eventName === "setCurrentStory") {
          for (const listener of listeners.get("storyUnchanged") ?? []) {
            listener(payload);
          }
        }
      },
    },
    __STORYBOOK_PREVIEW__: {
      extract: (): unknown => stories,
    },
  } as unknown as PreviewWindowLike;

  return { win, emissions };
};

interface FakeIframe extends EmbeddedIframe {
  attached: boolean;
}

const createFakeIframe = (previewWindow: PreviewWindowLike | null): FakeIframe => {
  const iframe: FakeIframe = {
    src: "",
    attached: false,
    style: {},
    width: "0",
    height: "0",
    contentWindow: null,
    addEventListener: (): void => {},
  };

  iframe.addEventListener = (event: string, listener: () => void): void => {
    if (event !== "load") {
      return;
    }

    queueMicrotask(() => {
      iframe.contentWindow = previewWindow;
      listener();
    });
  };

  return iframe;
};

const createFakeDeps = (
  previewWindow: PreviewWindowLike | null,
  overrides?: Partial<CreateEmbeddedPreviewDeps>,
): { deps: CreateEmbeddedPreviewDeps; iframe: FakeIframe } => {
  const iframe = createFakeIframe(previewWindow);

  const deps: CreateEmbeddedPreviewDeps = {
    prefix: "/storybook",
    readyTimeoutMs: 500,
    pollIntervalMs: 1,
    createIframe: (): EmbeddedIframe => iframe,
    attach: (candidate: EmbeddedIframe): void => {
      (candidate as FakeIframe).attached = true;
    },
    viewport: () => ({ width: 1280, height: 720 }),
    onPreviewReady: () => {},
    ...overrides,
  };

  return { deps, iframe };
};

describe("serializeGlobals", () => {
  it("renders key:value pairs joined by semicolons", () => {
    expect(serializeGlobals({ theme: "dark", compact: true, count: 2 })).toBe(
      "theme:dark;compact:true;count:2",
    );
  });

  it("drops undefined values", () => {
    expect(serializeGlobals({ theme: "dark", accent: undefined })).toBe("theme:dark");
  });
});

describe("buildPreviewUrl", () => {
  it("builds the preview URL with story id and viewMode under the default prefix", () => {
    expect(buildPreviewUrl({ storyId: "button--default" })).toBe(
      "/storybook/iframe.html?id=button--default&viewMode=story",
    );
  });

  it("accepts a custom prefix and strips a trailing slash", () => {
    expect(buildPreviewUrl({ prefix: "/sb/", storyId: "a--b" })).toBe(
      "/sb/iframe.html?id=a--b&viewMode=story",
    );
  });

  it("appends encoded globals when provided", () => {
    const url = buildPreviewUrl({ storyId: "a--b", globals: { theme: "dark" } });

    expect(url).toContain("&globals=theme%3Adark");
  });

  it("omits the globals parameter when globals resolve empty", () => {
    expect(buildPreviewUrl({ storyId: "a--b", globals: { accent: undefined } })).not.toContain(
      "globals",
    );
  });
});

describe("previewUnreachableError", () => {
  it("names the preview URL and the built-output requirement", () => {
    const error = previewUnreachableError("/storybook/iframe.html?id=a--b&viewMode=story");

    expect(error.message).toContain("/storybook/iframe.html?id=a--b&viewMode=story");
    expect(error.message).toContain("storybook build");
  });
});

describe("waitForPreviewWindow", () => {
  it("resolves once the window exposes the Storybook preview", async () => {
    const { win } = createPreviewWindow();
    let attempts = 0;

    const result = await waitForPreviewWindow({
      url: "/storybook/iframe.html",
      acquireWindow: () => {
        attempts += 1;

        return attempts < 2 ? null : win;
      },
      pollIntervalMs: 1,
      timeoutMs: 500,
    });

    expect(result).toBe(win);
    expect(attempts).toBe(2);
  });

  it("rejects with the unreachable-preview error naming the URL on timeout", async () => {
    let rejection: unknown;

    try {
      await waitForPreviewWindow({
        url: "/storybook/iframe.html?id=a--b",
        acquireWindow: () => null,
        pollIntervalMs: 1,
        timeoutMs: 20,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);

    if (rejection instanceof Error) {
      expect(rejection.message).toContain("/storybook/iframe.html?id=a--b");
      expect(rejection.message).toContain("storybook build");
    }
  });
});

describe("createEmbeddedPreview", () => {
  it("creates, sizes, and attaches the iframe on the first switch, then settles via the channel", async () => {
    const { win, emissions } = createPreviewWindow();
    const { deps, iframe } = createFakeDeps(win);
    const preview = createEmbeddedPreview(deps);

    await preview.switchStory("button--default");

    expect(iframe.attached).toBe(true);
    expect(iframe.width).toBe("1280");
    expect(iframe.height).toBe("720");
    expect(iframe.src).toBe("/storybook/iframe.html?id=button--default&viewMode=story");
    expect(emissions).toContainEqual({
      eventName: "setCurrentStory",
      payload: { storyId: "button--default" },
    });
  });

  it("reuses the loaded preview and switches stories through the channel", async () => {
    const { win, emissions } = createPreviewWindow();
    const { deps, iframe } = createFakeDeps(win);
    const preview = createEmbeddedPreview(deps);

    await preview.switchStory("button--default");
    const firstSrc = iframe.src;

    await preview.switchStory("button--primary");

    expect(iframe.src).toBe(firstSrc);
    expect(emissions).toContainEqual({
      eventName: "setCurrentStory",
      payload: { storyId: "button--primary" },
    });
  });

  it("fails with the unreachable-preview error when the preview never becomes ready", async () => {
    const { deps } = createFakeDeps(null);
    const preview = createEmbeddedPreview(deps);

    let rejection: unknown;

    try {
      await preview.switchStory("button--default");
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);

    if (rejection instanceof Error) {
      expect(rejection.message).toContain("/storybook/iframe.html?id=button--default");
      expect(rejection.message).toContain("storybook build");
    }
  });

  it("runs the onPreviewReady hook once after the preview is ready", async () => {
    const { win } = createPreviewWindow();
    const readied: string[] = [];
    const { deps } = createFakeDeps(win, {
      onPreviewReady: (candidate) => {
        readied.push(candidate.src);
      },
    });
    const preview = createEmbeddedPreview(deps);

    await preview.switchStory("button--default");
    await preview.switchStory("button--primary");

    expect(readied).toHaveLength(1);
    expect(readied[0]).toContain("iframe.html?id=button--default");
  });

  it("reads the extracted stories through the preview window", async () => {
    const { win } = createPreviewWindow();
    const { deps } = createFakeDeps(win);
    const preview = createEmbeddedPreview(deps);

    await preview.switchStory("button--default");

    expect(preview.readStories()).toEqual({
      "button--default": { title: "Button", name: "Default" },
    });
  });

  it("load() navigates to the bare preview URL and a later switch reuses it via the channel", async () => {
    const { win, emissions } = createPreviewWindow();
    const { deps, iframe } = createFakeDeps(win);
    const preview = createEmbeddedPreview(deps);

    await preview.load();

    expect(iframe.src).toBe("/storybook/iframe.html");
    expect(preview.readStories()).toEqual({
      "button--default": { title: "Button", name: "Default" },
    });

    await preview.switchStory("button--default");

    expect(iframe.src).toBe("/storybook/iframe.html");
    expect(emissions).toContainEqual({
      eventName: "setCurrentStory",
      payload: { storyId: "button--default" },
    });
  });
});

describe("getSharedPreview", () => {
  it("caches the preview at file scope", () => {
    const { win } = createPreviewWindow();
    const { deps } = createFakeDeps(win);
    const first = getSharedPreview(deps);
    const second = getSharedPreview(deps);

    expect(second).toBe(first);
  });
});
