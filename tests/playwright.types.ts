import { createStrybkFixtures } from "../src/playwright/index.js";

const fixtures = createStrybkFixtures();

fixtures.test(
  "sharedPage fixture preserves built-in Playwright fixtures",
  ({ sharedPage, browserName }) => {
    void sharedPage;
    void browserName;
  },
);

fixtures.test(
  "internal worker fixtures stay private",
  ({
    // @ts-expect-error _workerPage is an internal implementation detail.
    _workerPage,
  }) => {
    void _workerPage;
  },
);
