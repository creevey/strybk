import type { StrybkConfig } from "../config.js";

export interface RenderableStory {
  id: string;
  name: string;
}

const escapeSingleQuotes = (value: string): string => value.replace(/'/gu, "\\'");

const renderTest = (story: RenderableStory): string =>
  [
    `  test('${escapeSingleQuotes(story.name)}', async ({ sharedPage, creevey }) => {`,
    `    const { skip, reason, captureElement, ignoreElements } = creevey.params('${story.id}');`,
    `    test.skip(skip, reason);`,
    `    await switchStory(sharedPage, '${story.id}');`,
    `    const target = captureElement ? sharedPage.locator(captureElement) : sharedPage;`,
    `    await expect(target).toHaveScreenshot({`,
    `      mask: ignoreElements.map((selector) => sharedPage.locator(selector)),`,
    `    });`,
    `  });`,
  ].join("\n");

export function renderScreenshotSpec(args: {
  config: StrybkConfig;
  title: string;
  stories: RenderableStory[];
  manualRegion: string;
}): string {
  const generatedRegionName = args.config.generatedRegionName ?? "auto-screenshots";
  const tests = args.stories.map(renderTest).join("\n\n");

  return `import { test, expect, switchStory } from '@crvy/strybk';\n\n// @generated-begin ${generatedRegionName}\ntest.describe('${escapeSingleQuotes(args.title)}', () => {\n${tests}\n});\n// @generated-end ${generatedRegionName}\n\n${args.manualRegion}`;
}
