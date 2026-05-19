import { createStrybkFixtures } from '../src/playwright/index.js';

const fixtures = createStrybkFixtures();

fixtures.test('sharedPage fixture is typed', async ({ sharedPage }) => {
  void sharedPage;
});