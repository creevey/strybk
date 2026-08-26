import type { StrybkConfig } from "../config.js";

export interface RenderableStory {
  id: string;
  name: string;
}

const escapeSingleQuotes = (value: string): string => value.replace(/'/gu, "\\'");

const splitTitleSegments = (title: string): string[] =>
  title
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

const renderTest = (story: RenderableStory, depth: number): string => {
  const indent = "  ".repeat(depth);

  return [
    `${indent}test('${escapeSingleQuotes(story.name)}', async ({ sharedPage, creevey }) => {`,
    `${indent}  const { skip, reason, captureElement, ignoreElements } = creevey.params('${story.id}');`,
    `${indent}  test.skip(skip, reason);`,
    `${indent}  await switchStory(sharedPage, '${story.id}');`,
    `${indent}  const target = captureElement ? sharedPage.locator(captureElement) : sharedPage;`,
    `${indent}  await expect(target).toHaveScreenshot({`,
    `${indent}    mask: ignoreElements.map((selector) => sharedPage.locator(selector)),`,
    `${indent}  });`,
    `${indent}});`,
  ].join("\n");
};

const wrapInDescribes = (segments: string[], tests: string, depth: number): string => {
  const indent = "  ".repeat(depth);
  const [segment, ...rest] = segments;

  if (segment === undefined) {
    return tests;
  }

  return [
    `${indent}test.describe('${escapeSingleQuotes(segment)}', () => {`,
    wrapInDescribes(rest, tests, depth + 1),
    `${indent}});`,
  ].join("\n");
};

export function renderScreenshotSpec(args: {
  config: StrybkConfig;
  title: string;
  stories: RenderableStory[];
  manualRegion: string;
}): string {
  const generatedRegionName = args.config.generatedRegionName ?? "auto-screenshots";
  const segments = splitTitleSegments(args.title);
  const tests = args.stories.map((story) => renderTest(story, segments.length)).join("\n\n");
  const body = wrapInDescribes(segments, tests, 0);

  return `import { test, expect, switchStory } from '@crvy/strybk';\n\n// @generated-begin ${generatedRegionName}\n${body}\n// @generated-end ${generatedRegionName}\n\n${args.manualRegion}`;
}
