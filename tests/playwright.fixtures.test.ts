import type { Page, TestInfo } from '@playwright/test';

import { afterEach, describe, expect, it, vi } from 'vitest';

const extendMock = vi.fn();
const expectHandle = vi.fn();
const updateGlobalsMock = vi.fn();

vi.mock('@playwright/test', () => ({
  expect: expectHandle,
  test: {
    extend: extendMock,
  },
}));

vi.mock('../src/storybook/channelDriver.js', () => ({
  createChannelDriver: () => ({
    updateGlobals: updateGlobalsMock,
  }),
}));

type FixtureDefinitions = {
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
  it('reloads the neutral iframe baseline after each sharedPage use', async () => {
    const sharedPageFixture = await getSharedPageFixture();
    const goto = vi.fn(async () => {});
    const addStyleTag = vi.fn(async () => {});
    const mouseMove = vi.fn(async () => {});
    const evaluate = vi.fn(async () => {});
    const workerPage = {
      goto,
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
    expect(goto.mock.invocationCallOrder[0]).toBeGreaterThan(use.mock.invocationCallOrder[0]);
  });
});