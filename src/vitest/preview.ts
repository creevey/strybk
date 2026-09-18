/**
 * Embedded same-origin Storybook preview orchestration for Vitest Browser
 * Mode. One iframe is created per spec file (file-scope cache) and pointed
 * at the preview URL served through the `@crvy/strybk/vite` proxy mount.
 */

import type { StorybookGlobals } from "../config.js";
import type { StoriesRaw } from "../storybook/creeveyParams.js";
import { animationDisablerStyles } from "../storybook/animations.js";
import type { StorybookChannelWindow, StorybookPreviewWindow } from "../storybook/inPage.js";
import { extractPreviewState, selectStoryInPage } from "../storybook/inPage.js";
import { toStoriesRaw } from "../storybook/extract.js";

export interface PreviewWindowLike extends StorybookChannelWindow, StorybookPreviewWindow {}

export interface EmbeddedIframeStyle {
  border?: string;
  position?: string;
  top?: string;
  left?: string;
}

export interface PreviewDocumentLike {
  createElement(tagName: string): { textContent: string | null };
  head: { appendChild(node: unknown): void };
}

export interface EmbeddedIframe {
  src: string;
  contentWindow: PreviewWindowLike | null;
  readonly contentDocument?: PreviewDocumentLike | null;
  width: string;
  height: string;
  style: EmbeddedIframeStyle;
  addEventListener(event: string, listener: () => void): void;
}

export interface CreateEmbeddedPreviewDeps<Iframe extends EmbeddedIframe = EmbeddedIframe> {
  prefix?: string;
  readyTimeoutMs?: number;
  pollIntervalMs?: number;
  createIframe(): Iframe;
  attach(iframe: Iframe): void;
  viewport(): { width: number; height: number };
  onPreviewReady(iframe: Iframe): void;
}

export interface EmbeddedPreview {
  readonly iframe: EmbeddedIframe;
  load(): Promise<void>;
  switchStory(storyId: string): Promise<void>;
  readStories(): Promise<StoriesRaw>;
}

export const DEFAULT_PREVIEW_PREFIX = "/storybook";
export const PREVIEW_READY_TIMEOUT_MS = 10_000;
const PREVIEW_POLL_INTERVAL_MS = 50;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const serializeGlobals = (globals: StorybookGlobals): string =>
  Object.entries(globals)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(";");

export const buildPreviewUrl = (args: {
  prefix?: string;
  storyId: string;
  globals?: StorybookGlobals;
}): string => {
  const prefix = args.prefix ?? DEFAULT_PREVIEW_PREFIX;
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const params = new URLSearchParams({ id: args.storyId, viewMode: "story" });
  const serializedGlobals = args.globals === undefined ? "" : serializeGlobals(args.globals);

  if (serializedGlobals.length > 0) {
    params.set("globals", serializedGlobals);
  }

  return `${base}/iframe.html?${params.toString()}`;
};

export const previewUnreachableError = (url: string): Error =>
  new Error(
    `Storybook preview at ${url} is unreachable. Run \`storybook build\` and serve the built output through the @crvy/strybk/vite proxy: dev-mode Storybook servers are not supported under Vitest.`,
  );

const isPreviewReady = async (win: PreviewWindowLike | null): Promise<boolean> => {
  if (win === null || win.__STORYBOOK_PREVIEW__ === undefined) {
    return false;
  }

  try {
    const extracted = await extractPreviewState(win);

    return typeof extracted === "object" && extracted !== null && Object.keys(extracted).length > 0;
  } catch {
    return false;
  }
};

export const previewHomeUrl = (prefix?: string): string => {
  const configured = prefix ?? DEFAULT_PREVIEW_PREFIX;
  const base = configured.endsWith("/") ? configured.slice(0, -1) : configured;

  return `${base}/iframe.html`;
};

const pollPreviewWindow = async (args: {
  url: string;
  acquireWindow(): PreviewWindowLike | null;
  pollIntervalMs: number;
  deadline: number;
}): Promise<PreviewWindowLike> => {
  const win = args.acquireWindow();

  if (win !== null && (await isPreviewReady(win))) {
    return win;
  }

  if (Date.now() >= args.deadline) {
    throw previewUnreachableError(args.url);
  }

  await delay(args.pollIntervalMs);

  return pollPreviewWindow(args);
};

