/**
 * Vitest Browser Mode runtime behind the `browser` package condition of
 * `@crvy/strybk`. Generated specs keep importing `test`, `expect`, and
 * `switchStory` from the package root; under `vitest run` they resolve here.
 */

import type { Locator } from "@vitest/browser/context";
import { expect as vitestExpect, inject, test as vitestTest } from "vitest";

import type { CreeveyApi, NormalizedCreeveyParams } from "../storybook/creeveyParams.js";
import { resolveCreeveyStory } from "../storybook/creeveyParams.js";
import { toMatchScreenshotOptions, toScreenshotName } from "./assertion.js";
import type { ToHaveScreenshotOptions } from "./assertion.js";
import { readStrybkIdentity } from "./identity.js";
import { getSharedStrybkPage, isStrybkLocator } from "./pageAdapter.js";
import { StrybkPageAdapter } from "./pageAdapter.js";
import type { StrybkLocator, StrybkPage } from "./pageAdapter.js";

export type { StrybkLocator, StrybkPage } from "./pageAdapter.js";

export interface StrybkFixtures {
  sharedPage: StrybkPage;
  creevey: CreeveyApi;
}

export const test = vitestTest.extend<StrybkFixtures>({
  sharedPage: async (_args, use): Promise<void> => {
    const adapter = getSharedStrybkPage();
    const identity = readStrybkIdentity(inject);

    await adapter.load();
    adapter.applyGlobals(identity.globals);
    await use(adapter);
  },
  creevey: async (_args, use): Promise<void> => {
    const adapter = getSharedStrybkPage();
    const identity = readStrybkIdentity(inject);

    await adapter.load();

    const stories = adapter.readStories();
    const api: CreeveyApi = {
      params: (storyId: string): NormalizedCreeveyParams =>
        resolveCreeveyStory(stories, storyId, identity.browser),
    };

    await use(api);
  },
});

export async function switchStory(sharedPage: StrybkPage, storyId: string): Promise<void> {
  if (!(sharedPage instanceof StrybkPageAdapter)) {
    throw new Error("switchStory expects the sharedPage fixture from @crvy/strybk");
  }

  await sharedPage.switchStory(storyId);
}

export interface StrybkExpectTarget {
  toHaveScreenshot(options?: ToHaveScreenshotOptions): Promise<void>;
}

export type StrybkExpect = (target: StrybkLocator | StrybkPage) => StrybkExpectTarget;

export const expect: StrybkExpect = (target: StrybkLocator | StrybkPage): StrybkExpectTarget => ({
  toHaveScreenshot: (options: ToHaveScreenshotOptions = {}): Promise<void> =>
    assertScreenshot(target, options),
});

const currentTestNameSegments = (): string[] =>
  (vitestExpect.getState().currentTestName ?? "").split(" > ");

const assertScreenshot = async (
  target: StrybkLocator | StrybkPage,
  options: ToHaveScreenshotOptions,
): Promise<void> => {
  const adapter = getSharedStrybkPage();
  const name = toScreenshotName(currentTestNameSegments());
  const matcherOptions = toMatchScreenshotOptions<Locator>(
    options,
    (entry): Locator => adapter.toPreviewLocator(entry),
  );
  const captureLocator = isStrybkLocator(target) ? target.vitestLocator : adapter.viewportLocator();

  await vitestExpect.element(captureLocator).toMatchScreenshot(name, matcherOptions);
};
