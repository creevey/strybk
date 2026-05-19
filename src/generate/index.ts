import type { StrybkConfig } from '../config.js';

import { discoverStoryFiles } from './discover.js';
import { renderScreenshotSpec } from './render.js';

export interface StoryIndexEntry {
  id: string;
  title: string;
  name: string;
  importPath?: string;
}

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function generateScreenshots(args: {
  config: StrybkConfig;
  indexEntries: StoryIndexEntry[];
  readExistingFile?: (filePath: string) => string | null;
}): Promise<Array<{ outputPath: string; content: string }>> {
  const storyFiles = await discoverStoryFiles(args.config.storyGlobs);
  const generatedRegionName = args.config.generatedRegionName ?? 'auto-screenshots';
  const manualRegionPattern = new RegExp(`// @generated-end ${escapeForRegExp(generatedRegionName)}\\s*([\\s\\S]*)$`);

  return storyFiles.flatMap((storyFile) => {
    const stories = args.indexEntries.filter((entry) => entry.title === storyFile.title);

    if (stories.length === 0) {
      return [];
    }

    const outputPath = args.config.resolveSpecPath({ storyFilePath: storyFile.filePath });
    const existing = args.readExistingFile?.(outputPath) ?? null;
    const manualRegion = existing?.match(manualRegionPattern)?.[1]?.trim() ?? '';
    const harnessImports = args.config.resolveHarnessImports({ outputPath });

    return [
      {
        outputPath,
        content: renderScreenshotSpec({
          config: args.config,
          fixturesImport: harnessImports.fixturesImport,
          switchStoryImport: harnessImports.switchStoryImport,
          title: storyFile.title,
          stories,
          manualRegion,
        }),
      },
    ];
  });
}