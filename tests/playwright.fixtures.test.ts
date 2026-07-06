import type { Page, TestInfo } from "@playwright/test";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { CreeveyApi, StoriesRaw } from "../src/storybook/creeveyParams.js";

type FixtureDefinitions = {
  _workerPage: [
    (
      args: {
        browser: {
          newContext: (
            options: unknown,
          ) => Promise<{ newPage: () => Promise<Page>; close: () => Promise<void> }>;
        };
      },
      use: (page: Page) => Promise<void>,
      testInfo: TestInfo,
    ) => Promise<void>,
    { scope: "worker" },
  ];
  _stories: [
    (args: { _workerPage: Page }, use: (stories: StoriesRaw) => Promise<void>) => Promise<void>,
    { scope: "worker" },
  ];
  sharedPage: (
    args: { _workerPage: Page },
    use: (page: Page) => Promise<void>,
    testInfo: TestInfo,
  ) => Promise<void>;
  creevey: (
    args: { _stories: StoriesRaw },
    use: (api: CreeveyApi) => Promise<void>,
    testInfo: TestInfo,
  ) => Promise<void>;
};

let extendMock = mock((_fixtureDefinitions: FixtureDefinitions): string => "extended-test");
const expectHandle = expect as unknown as typeof import("@playwright/test").expect;
let updateGlobalsMock = mock(
  (_page: Page, _globals: Record<string, unknown>): Promise<void> => Promise.resolve(),
);
let extractStoriesMock = mock((_page: Page): Promise<StoriesRaw> => Promise.resolve({}));

beforeEach(() => {
  extendMock = mock((_fixtureDefinitions: FixtureDefinitions): string => "extended-test");
  updateGlobalsMock = mock(
    (_page: Page, _globals: Record<string, unknown>): Promise<void> => Promise.resolve(),
  );

  void mock.module(
    "../src/storybook/channelDriver.js",
    (): { createChannelDriver: () => { updateGlobals: typeof updateGlobalsMock } } => ({
      createChannelDriver: (): { updateGlobals: typeof updateGlobalsMock } => ({
        updateGlobals: updateGlobalsMock,
      }),
    }),
  );

  void mock.module(
    "../src/playwright/runtime.js",
    (): {
      loadPlaywrightTestRuntime: () => {
        expect: typeof expectHandle;
        test: { extend: typeof extendMock };
      };
    } => ({
      loadPlaywrightTestRuntime: (): {
        expect: typeof expectHandle;
        test: { extend: typeof extendMock };
      } => ({
        expect: expectHandle,
        test: {
          extend: extendMock,
        },
      }),
    }),
  );

  extractStoriesMock = mock((_page: Page): Promise<StoriesRaw> => Promise.resolve({}));

  void mock.module(
    "../src/storybook/extract.js",
    (): { extractStories: typeof extractStoriesMock } => ({
      extractStories: extractStoriesMock,
    }),
  );
});

const getSharedPageFixture = async (): Promise<FixtureDefinitions["sharedPage"]> => {
  const { createStrybkFixtures } = await import("../src/playwright/fixtures.js");
  const fixtures = createStrybkFixtures();

  expect(fixtures.expect).toBe(expectHandle);
  expect(fixtures.test as unknown).toBe("extended-test");

  const fixtureDefinitions = extendMock.mock.calls[0]?.[0];

  if (fixtureDefinitions === undefined) {
    throw new Error("Expected fixture definitions to be passed to test.extend");
  }

  return fixtureDefinitions.sharedPage;
};

afterEach(() => {
  mock.restore();
});

