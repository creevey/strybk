import { createStrybkFixtures } from "./fixtures.js";

export { switchStory } from "./switchStory.js";

const fixtures = createStrybkFixtures();

export const test = fixtures.test;
export const expect = fixtures.expect;
