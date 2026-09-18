/**
 * The Vitest-branch `sharedPage`: an adapter over the embedded Storybook
 * preview iframe. Locators wrap vitest browser locators so the generated
 * Playwright vocabulary (`sharedPage.locator(selector)`) resolves elements
 * inside the same-origin preview.
 */

import type { Locator } from "vitest/browser";
import { locators, page } from "vitest/browser";

import type { StorybookGlobals } from "../config.js";
import type { StoriesRaw } from "../storybook/creeveyParams.js";
import { updateGlobalsInPage } from "../storybook/inPage.js";
import { getSharedPreview, getSharedPreviewElement } from "./preview.js";

declare module "vitest/browser" {
  interface LocatorSelectors {
    /**
     * Locates an element by CSS selector inside the locator's scope.
     * Registered by @crvy/strybk for the embedded Storybook preview.
     */
    getByCSS(css: string): Locator;
  }
}

locators.extend({
  getByCSS(css: string): string {
    return `css=${css}`;
  },
});

export interface StrybkLocator {
  readonly selector: string;
  readonly vitestLocator: Locator;
}

export interface StrybkPage {
  locator(selector: string): StrybkLocator;
}

const requireSharedIframe = (): HTMLIFrameElement => {
  const iframe = getSharedPreviewElement();

  if (iframe === null) {
    throw new Error("Storybook preview is not loaded yet; switchStory must run first");
  }

  return iframe;
};

export const isStrybkLocator = (value: unknown): value is StrybkLocator =>
  typeof value === "object" && value !== null && "selector" in value && "vitestLocator" in value;

export class StrybkPageAdapter implements StrybkPage {
  locator(selector: string): StrybkLocator {
    const frame = page.frameLocator(page.elementLocator(requireSharedIframe()));

    return { selector, vitestLocator: frame.getByCSS(selector) };
  }

  load(): Promise<void> {
    return getSharedPreview().load();
  }

  switchStory(storyId: string): Promise<void> {
    return getSharedPreview().switchStory(storyId);
  }

  readStories(): Promise<StoriesRaw> {
    return getSharedPreview().readStories();
  }

  applyGlobals(globals: StorybookGlobals | undefined): void {
    if (globals === undefined) {
      return;
    }

    const win = requireSharedIframe().contentWindow;

    if (win === null) {
      throw new Error("Storybook preview is not loaded yet; switchStory must run first");
    }

    updateGlobalsInPage({ win, globals });
  }

  viewportLocator(): Locator {
    return page.elementLocator(requireSharedIframe());
  }

  toPreviewLocator(entry: unknown): Locator {
    if (isStrybkLocator(entry)) {
      return entry.vitestLocator;
    }

    throw new Error("Mask entries must be locators created by sharedPage.locator(...)");
  }
}

let sharedAdapter: StrybkPageAdapter | null = null;

export const getSharedStrybkPage = (): StrybkPageAdapter => {
  sharedAdapter ??= new StrybkPageAdapter();

  return sharedAdapter;
};
