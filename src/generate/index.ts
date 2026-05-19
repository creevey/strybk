import { readFileSync } from 'node:fs';

import type { StrybkConfig } from '../config.js';

import { discoverStoryFiles } from './discover.js';
import { extractCreeveyMetadata, FILE_POLICY_KEY } from './metadata.js';
import { renderScreenshotSpec } from './render.js';

export interface StoryIndexEntry {
  id: string;
  title: string;
  name: string;
  importPath?: string;
  exportName?: string;
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
  const shouldExtractCreeveyMetadata = args.config.metadataExtractors?.includes('creevey') ?? false;

  return storyFiles.flatMap((storyFile) => {
    const stories = args.indexEntries.filter((entry) => entry.title === storyFile.title);
    const storyMetadata = shouldExtractCreeveyMetadata
      ? extractCreeveyMetadata(readFileSync(storyFile.filePath, 'utf8'))
      : {};
    const isFileSkipped = storyMetadata[FILE_POLICY_KEY]?.skip === true;
    const filteredStories = isFileSkipped
      ? []
      : stories.filter((story) => !story.exportName || storyMetadata[story.exportName]?.skip !== true);
    const outputPath = args.config.resolveSpecPath({ storyFilePath: storyFile.filePath });
    const existing = args.readExistingFile?.(outputPath) ?? null;

    if (filteredStories.length === 0 && existing === null) {
      return [];
    }

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
          stories: filteredStories,
          manualRegion,
        }),
      },
    ];
  });
}