import type { StrybkConfig } from '../config.js';

export interface RenderableStory {
  id: string;
  name: string;
}

const escapeSingleQuotes = (value: string): string => value.replace(/'/g, "\\'");

export function renderScreenshotSpec(args: {
  config: StrybkConfig;
  fixturesImport: string;
  switchStoryImport: string;
  title: string;
  stories: RenderableStory[];
  manualRegion: string;
}): string {
  const generatedRegionName = args.config.generatedRegionName ?? 'auto-screenshots';
  const tests = args.stories
    .map(
      (story) => `  test('${escapeSingleQuotes(story.name)}', async ({ sharedPage }) => {\n    await switchStory(sharedPage, '${story.id}');\n    await expect(sharedPage).toHaveScreenshot();\n  });`,
    )
    .join('\n\n');

  return `import { test, expect } from '${args.fixturesImport}';\nimport { switchStory } from '${args.switchStoryImport}';\n\n// @generated-begin ${generatedRegionName}\ntest.describe('${escapeSingleQuotes(args.title)}', () => {\n${tests}\n});\n// @generated-end ${generatedRegionName}\n\n${args.manualRegion}`;
}