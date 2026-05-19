import { readFileSync } from "node:fs";

import { glob } from "glob";

export interface StoryFile {
  filePath: string;
  title: string;
}

export async function discoverStoryFiles(patterns: string[]): Promise<StoryFile[]> {
  const files = await glob(patterns, { absolute: true });

  return files.flatMap((filePath) => {
    const content = readFileSync(filePath, "utf8");
    const titleMatch = content.match(/title:\s*['"]([^'"]+)['"]/u);

    if (!titleMatch) {
      return [];
    }

    return [{ filePath, title: titleMatch[1] }];
  });
}
