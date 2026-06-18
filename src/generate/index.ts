import { readFileSync } from "node:fs";

import type { StrybkConfig } from "../config.js";

import { discoverStoryFiles, type StoryFile } from "./discover.js";
import { extractCreeveyMetadata, FILE_POLICY_KEY } from "./metadata.js";
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

const toStoryIdSegment = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();

const isStorySkipped = (
  story: StoryIndexEntry,
  storyMetadata: Record<string, { skip?: boolean }>,
): boolean => {
  if (story.exportName !== undefined) {
    return storyMetadata[story.exportName]?.skip === true;
  }

  const storyIdSegment = story.id.split("--").slice(1).join("--");

  return Object.entries(storyMetadata).some(
    ([exportName, policy]) =>
      policy.skip === true && toStoryIdSegment(exportName) === storyIdSegment,
  );
};

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
  const shouldExtractCreeveyMetadata = args.config.metadataExtractors?.includes("creevey") ?? false;

  return storyFiles.flatMap((storyFile) => {
    const title = resolveStoryTitle(storyFile, args.indexEntries);

    if (title === null) {
      return [];
    }

    const stories = args.indexEntries.filter((entry) => entry.title === title);
    const storyMetadata = shouldExtractCreeveyMetadata
      ? extractCreeveyMetadata(readFileSync(storyFile.filePath, "utf8"))
      : {};
    const isFileSkipped = storyMetadata[FILE_POLICY_KEY]?.skip === true;
    const filteredStories = isFileSkipped
      ? []
      : stories.filter((story) => !isStorySkipped(story, storyMetadata));
    const outputPath = args.config.resolveSpecPath({ storyFilePath: storyFile.filePath });
    const existing = args.readExistingFile?.(outputPath) ?? null;
    const manualRegion = existing?.match(manualRegionPattern)?.[1]?.trim() ?? "";

    if (filteredStories.length === 0 && manualRegion.length === 0) {
      return [];
    }

    return [
      {
        outputPath,
        content: renderScreenshotSpec({
          config: args.config,
          title,
          stories: filteredStories,
          manualRegion,
        }),
      },
    ];
  });
}
