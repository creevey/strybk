export interface StorybookGlobals {
  [key: string]: string | number | boolean | null | undefined;
}

export interface StrybkConfig {
  storybookUrl: string;
  storyGlobs: string[];
  resolveSpecPath: (args: { storyFilePath: string }) => string;
  generatedRegionName?: string;
  deleteOrphans?: boolean;
}

export function defineConfig(config: StrybkConfig): StrybkConfig {
  return {
    generatedRegionName: "auto-screenshots",
    deleteOrphans: true,
    ...config,
  };
}