describe("createStrybkFixtures", () => {
  it("forwards Playwright project viewport into the worker context", async () => {
    const { createStrybkFixtures } = await import("../src/playwright/fixtures.js");

    createStrybkFixtures();

    const fixtureDefinitions = extendMock.mock.calls[0]?.[0];

    if (fixtureDefinitions === undefined) {
      throw new Error("Expected fixture definitions to be passed to test.extend");
    }

    const newPage = mock(
      (): Promise<Page> =>
        Promise.resolve({
          goto: mock((): Promise<void> => Promise.resolve()),
          waitForSelector: mock((): Promise<void> => Promise.resolve()),
          addStyleTag: mock((): Promise<void> => Promise.resolve()),
          mouse: { move: mock((): Promise<void> => Promise.resolve()) },
          evaluate: mock((): Promise<void> => Promise.resolve()),
        } as unknown as Page),
    );
    const close = mock((): Promise<void> => Promise.resolve());
    const newContext = mock(() => Promise.resolve({ newPage, close }));
    const use = mock((): Promise<void> => Promise.resolve());

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
            baseURL: "http://127.0.0.1:6006",
            viewport: { width: 1024, height: 720 },
          },
        },
      } as unknown as TestInfo,
    );

    expect(newContext).toHaveBeenCalledWith({
      baseURL: "http://127.0.0.1:6006",
      viewport: { width: 1024, height: 720 },
    });
  });

  it("reloads the neutral iframe baseline after each sharedPage use", async () => {
    const sharedPageFixture = await getSharedPageFixture();
    const goto = mock((): Promise<void> => Promise.resolve());
    const waitForSelector = mock((): Promise<void> => Promise.resolve());
    const addStyleTag = mock((): Promise<void> => Promise.resolve());
    const mouseMove = mock((): Promise<void> => Promise.resolve());
    const evaluate = mock((): Promise<void> => Promise.resolve());
    const workerPage = {
      goto,
      waitForSelector,
      addStyleTag,
      mouse: {
        move: mouseMove,
      },
      evaluate,
    } as unknown as Page;
    const use = mock((): Promise<void> => Promise.resolve());

    await sharedPageFixture({ _workerPage: workerPage }, use, {
      project: {
        metadata: undefined,
        use: {
          baseURL: "http://127.0.0.1:6006",
        },
      },
    } as unknown as TestInfo);

    expect(use).toHaveBeenCalledWith(workerPage);
    expect(goto).toHaveBeenCalledWith("http://127.0.0.1:6006/iframe.html");
    expect(goto).toHaveBeenCalledTimes(1);
    expect(waitForSelector).toHaveBeenCalledWith("#storybook-root", {
      state: "attached",
      timeout: 10_000,
    });
    expect(goto.mock.invocationCallOrder[0]).toBeGreaterThan(use.mock.invocationCallOrder[0]);
  });

  it("extracts stories once per worker via the _stories fixture", async () => {
    const stubStories: StoriesRaw = {
      "button--default": { title: "Button", name: "Default" },
    };

    extractStoriesMock = mock((_page: Page): Promise<StoriesRaw> => Promise.resolve(stubStories));

    void mock.module(
      "../src/storybook/extract.js",
      (): { extractStories: typeof extractStoriesMock } => ({
        extractStories: extractStoriesMock,
      }),
    );

    const { createStrybkFixtures } = await import("../src/playwright/fixtures.js");

    createStrybkFixtures();

    const fixtureDefinitions = extendMock.mock.calls[0]?.[0];

    if (fixtureDefinitions === undefined) {
      throw new Error("Expected fixture definitions to be passed to test.extend");
    }

    const workerPage = {} as unknown as Page;
    const use = mock((_stories: StoriesRaw): Promise<void> => Promise.resolve());

    await fixtureDefinitions._stories[0]({ _workerPage: workerPage }, use);

    expect(extractStoriesMock).toHaveBeenCalledWith(workerPage);
    expect(extractStoriesMock).toHaveBeenCalledTimes(1);
    expect(use).toHaveBeenCalledWith(stubStories);
  });

  it("creevey fixture resolves params using the Playwright project name as the browser dimension", async () => {
    const stubStories: StoriesRaw = {
      "button--default": {
        title: "Button",
        name: "Default",
        parameters: { creevey: { skip: { "no ie": { in: "ie11" } } } },
      },
    };

    const { createStrybkFixtures } = await import("../src/playwright/fixtures.js");

    createStrybkFixtures();

    const fixtureDefinitions = extendMock.mock.calls[0]?.[0];

    if (fixtureDefinitions === undefined) {
      throw new Error("Expected fixture definitions to be passed to test.extend");
    }

    let capturedApi: CreeveyApi | undefined;
    const use = mock((api: CreeveyApi): Promise<void> => {
      capturedApi = api;

      return Promise.resolve();
    });

    await fixtureDefinitions.creevey({ _stories: stubStories }, use, {
      project: { name: "ie11" },
    } as unknown as TestInfo);

    expect(capturedApi?.params("button--default")).toEqual({
      skip: true,
      reason: "no ie",
      captureElement: null,
      ignoreElements: [],
    });
  });
});
