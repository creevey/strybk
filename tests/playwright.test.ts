import { describe, expect, it } from 'vitest';

import { createStrybkFixtures, switchStory } from '../src/playwright/index.js';

describe('playwright public surface', () => {
  it('exports createStrybkFixtures with test and expect handles', () => {
    const fixtures = createStrybkFixtures();

    expect(fixtures).toEqual(
      expect.objectContaining({
        expect: expect.any(Function),
        test: expect.any(Function),
      }),
    );
  });

  it('re-exports switchStory', () => {
    expect(switchStory).toEqual(expect.any(Function));
  });
});