export type StorybookGlobals = Readonly<Record<string, string | number | boolean | null>>;

export type StrybkConfig = Readonly<{
  storybookUrl?: string;
  storyGlobs?: readonly string[];
  globals?: StorybookGlobals;
}>;

export const defineConfig = <TConfig extends StrybkConfig>(config: TConfig): TConfig => config;