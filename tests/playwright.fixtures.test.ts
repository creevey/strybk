import type { Page, TestInfo } from '@playwright/test';

import { afterEach, describe, expect, it, vi } from 'vitest';

const extendMock = vi.fn();
const expectHandle = vi.fn();
const updateGlobalsMock = vi.fn();

vi.mock('../src/storybook/channelDriver.js', () => ({
  createChannelDriver: () => ({
    updateGlobals: updateGlobalsMock,
  }),
}));

vi.mock('../src/playwright/runtime.js', () => ({
  loadPlaywrightTestRuntime: () => ({
    expect: expectHandle,
    test: {
      extend: extendMock,
    },
  }),
}));

type FixtureDefinitions = {
  _workerPage: [
    (args: { browser: { newContext: (options: unknown) => Promise<{ newPage: () => Promise<Page>; close: () => Promise<void> }> } }, use: (page: Page) => Promise<void>, testInfo: TestInfo) => Promise<void>,
    { scope: 'worker' },
  ];
  sharedPage: (args: { _workerPage: Page }, use: (page: Page) => Promise<void>, testInfo: TestInfo) => Promise<void>;
};

const getSharedPageFixture = async (): Promise<FixtureDefinitions['sharedPage']> => {
  extendMock.mockReturnValue('extended-test');

  const { createStrybkFixtures } = await import('../src/playwright/fixtures.js');
  const fixtures = createStrybkFixtures();

  expect(fixtures).toEqual({
    expect: expectHandle,
    test: 'extended-test',
  });

  const fixtureDefinitions = extendMock.mock.calls[0]?.[0] as FixtureDefinitions | undefined;

  if (!fixtureDefinitions) {
    throw new Error('Expected fixture definitions to be passed to test.extend');
  }

  return fixtureDefinitions.sharedPage;
};

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('createStrybkFixtures', () => {
  it('forwards Playwright project viewport into the worker context', async () => {
    extendMock.mockReturnValue('extended-test');

    const { createStrybkFixtures } = await import('../src/playwright/fixtures.js');

    createStrybkFixtures();

    const fixtureDefinitions = extendMock.mock.calls[0]?.[0] as FixtureDefinitions | undefined;

    if (!fixtureDefinitions) {
      throw new Error('Expected fixture definitions to be passed to test.extend');
    }

    const newPage = vi.fn(async () => ({
      goto: vi.fn(async () => {}),
      waitForSelector: vi.fn(async () => {}),
      addStyleTag: vi.fn(async () => {}),
      mouse: { move: vi.fn(async () => {}) },
      evaluate: vi.fn(async () => {}),
    })) as unknown as () => Promise<Page>;
    const close = vi.fn(async () => {});
    const newContext = vi.fn(async () => ({ newPage, close }));
    const use = vi.fn(async () => {});

    await fixtureDefinitions._workerPage[0](
      {
        browser: {
          newContext,
        },
      },
      use,
      {
        project: {
          use: {
            baseURL: 'http://127.0.0.1:6006',
            viewport: { width: 1024, height: 720 },
          },
        },
      } as unknown as TestInfo,
    );

    expect(newContext).toHaveBeenCalledWith({
      baseURL: 'http://127.0.0.1:6006',
      viewport: { width: 1024, height: 720 },
    });
  });

  it('reloads the neutral iframe baseline after each sharedPage use', async () => {
    const sharedPageFixture = await getSharedPageFixture();
    const goto = vi.fn(async () => {});
    const waitForSelector = vi.fn(async () => {});
    const addStyleTag = vi.fn(async () => {});
    const mouseMove = vi.fn(async () => {});
    const evaluate = vi.fn(async () => {});
    const workerPage = {
      goto,
      waitForSelector,
      addStyleTag,
      mouse: {
        move: mouseMove,
      },
      evaluate,
    } as unknown as Page;
    const use = vi.fn(async () => {});

    await sharedPageFixture(
      { _workerPage: workerPage },
      use,
      {
        project: {
          metadata: undefined,
          use: {
            baseURL: 'http://127.0.0.1:6006',
          },
        },
      } as unknown as TestInfo,
    );

    expect(use).toHaveBeenCalledWith(workerPage);
    expect(goto).toHaveBeenCalledWith('http://127.0.0.1:6006/iframe.html');
    expect(goto).toHaveBeenCalledTimes(1);
    expect(waitForSelector).toHaveBeenCalledWith('#storybook-root', { state: 'attached', timeout: 10_000 });
    expect(goto.mock.invocationCallOrder[0]).toBeGreaterThan(use.mock.invocationCallOrder[0]);
  });
});