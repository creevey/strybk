import { glob } from "glob";

export interface StoryFile {
  filePath: string;
}

export async function discoverStoryFiles(
  patterns: string[],
  options: { cwd?: string } = {},
): Promise<StoryFile[]> {
  const cwd = options.cwd ?? process.cwd();
  const files = await glob(patterns, { absolute: true, cwd });

  return files.map((filePath) => ({ filePath }));
}