export const waitForPreviewWindow = (args: {
  url: string;
  acquireWindow(): PreviewWindowLike | null;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<PreviewWindowLike> =>
  pollPreviewWindow({
    url: args.url,
    acquireWindow: (): PreviewWindowLike | null => args.acquireWindow(),
    pollIntervalMs: args.pollIntervalMs ?? PREVIEW_POLL_INTERVAL_MS,
    deadline: Date.now() + (args.timeoutMs ?? PREVIEW_READY_TIMEOUT_MS),
  });

const navigateAndWaitForPreview = async (
  iframe: EmbeddedIframe,
  url: string,
  options: { pollIntervalMs?: number; timeoutMs?: number },
): Promise<PreviewWindowLike> => {
  const loaded = new Promise<void>((resolve) => {
    iframe.addEventListener("load", () => {
      resolve();
    });
  });

  iframe.src = url;
  await loaded;

  return waitForPreviewWindow({
    url,
    acquireWindow: () => iframe.contentWindow,
    ...options,
  });
};

export const createEmbeddedPreview = (deps: CreateEmbeddedPreviewDeps): EmbeddedPreview => {
  const options = {
    pollIntervalMs: deps.pollIntervalMs,
    timeoutMs: deps.readyTimeoutMs,
  };
  let iframe: EmbeddedIframe | null = null;

  const ensureLoaded = async (url: string): Promise<PreviewWindowLike> => {
    if (iframe?.contentWindow !== null && iframe !== null) {
      return iframe.contentWindow;
    }

    const element = deps.createIframe();
    iframe = element;
    const { width, height } = deps.viewport();

    element.width = String(width);
    element.height = String(height);
    element.style.border = "0";
    element.style.position = "fixed";
    element.style.top = "0";
    element.style.left = "0";
    deps.attach(element);

    const win = await navigateAndWaitForPreview(element, url, options);
    deps.onPreviewReady(element);

    return win;
  };

  return {
    get iframe(): EmbeddedIframe {
      if (iframe === null) {
        throw new Error("Storybook preview is not loaded yet; switch a story first");
      }

      return iframe;
    },
    async load(): Promise<void> {
      await ensureLoaded(previewHomeUrl(deps.prefix));
    },
    async switchStory(storyId: string): Promise<void> {
      const win = await ensureLoaded(buildPreviewUrl({ prefix: deps.prefix, storyId }));

      await selectStoryInPage({ win, storyId });
    },
    async readStories(): Promise<StoriesRaw> {
      const win = iframe?.contentWindow ?? null;

      return toStoriesRaw(await extractPreviewState(win ?? undefined));
    },
  };
};

const domState: { iframe: HTMLIFrameElement | null } = { iframe: null };

const injectAnimationStyles = (previewDocument: Document | null): void => {
  if (previewDocument === null) {
    return;
  }

  const style = previewDocument.createElement("style");
  style.textContent = animationDisablerStyles;
  previewDocument.head.appendChild(style);
};

const createDomDeps = (): CreateEmbeddedPreviewDeps<HTMLIFrameElement> => ({
  createIframe(): HTMLIFrameElement {
    return document.createElement("iframe");
  },
  attach(iframe: HTMLIFrameElement): void {
    domState.iframe = iframe;
    document.body.appendChild(iframe);
  },
  viewport: (): { width: number; height: number } => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }),
  onPreviewReady(iframe: HTMLIFrameElement): void {
    injectAnimationStyles(iframe.contentDocument);
  },
});

export const getSharedPreviewElement = (): HTMLIFrameElement | null => domState.iframe;

let sharedPreview: EmbeddedPreview | null = null;

export const getSharedPreview = (deps?: CreateEmbeddedPreviewDeps): EmbeddedPreview => {
  sharedPreview ??= createEmbeddedPreview(deps ?? createDomDeps());

  return sharedPreview;
};
