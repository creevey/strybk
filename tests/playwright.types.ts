import { createStrybkFixtures } from '../src/playwright/index.js';

const fixtures = createStrybkFixtures();

fixtures.test('sharedPage fixture is typed', async ({ sharedPage }) => {
  void sharedPage;
});

fixtures.test('internal worker fixtures stay private', async ({
  // @ts-expect-error _workerPage is an internal implementation detail.
  _workerPage,
}) => {
  void _workerPage;
});