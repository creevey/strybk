/**
 * Vitest Browser Mode runtime behind the `browser` package condition of
 * `@crvy/strybk`. Generated specs keep importing `test`, `expect`, and
 * `switchStory` from the package root; under `vitest run` they resolve here.
 */

import type { Locator } from "vitest/browser";
import type { TestContext } from "vitest";
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

type CurrentTestSkip = TestContext["skip"];

let activeTestSkip: CurrentTestSkip | null = null;

const captureTestSkip = (skip: CurrentTestSkip): void => {
  activeTestSkip = skip;
};

const extendedTest = vitestTest.extend<StrybkFixtures>({
  sharedPage: async ({ skip }, use): Promise<void> => {
    captureTestSkip(skip);
    const adapter = getSharedStrybkPage();
    const identity = readStrybkIdentity(inject);

    await adapter.load();
    adapter.applyGlobals(identity.globals);
    await use(adapter);
  },
  creevey: async ({ skip }, use): Promise<void> => {
    captureTestSkip(skip);
    const adapter = getSharedStrybkPage();
    const identity = readStrybkIdentity(inject);

    await adapter.load();

    const stories = await adapter.readStories();
    const api: CreeveyApi = {
      params: (storyId: string): NormalizedCreeveyParams =>
        resolveCreeveyStory(stories, storyId, identity.browser),
    };

    await use(api);
  },
});

const collectionTimeSkip = extendedTest.skip;

const strybkTestSkip = (...args: Parameters<typeof collectionTimeSkip>): void => {
  const [first, second] = args;

  if (typeof first === "boolean") {
    if (activeTestSkip === null) {
      throw new Error("test.skip(condition, reason) requires the sharedPage or creevey fixture");
    }

    activeTestSkip(first, typeof second === "string" ? second : undefined);

    return;
  }

  collectionTimeSkip(...args);
};

const skippedCopyKeys = new Set(["skip", "length", "name", "arguments", "caller"]);

const strybkTest = extendedTest.bind(undefined);

for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(extendedTest))) {
  if (!skippedCopyKeys.has(key)) {
    Object.defineProperty(strybkTest, key, descriptor);
  }
}

Object.defineProperty(strybkTest, "skip", {
  value: strybkTestSkip,
  writable: true,
  configurable: true,
});

export const test = strybkTest;

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

  // expect.element() polls the locator into a DOM element before the matcher
  // runs, and elements inside the preview iframe live in another realm, which
  // fails the matcher's `instanceof Element` check. The underlying matcher
  // accepts locators directly and resolves their selector server-side.
  await vitestExpect(captureLocator).toMatchScreenshot(name, matcherOptions);
};
