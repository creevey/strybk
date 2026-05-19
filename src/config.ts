export interface StorybookGlobals {
  [key: string]: string | number | boolean | null | undefined;
}

export interface StrybkConfig {
  storybookUrl: string;
  storyGlobs: string[];
  resolveSpecPath: (args: { storyFilePath: string }) => string;
  resolveHarnessImports: (args: { outputPath: string }) => {
    fixturesImport: string;
    switchStoryImport: string;
  };
  generatedRegionName?: string;
  deleteOrphans?: boolean;
  metadataExtractors?: "creevey"[];
}

export function defineConfig(config: StrybkConfig): StrybkConfig {
  return {
    generatedRegionName: "auto-screenshots",
    deleteOrphans: true,
    metadataExtractors: [],
    ...config,
  };
}
