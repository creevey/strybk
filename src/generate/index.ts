import type { StrybkConfig } from "../config.js";

import { discoverStoryFiles, type StoryFile } from "./discover.js";
import { renderScreenshotSpec } from "./render.js";

export interface StoryIndexEntry {
  id: string;
  title: string;
  name: string;
  importPath: string;
  exportName?: string;
}

const normalizePath = (value: string): string => value.replace(/\\/gu, "/").replace(/^\.\//u, "");

const matchesByImportPath = (filePath: string, importPath: string): boolean => {
  const normalizedImport = normalizePath(importPath);
  const normalizedFile = normalizePath(filePath);

  return normalizedFile === normalizedImport || normalizedFile.endsWith(`/${normalizedImport}`);
};

const resolveStoryTitle = (
  storyFile: StoryFile,
  indexEntries: StoryIndexEntry[],
): string | null => {
  const pathMatch = indexEntries.find((entry) =>
    matchesByImportPath(storyFile.filePath, entry.importPath),
  );

  return pathMatch?.title ?? null;
};

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export async function generateScreenshots(args: {
  config: StrybkConfig;
  indexEntries: StoryIndexEntry[];
  readExistingFile?: (filePath: string) => string | null;
  configDir?: string;
}): Promise<Array<{ outputPath: string; content: string }>> {
  const storyFiles = await discoverStoryFiles(
    args.config.storyGlobs,
    args.configDir === undefined ? {} : { cwd: args.configDir },
  );
  const generatedRegionName = args.config.generatedRegionName ?? "auto-screenshots";
  const manualRegionPattern = new RegExp(
    `// @generated-end ${escapeForRegExp(generatedRegionName)}\\s*([\\s\\S]*)$`,
    "u",
  );

  return storyFiles.flatMap((storyFile) => {
    const title = resolveStoryTitle(storyFile, args.indexEntries);

    if (title === null) {
      return [];
    }

    const stories = args.indexEntries.filter((entry) => entry.title === title);
    const outputPath = args.config.resolveSpecPath({ storyFilePath: storyFile.filePath });
    const existing = args.readExistingFile?.(outputPath) ?? null;
    const manualRegion = existing?.match(manualRegionPattern)?.[1]?.trim() ?? "";

    if (stories.length === 0 && manualRegion.length === 0) {
      return [];
    }

    return [
      {
        outputPath,
        content: renderScreenshotSpec({
          config: args.config,
          title,
          stories,
          manualRegion,
        }),
      },
    ];
  });
}
