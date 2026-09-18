/**
 * The Vitest-branch `sharedPage`: an adapter over the embedded Storybook
 * preview iframe. Locators wrap vitest browser locators so the generated
 * Playwright vocabulary (`sharedPage.locator(selector)`) resolves elements
 * inside the same-origin preview.
 */

import type { Locator } from "@vitest/browser/context";
import { page } from "@vitest/browser/context";

import type { StorybookGlobals } from "../config.js";
import type { StoriesRaw } from "../storybook/creeveyParams.js";
import { updateGlobalsInPage } from "../storybook/inPage.js";
import { getSharedPreview, getSharedPreviewElement } from "./preview.js";

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
    const iframe = requireSharedIframe();
    const element = iframe.contentDocument?.querySelector(selector) ?? null;

    if (element === null) {
      throw new Error(`No element matches '${selector}' in the Storybook preview`);
    }

    return { selector, vitestLocator: page.elementLocator(element) };
  }

  async load(): Promise<void> {
    await getSharedPreview().load();
  }

  async switchStory(storyId: string): Promise<void> {
    await getSharedPreview().switchStory(storyId);
  }

  readStories(): StoriesRaw {
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
