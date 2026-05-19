#!/usr/bin/env node

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { StrybkConfig } from "./config.js";
import { generateScreenshots, type StoryIndexEntry } from "./generate/index.js";

export interface GenerateCliArgs {
  command: "generate";
  configPath: string;
  dryRun: boolean;
}

interface StoryIndexPayload {
  entries?: Record<string, unknown>;
  stories?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asUnknown = (value: unknown): unknown => value;

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const readExistingFile = (filePath: string): string | null => {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
};

const resolveConfigExport = (moduleNamespace: unknown): unknown => {
  if (!isRecord(moduleNamespace)) {
    return moduleNamespace;
  }

  if ("default" in moduleNamespace) {
    return moduleNamespace.default;
  }

  if ("config" in moduleNamespace) {
    return moduleNamespace.config;
  }

  return moduleNamespace;
};

const isStrybkConfig = (value: unknown): value is StrybkConfig =>
  isRecord(value) &&
  typeof value.storybookUrl === "string" &&
  Array.isArray(value.storyGlobs) &&
  typeof value.resolveSpecPath === "function" &&
  typeof value.resolveHarnessImports === "function";

const getIndexEntriesRecord = (payload: unknown): Record<string, unknown> => {
  if (!isRecord(payload)) {
    throw new Error("Storybook index response must be an object");
  }

  const indexPayload = payload as StoryIndexPayload;
  const entries = indexPayload.entries ?? indexPayload.stories;

  if (!isRecord(entries)) {
    throw new Error("Storybook index response must include an entries object");
  }

  return entries;
};

const toStoryIndexEntry = (value: unknown): StoryIndexEntry | null => {
  if (!isRecord(value)) {
    return null;
  }

  if ("type" in value && value.type !== undefined && value.type !== "story") {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    name: value.name,
    importPath: typeof value.importPath === "string" ? value.importPath : undefined,
    exportName: typeof value.exportName === "string" ? value.exportName : undefined,
  };
};

const resolveStorybookIndexUrl = (storybookUrl: string): URL =>
  new URL("./index.json", storybookUrl.endsWith("/") ? storybookUrl : `${storybookUrl}/`);

const loadConfig = async (configPath: string): Promise<StrybkConfig> => {
  const resolvedConfigPath = resolve(configPath);
  const moduleNamespace: unknown = await import(pathToFileURL(resolvedConfigPath).href);
  const config = resolveConfigExport(moduleNamespace);

  if (!isStrybkConfig(config)) {
    throw new Error(`Config module '${resolvedConfigPath}' must export a StrybkConfig object`);
  }

  return config;
};

const fetchStoryIndex = async (config: StrybkConfig): Promise<StoryIndexEntry[]> => {
  const indexUrl = resolveStorybookIndexUrl(config.storybookUrl);
  const response = await fetch(indexUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${indexUrl.toString()}: ${response.status} ${response.statusText}`.trim(),
    );
  }

  const payload = asUnknown(await response.json());
  const entries = getIndexEntriesRecord(payload);

  return Object.values(entries)
    .map(toStoryIndexEntry)
    .filter((entry): entry is StoryIndexEntry => entry !== null);
};

const writeGeneratedFiles = (outputs: Array<{ outputPath: string; content: string }>): void => {
  for (const output of outputs) {
    mkdirSync(dirname(output.outputPath), { recursive: true });
    writeFileSync(output.outputPath, output.content);
  }
};

export function parseCliArgs(argv: string[]): GenerateCliArgs {
  const [command, ...options] = argv;

  if (command !== "generate") {
    throw new Error("Expected 'generate' command");
  }

  let configPath: string | undefined;
  let dryRun = false;

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];

    if (option === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (option === "--config") {
      const nextOption = options[index + 1];

      if (!nextOption || nextOption.startsWith("--")) {
        throw new Error("Missing value for --config option");
      }

      configPath = nextOption;
      index += 1;
      continue;
    }

    if (option.startsWith("--config=")) {
      configPath = option.slice("--config=".length);

      if (configPath.length === 0) {
        throw new Error("Missing value for --config option");
      }

      continue;
    }

    throw new Error(`Unknown option: ${option}`);
  }

  if (configPath === undefined) {
    throw new Error("Missing required --config option");
  }

  return {
    command: "generate",
    configPath,
    dryRun,
  };
}

export async function runCli(
  argv: string[],
): Promise<Array<{ outputPath: string; content: string }>> {
  const cliArgs = parseCliArgs(argv);
  const config = await loadConfig(cliArgs.configPath);
  const indexEntries = await fetchStoryIndex(config);
  const outputs = await generateScreenshots({
    config,
    indexEntries,
    readExistingFile,
  });

  if (!cliArgs.dryRun) {
    writeGeneratedFiles(outputs);
  }

  return outputs;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const outputs = await runCli(argv);
    const dryRun = argv.includes("--dry-run");
    const suffix = dryRun ? " (dry run)" : "";

    console.log(`Generated ${outputs.length} file(s)${suffix}.`);
  } catch (error) {
    console.error(toErrorMessage(error));
    process.exitCode = 1;
  }
}

const maybeEntrypoint = process.argv[1];

if (maybeEntrypoint !== undefined) {
  try {
    const currentFilePath = realpathSync(fileURLToPath(import.meta.url));
    const invokedFilePath = realpathSync(resolve(maybeEntrypoint));

    if (currentFilePath === invokedFilePath) {
      void main();
    }
  } catch {
    // Ignore resolution failures during module import.
  }
}
