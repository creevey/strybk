import type { StrybkConfig } from "../config.js";

export interface RenderableStory {
  id: string;
  name: string;
}

const escapeSingleQuotes = (value: string): string => value.replace(/'/gu, "\\'");

export function renderScreenshotSpec(args: {
  config: StrybkConfig;
  title: string;
  stories: RenderableStory[];
  manualRegion: string;
}): string {
  const generatedRegionName = args.config.generatedRegionName ?? "auto-screenshots";
  const tests = args.stories
    .map(
      (story) =>
        `  test('${escapeSingleQuotes(story.name)}', async ({ sharedPage }) => {\n    await switchStory(sharedPage, '${story.id}');\n    await expect(sharedPage).toHaveScreenshot();\n  });`,
    )
    .join("\n\n");

  return `import { test, expect, switchStory } from '@crvy/strybk';\n\n// @generated-begin ${generatedRegionName}\ntest.describe('${escapeSingleQuotes(args.title)}', () => {\n${tests}\n});\n// @generated-end ${generatedRegionName}\n\n${args.manualRegion}`;
}
