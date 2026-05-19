import type {
  Page,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestInfo,
  TestType,
} from '@playwright/test';

import type { StorybookGlobals } from '../config.js';
import { createChannelDriver } from '../storybook/channelDriver.js';
import { loadPlaywrightTestRuntime } from './runtime.js';

type StrybkFixtures = {
  sharedPage: Page;
};

type StrybkWorkerFixtures = {
  _workerPage: Page;
};

type PublicStrybkTest = TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & StrybkFixtures,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
>;

type StrybkFixtureHandles = {
  expect: typeof import('@playwright/test').expect;
  test: PublicStrybkTest;
};

type MetadataWithStorybookGlobals = {
  storybookGlobals?: unknown;
};

const animationDisablerStyles = [
  '*, *::before, *::after {',
  '  animation: none !important;',
  '  caret-color: transparent !important;',
  '  cursor: none !important;',
  '  transition: none !important;',
  '}',
  'html {',
  '  scroll-behavior: auto !important;',
  '}',
].join('\n');

const storybookReadyTimeoutMs = 10_000;

const channelDriver = createChannelDriver();

const isStorybookGlobalValue = (value: unknown): value is StorybookGlobals[string] =>
  value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';

const getStorybookGlobals = (testInfo: TestInfo): StorybookGlobals | undefined => {
  const metadata = testInfo.project.metadata as MetadataWithStorybookGlobals | undefined;
  const storybookGlobals = metadata?.storybookGlobals;

  if (!storybookGlobals || typeof storybookGlobals !== 'object' || Array.isArray(storybookGlobals)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(storybookGlobals).filter(([, value]) => isStorybookGlobalValue(value)),
  ) as StorybookGlobals;
};

const resolveIframeUrl = (baseURL: string | undefined): string =>
  baseURL ? new URL('/iframe.html', baseURL).toString() : '/iframe.html';

const disableAnimations = async (page: Page): Promise<void> => {
  await page.addStyleTag({ content: animationDisablerStyles });
};

const resetSharedPage = async (page: Page): Promise<void> => {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
};

const restoreSharedPageBaseline = async (page: Page, baseURL: string | undefined): Promise<void> => {
  await page.goto(resolveIframeUrl(baseURL));
  await page.waitForSelector('#storybook-root', { state: 'attached', timeout: storybookReadyTimeoutMs });
  await disableAnimations(page);
  await resetSharedPage(page);
};

export const createStrybkFixtures = (): StrybkFixtureHandles => {
  const { expect, test: base } = loadPlaywrightTestRuntime();
  const test = base.extend<StrybkFixtures, StrybkWorkerFixtures>({
    _workerPage: [
      async ({ browser }, use, workerInfo) => {
        const context = await browser.newContext({
          baseURL: workerInfo.project.use.baseURL,
          viewport: workerInfo.project.use.viewport,
        });
        const page = await context.newPage();

        await restoreSharedPageBaseline(page, workerInfo.project.use.baseURL);
        await use(page);
        await context.close();
      },
      { scope: 'worker' },
    ],
    sharedPage: async ({ _workerPage }, use, testInfo) => {
      const storybookGlobals = getStorybookGlobals(testInfo);

      if (storybookGlobals) {
        await channelDriver.updateGlobals(_workerPage, storybookGlobals);
      }

      await resetSharedPage(_workerPage);
      await use(_workerPage);
      await restoreSharedPageBaseline(_workerPage, testInfo.project.use.baseURL);
    },
  });

  return {
    expect,
    test: test as PublicStrybkTest,
  };
};
