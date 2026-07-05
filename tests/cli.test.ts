import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { HELP_TEXT, parseCliArgs, printHelp, runCli, wantsHelp } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("requires --config for the generate command", () => {
    expect(() => parseCliArgs(["generate"])).toThrow("Missing required --config option");
  });

  it("parses generate options including dry-run", () => {
    expect(parseCliArgs(["generate", "--config", "./strybk.config.ts", "--dry-run"])).toEqual({
      command: "generate",
      configPath: "./strybk.config.ts",
      dryRun: true,
    });
  });
});

describe("help", () => {
  it("documents the generate command and every option", () => {
    expect(HELP_TEXT).toContain("Usage: crvy-strybk generate");
    for (const token of ["--config", "--dry-run", "--help"]) {
      expect(HELP_TEXT).toContain(token);
    }
  });

  it("detects --help and -h anywhere in argv", () => {
    expect(wantsHelp(["--help"])).toBe(true);
    expect(wantsHelp(["-h"])).toBe(true);
    expect(wantsHelp(["generate", "--config", "x", "--help"])).toBe(true);
  });

  it("does not request help when no help flag is present", () => {
    expect(wantsHelp(["generate", "--config", "./strybk.config.ts"])).toBe(false);
  });

  it("prints the help text to stdout", () => {
    const spy = vi.spyOn(console, "log");

    printHelp();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe(HELP_TEXT);
    spy.mockRestore();
  });
});

describe("runCli", () => {
  const originalCwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const tempDirs: string[] = [];

  afterEach(() => {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("discovers stories when the config lives in another workspace and cwd differs (monorepo)", async () => {
    const root = mkdtempSync(join(tmpdir(), "strybk-monorepo-"));
    tempDirs.push(root);

    const packageDir = join(root, "packages", "react-components");
    const storyFilePath = join(packageDir, "src", "Button.stories.tsx");
    mkdirSync(join(packageDir, "src"), { recursive: true });
    writeFileSync(
      storyFilePath,
      "export default { title: 'Button' };\nexport const Default = {};\n",
    );

    const consumerDir = join(root, "playwright-tests");
    mkdirSync(consumerDir, { recursive: true });

    writeFileSync(
      join(packageDir, "strybk.config.ts"),
      [
        "export default {",
        "  storybookUrl: 'http://localhost:6060',",
        "  storyGlobs: ['src/**/*.stories.tsx'],",
        "  resolveSpecPath: ({ storyFilePath }) => storyFilePath.replace(/\\.stories\\.tsx$/, '.spec.ts'),",
        "};",
      ].join("\n"),
    );

    process.chdir(consumerDir);

    globalThis.fetch = ((input: URL | RequestInfo | string) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("index.json")) {
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            entries: {
              "button--default": {
                type: "story",
                id: "button--default",
                title: "Button",
                name: "Default",
                exportName: "Default",
                importPath: "./src/Button.stories.tsx",
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }) as typeof fetch;

    const outputs = await runCli([
      "generate",
      "--config",
      "../packages/react-components/strybk.config.ts",
      "--dry-run",
    ]);

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.outputPath).toBe(
      realpathSync(storyFilePath).replace(/\.stories\.tsx$/u, ".spec.ts"),
    );
    expect(outputs[0]?.content).toContain("test.describe('Button'");
  });
});
